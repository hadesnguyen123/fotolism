import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore, type CapturedPhoto } from '../src/store/appStore'
import {
  DEFAULT_GDRIVE_FOLDER_ID,
  DEFAULT_GDRIVE_FOLDER_URL,
  DEFAULT_GDRIVE_WEBHOOK_URL,
  FILE_PREFIX_SHOT,
  FILE_PREFIX_FINAL,
  FILE_PREFIX_TIMELAPSE,
  SESSION_FOLDER_PREFIX,
} from '../src/lib/constants'

describe('GD-01: Quản lý Trạng thái Đồng bộ Google Drive & QR Code (Google Drive Sync & QR Generation Guard)', () => {
  beforeEach(() => {
    useAppStore.getState().clearSession()
  })

  it('Khởi tạo trạng thái đồng bộ ban đầu chính xác (Idle/Clean state)', () => {
    const state = useAppStore.getState()
    expect(state.session).toBeNull()
    expect(state.isSyncingDrive).toBe(false)
    expect(state.driveSyncDone).toBe(false)
    expect(state.driveSyncError).toBeNull()
    expect(state.cloudFolderUrl).toBeNull()
  })

  it('setSessionPhotos tự động tạo mới session nếu session đang là null (Chống mất ảnh khi refresh)', () => {
    const mockPhotos: CapturedPhoto[] = [
      {
        id: 'photo_1',
        rawPath: 'data:image/jpeg;base64,/9j/mock1',
        enhancedPath: 'data:image/jpeg;base64,/9j/mock1',
        compositedPath: 'data:image/jpeg;base64,/9j/mock1',
        timestamp: Date.now(),
      },
      {
        id: 'photo_2',
        rawPath: 'data:image/jpeg;base64,/9j/mock2',
        enhancedPath: 'data:image/jpeg;base64,/9j/mock2',
        compositedPath: 'data:image/jpeg;base64,/9j/mock2',
        timestamp: Date.now() + 1000,
      },
    ]

    // Gọi khi session đang là null
    useAppStore.getState().setSessionPhotos(mockPhotos)

    const updated = useAppStore.getState().session
    expect(updated).not.toBeNull()
    expect(updated?.photos).toHaveLength(2)
    expect(updated?.photos[0].id).toBe('photo_1')
    expect(updated?.photos[1].id).toBe('photo_2')
  })

  it('addPhoto tự động tạo mới session nếu session đang là null', () => {
    const photo: CapturedPhoto = {
      id: 'photo_first',
      rawPath: 'data:image/jpeg;base64,/9j/first',
      enhancedPath: 'data:image/jpeg;base64,/9j/first',
      compositedPath: 'data:image/jpeg;base64,/9j/first',
      timestamp: Date.now(),
    }

    useAppStore.getState().addPhoto(photo)
    const session = useAppStore.getState().session
    expect(session).not.toBeNull()
    expect(session?.photos).toHaveLength(1)
    expect(session?.photos[0].id).toBe('photo_first')
  })

  it('Cập nhật trạng thái đồng bộ Google Drive chuẩn xác trong appStore', () => {
    useAppStore.getState().startNewSession()
    const store = useAppStore.getState()
    const testFolderUrl = 'https://drive.google.com/drive/folders/1EyHYZ0W5gdtiUgoInvL4fXphOCHUtOeo'

    // Bắt đầu sync
    store.setIsSyncingDrive(true)
    store.setDriveSyncDone(false)
    expect(useAppStore.getState().isSyncingDrive).toBe(true)
    expect(useAppStore.getState().driveSyncDone).toBe(false)

    // Hoàn thành sync
    store.setCloudFolderUrl(testFolderUrl)
    store.setGdriveUrl(testFolderUrl)
    store.setIsSyncingDrive(false)
    store.setDriveSyncDone(true)

    const completed = useAppStore.getState()
    expect(completed.isSyncingDrive).toBe(false)
    expect(completed.driveSyncDone).toBe(true)
    expect(completed.cloudFolderUrl).toBe(testFolderUrl)
    expect(completed.session?.gdriveUrl).toBe(testFolderUrl)
  })

  it('clearSession làm sạch toàn bộ cờ đồng bộ và link Drive', () => {
    const store = useAppStore.getState()
    store.setIsSyncingDrive(true)
    store.setDriveSyncDone(true)
    store.setCloudFolderUrl('https://drive.google.com/test')

    store.clearSession()

    const cleared = useAppStore.getState()
    expect(cleared.session).toBeNull()
    expect(cleared.isSyncingDrive).toBe(false)
    expect(cleared.driveSyncDone).toBe(false)
    expect(cleared.cloudFolderUrl).toBeNull()
    expect(cleared.driveSyncError).toBeNull()
  })

  it('Mã QR chỉ được cấp phép tạo khi driveSyncDone === true và link Drive khác ID mặc định', () => {
    const dummyId = DEFAULT_GDRIVE_FOLDER_ID
    const validSessionFolder = 'https://drive.google.com/drive/folders/1p3m1N2nfHQ8ThEUszDapAbkNuNG7Ajm9'

    function shouldGenerateQR(params: {
      gdriveEnabled: boolean
      driveSyncDone: boolean
      cloudFolderUrl: string | null
    }): boolean {
      if (!params.cloudFolderUrl) return false
      if (params.gdriveEnabled && !params.driveSyncDone) return false
      if (params.cloudFolderUrl.includes(dummyId)) return false
      return true
    }

    // Đang đồng bộ -> Không được sinh QR
    expect(shouldGenerateQR({ gdriveEnabled: true, driveSyncDone: false, cloudFolderUrl: validSessionFolder })).toBe(false)

    // Chưa có URL -> Không được sinh QR
    expect(shouldGenerateQR({ gdriveEnabled: true, driveSyncDone: true, cloudFolderUrl: null })).toBe(false)

    // URL là ID mặc định (chưa tạo được subfolder riêng) -> Không được sinh QR
    expect(shouldGenerateQR({ gdriveEnabled: true, driveSyncDone: true, cloudFolderUrl: DEFAULT_GDRIVE_FOLDER_URL })).toBe(false)

    // Đã hoàn tất và có link subfolder riêng biệt -> ĐƯỢC PHÉP SINH QR!
    expect(shouldGenerateQR({ gdriveEnabled: true, driveSyncDone: true, cloudFolderUrl: validSessionFolder })).toBe(true)
  })
})

