import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { loadSavedEventConfig, DEFAULT_EVENT_CONFIG } from '../src/store/slices/adminSlice'
import { useAppStore, type CapturedPhoto } from '../src/store/appStore'
import {
    LS_EVENT_CONFIG_KEY,
    FILE_PREFIX_SHOT,
    FILE_PREFIX_TIMELAPSE,
    SESSION_FOLDER_PREFIX,
} from '../src/lib/constants'

describe('Media delivery after provider removal', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('removes retired saved settings while preserving prices and unrelated options', () => {
        let saved = JSON.stringify({
            ...DEFAULT_EVENT_CONFIG,
            price2x6: 123000,
            customOption: 'keep',
            gdriveEnabled: true,
            gdriveWebhookUrl: 'retired-endpoint',
        })
        vi.stubGlobal('window', {})
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => key === LS_EVENT_CONFIG_KEY ? saved : null,
            setItem: (_key: string, value: string) => { saved = value },
        })
        const config = loadSavedEventConfig()
        expect(config.price2x6).toBe(123000)
        expect(JSON.parse(saved).customOption).toBe('keep')
        expect(Object.keys(JSON.parse(saved)).some(key => key.startsWith('gdrive'))).toBe(false)
    })

    it('resets failed delivery and gallery state for the next customer', () => {
        const store = useAppStore.getState()
        store.setIsSyncingMedia(true)
        store.setMediaSyncDone(true)
        store.setMediaSyncError('offline')
        store.setGalleryUrl('/gallery/previous-session')
        store.clearSession()
        const next = useAppStore.getState()
        expect(next.isSyncingMedia).toBe(false)
        expect(next.mediaSyncDone).toBe(false)
        expect(next.mediaSyncError).toBeNull()
        expect(next.galleryUrl).toBeNull()
    })
})

describe('Session recovery', () => {
    beforeEach(() => useAppStore.getState().clearSession())
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

})

describe('TL-01: Quy trình Xử lý Video Timelapse Hậu Trường (Background Timelapse Flow)', () => {
    beforeEach(() => {
        useAppStore.getState().clearSession()
    })

    it('setTimelapseUrl lưu đồng thời Blob URL (xem trực tiếp) và DataUrl Base64 (upload media)', () => {
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

    it('Cấu trúc mảng upload media đính kèm chính xác file ảnh và file video timelapse .webm', () => {
        useAppStore.getState().startNewSession()

        const mockPhotos: CapturedPhoto[] = [
            {
                id: 'shot_1',
                rawPath: 'data:image/jpeg;base64,/9j/photo1',
                enhancedPath: '',
                compositedPath: 'data:image/jpeg;base64,/9j/photo1',
                timestamp: 1,
            },
            {
                id: 'shot_2',
                rawPath: 'data:image/jpeg;base64,/9j/photo2',
                enhancedPath: '',
                compositedPath: 'data:image/jpeg;base64,/9j/photo2',
                timestamp: 2,
            },
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

        const effectiveTimelapse =
            session?.timelapseDataUrl ||
            (session?.timelapseUrl?.startsWith('data:')
                ? session.timelapseUrl
                : null)
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
        expect(
            filesToUpload[2].dataUrl.startsWith('data:video/webm;base64,')
        ).toBe(true)
    })

    it('Định dạng tên thư mục con session tuân thủ chuẩn Fotolism_YYYY-MM-DD_HHhmm_session', () => {
        const now = new Date()
        const pad = (n: number) => (n < 10 ? '0' : '') + n
        const timeStamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}h${pad(now.getMinutes())}`
        const sessionId = 'session_1793386335479_m5seq'
        const subfolderName = `${SESSION_FOLDER_PREFIX}_${timeStamp}_${sessionId.slice(-6)}`

        expect(subfolderName).toMatch(
            /^Fotolism_\d{4}-\d{2}-\d{2}_\d{2}h\d{2}_[a-z0-9_]+$/i
        )
    })

})