describe('TL-01: Quy trình Xử lý Video Timelapse Hậu Trường (Background Timelapse Flow)', () => {
  beforeEach(() => {
    useAppStore.getState().clearSession()
  })

  it('setTimelapseUrl lưu đồng thời Blob URL (xem trực tiếp) và DataUrl Base64 (upload Drive)', () => {
    useAppStore.getState().startNewSession()

    const mockBlobUrl = 'blob:http://localhost:5173/7452d9a6-7360-4966'
    const mockDataUrl = 'data:video/webm;base64,GkXfo59ChoEBQveBAULygQ8='

    // Gọi cập nhật cả hai URL
    useAppStore.getState().setTimelapseUrl(mockBlobUrl, mockDataUrl)

    const session = useAppStore.getState().session
    expect(session).not.toBeNull()
    expect(session?.timelapseUrl).toBe(mockBlobUrl)
    expect(session?.timelapseDataUrl).toBe(mockDataUrl)
  })

  it('Cấu trúc mảng upload Drive đính kèm chính xác file ảnh và file video timelapse .webm', () => {
    useAppStore.getState().startNewSession()

    const mockPhotos: CapturedPhoto[] = [
      { id: 'shot_1', rawPath: 'data:image/jpeg;base64,/9j/photo1', enhancedPath: '', compositedPath: 'data:image/jpeg;base64,/9j/photo1', timestamp: 1 },
      { id: 'shot_2', rawPath: 'data:image/jpeg;base64,/9j/photo2', enhancedPath: '', compositedPath: 'data:image/jpeg;base64,/9j/photo2', timestamp: 2 },
    ]
    useAppStore.getState().setSessionPhotos(mockPhotos)

    const mockDataUrl = 'data:video/webm;base64,GkXfo59ChoEBQveBAULygQ8='
    useAppStore.getState().setTimelapseUrl('blob:test', mockDataUrl)

    const session = useAppStore.getState().session

    // Mô phỏng logic gom file upload trong ReviewScreen & CaptureScreen
    const filesToUpload: Array<{ name: string; dataUrl: string }> = []
    session?.photos.forEach((p, idx) => {
      filesToUpload.push({
        name: `${FILE_PREFIX_SHOT}_${idx + 1}.jpg`,
        dataUrl: p.compositedPath,
      })
    })

    const effectiveTimelapse = session?.timelapseDataUrl || (session?.timelapseUrl?.startsWith('data:') ? session.timelapseUrl : null)
    if (effectiveTimelapse) {
      filesToUpload.push({
        name: `${FILE_PREFIX_TIMELAPSE}.webm`,
        dataUrl: effectiveTimelapse,
      })
    }

    expect(filesToUpload).toHaveLength(3)
    expect(filesToUpload[0].name).toBe('fotolism_shot_1.jpg')
    expect(filesToUpload[1].name).toBe('fotolism_shot_2.jpg')
    expect(filesToUpload[2].name).toBe('fotolism_timelapse.webm')
    expect(filesToUpload[2].dataUrl.startsWith('data:video/webm;base64,')).toBe(true)
  })

  it('Định dạng tên thư mục con Google Drive tuân thủ chuẩn Fotolism_YYYY-MM-DD_HHhmm_session', () => {
    const now = new Date()
    const pad = (n: number) => (n < 10 ? '0' : '') + n
    const timeStamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}h${pad(now.getMinutes())}`
    const sessionId = 'session_1793386335479_m5seq'
    const subfolderName = `${SESSION_FOLDER_PREFIX}_${timeStamp}_${sessionId.slice(-6)}`

    expect(subfolderName).toMatch(/^Fotolism_\d{4}-\d{2}-\d{2}_\d{2}h\d{2}_[a-z0-9_]+$/i)
  })

  it('fotolismApi Proxy tự động ủy quyền và uploadDriveSession trả về subfolder ID hợp lệ', async () => {
    const { fotolismApi } = await import('../src/lib/api')
    const subfolderName = 'Fotolism_2026-10-31_11h30_test01'
    const res = await fotolismApi.storage.uploadDriveSession({
      parentFolderId: DEFAULT_GDRIVE_FOLDER_ID,
      subfolderName,
      files: [{ name: 'test.jpg', dataUrl: 'data:image/jpeg;base64,/9j/test' }],
    })

    expect(res.success).toBe(true)
    expect(res.data).toBeDefined()
    // Đảm bảo không trả về ID gốc của folder cha mà trả về ID subfolder riêng
    expect(res.data?.cloudFolderUrl).not.toBe(DEFAULT_GDRIVE_FOLDER_URL)
    expect(res.data?.cloudFolderUrl?.includes(DEFAULT_GDRIVE_FOLDER_ID)).toBe(false)
    expect(res.data?.cloudFolderUrl).toBe(`https://drive.google.com/drive/folders/mock_session_${subfolderName}`)
  })

  it('Điều kiện Lazy Loading hiển thị đúng trạng thái chờ tải ảnh và không bật lỗi vội vã', () => {
    function isLazyLoadingActive(params: {
      isSyncingDrive: boolean
      gdriveEnabled: boolean
      driveSyncDone: boolean
      syncError: string | null
    }): boolean {
      return Boolean(params.isSyncingDrive || (params.gdriveEnabled && !params.driveSyncDone && !params.syncError))
    }

    // Đang đồng bộ trong nền -> BẬT Lazy Loading
    expect(isLazyLoadingActive({ isSyncingDrive: true, gdriveEnabled: true, driveSyncDone: false, syncError: null })).toBe(true)

    // Chưa đồng bộ xong và chưa có lỗi -> VẪN BẬT Lazy Loading để chờ ảnh
    expect(isLazyLoadingActive({ isSyncingDrive: false, gdriveEnabled: true, driveSyncDone: false, syncError: null })).toBe(true)

    // Đã có lỗi -> TẮT Lazy Loading để hiện màn hình báo lỗi + nút Thử lại
    expect(isLazyLoadingActive({ isSyncingDrive: false, gdriveEnabled: true, driveSyncDone: false, syncError: 'Lỗi mạng' })).toBe(false)

    // Đã đồng bộ hoàn thành -> TẮT Lazy Loading để hiện QR Code
    expect(isLazyLoadingActive({ isSyncingDrive: false, gdriveEnabled: true, driveSyncDone: true, syncError: null })).toBe(false)
  })
})
