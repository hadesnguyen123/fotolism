import { useState, useEffect, useMemo } from 'react'
import { useAppStore } from '../store/appStore'
import { fotolismApi, isBrowser, mockApi } from '../lib/api'
import { generateStripComposite, preparePrintImageForDNP } from '../lib/canvasCompositor'
import {
  FILE_PREFIX_SHOT,
  FILE_PREFIX_FINAL,
  FILE_PREFIX_TIMELAPSE,
  SESSION_FOLDER_PREFIX,
  BRAND_NAME,
  DEFAULT_GDRIVE_FOLDER_ID,
  DEFAULT_GDRIVE_WEBHOOK_URL,
} from '../lib/constants'
import QRCode from 'qrcode'
import { QrCode, Loader2, AlertCircle, RefreshCw, Image as ImageIcon, Film, Printer, Download } from 'lucide-react'
import { cloudSyncService } from '../services/cloudSyncService'
import './ReviewScreen.css'

export default function ReviewScreen() {
  const {
    session,
    setSessionPrinted,
    setScreen,
    clearSession,
    eventConfig,
    selectedLayout,
    selectedFilter,
    selectedTheme,
    placedStickers,
    selectedFrameSize,
    selectedCopies,
    setGdriveUrl,
    isSyncingDrive,
    setIsSyncingDrive,
    driveSyncDone,
    setDriveSyncDone,
    driveSyncError: syncError,
    setDriveSyncError: setSyncError,
    cloudFolderUrl,
    setCloudFolderUrl,
  } = useAppStore()

  const defaultCopies = session?.paidCopies || selectedCopies || (selectedFrameSize === '2x6' ? 2 : 1)

  const [activeMediaView, setActiveMediaView] = useState<'strip' | 'timelapse'>('strip')
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [printCopies, setPrintCopies] = useState<number>(defaultCopies)
  const [isPrinting, setIsPrinting] = useState<boolean>(false)
  const [compositeStripUrl, setCompositeStripUrl] = useState<string>('')
  const [isGeneratingComposite, setIsGeneratingComposite] = useState<boolean>(true)

  // ── Google Drive & Local Session Folder ──
  const [subfolderName] = useState<string>(() => {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    const timeStr = `${pad(now.getHours())}h${pad(now.getMinutes())}`
    return `${SESSION_FOLDER_PREFIX}_${dateStr}_${timeStr}`
  })

  const photos = useMemo(() => {
    if (session?.photos && session.photos.length > 0) return session.photos
    return []
  }, [session?.photos])

  const isSelfboothMode = eventConfig.captureMode === 'selfbooth'

  // Link đích của mã QR: Ưu tiên link thư mục Google Drive vừa được tạo khi bật gdriveEnabled
  const webGalleryUrl = `http://localhost:3000/gallery/${session?.sessionId || subfolderName}`
  const targetCloudUrl = (eventConfig.gdriveEnabled && cloudFolderUrl)
    ? cloudFolderUrl
    : (session?.storageUrl || (isSelfboothMode ? webGalleryUrl : `https://pub-r2.fotolism.vn/sessions/${subfolderName}/${FILE_PREFIX_FINAL}_${selectedFrameSize}.jpg`))

  // Tạo mã QR Code CHỈ KHI link hợp lệ và đã đồng bộ xong hoàn toàn
  useEffect(() => {
    if (!targetCloudUrl || (eventConfig.gdriveEnabled && !driveSyncDone)) {
      setQrDataUrl('')
      return
    }

    QRCode.toDataURL(targetCloudUrl, {
      margin: 1,
      width: 260,
      color: { dark: '#2d2426', light: '#ffffff' },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Error generating QR:', err))
  }, [targetCloudUrl, eventConfig.gdriveEnabled, driveSyncDone])

  // Sinh bản ghép canvas composite chất lượng cao & Đẩy ảnh lên Google Drive
  useEffect(() => {
    let isMounted = true

    async function processSessionMedia() {
      try {
        if (isSelfboothMode) {
          // Chế độ Selfbooth: Không cần ghép khung in ấn
          setIsGeneratingComposite(false)

          // Nếu đã hoàn thành đồng bộ từ bước chụp thì không cần gọi lại
          if (driveSyncDone && cloudFolderUrl && !cloudFolderUrl.includes(DEFAULT_GDRIVE_FOLDER_ID)) {
            return
          }

          // Nếu đang trong quá trình đồng bộ nền từ CaptureScreen thì chờ đợi
          if (isSyncingDrive) {
            return
          }

          if (eventConfig.gdriveEnabled && eventConfig.gdriveAutoSync) {
            setIsSyncingDrive(true)
            const filesToUpload: Array<{ name: string; dataUrl: string }> = []
            photos.forEach((p, idx) => {
              const dataUrl = p.compositedPath || p.enhancedPath || p.rawPath
              if (dataUrl && dataUrl.trim().length > 0) {
                filesToUpload.push({
                  name: `${FILE_PREFIX_SHOT}_${idx + 1}.jpg`,
                  dataUrl,
                })
              }
            })

            const effectiveSelfTimelapse =
              session?.timelapseDataUrl ||
              (session?.timelapseUrl?.startsWith('data:') ? session.timelapseUrl : null)
            if (effectiveSelfTimelapse) {
              filesToUpload.push({
                name: `${FILE_PREFIX_TIMELAPSE}.webm`,
                dataUrl: effectiveSelfTimelapse,
              })
            }

            const effectiveWebhookUrl = eventConfig.gdriveWebhookUrl || DEFAULT_GDRIVE_WEBHOOK_URL
            console.log('[ReviewScreen] Uploading Selfbooth to Google Drive Webhook:', effectiveWebhookUrl, 'files count:', filesToUpload.length)

            const api = isBrowser ? mockApi : fotolismApi
            let res = await api.storage.uploadDriveSession({
              parentFolderId: eventConfig.gdriveFolderId || DEFAULT_GDRIVE_FOLDER_ID,
              subfolderName,
              files: filesToUpload,
              webhookUrl: effectiveWebhookUrl,
            })

            // Direct Renderer Fallback cho Selfbooth: Gọi trực tiếp từ Renderer nếu IPC trả về lỗi/fallback
            if (!res.success || !res.data?.cloudFolderUrl || res.data.cloudFolderUrl.includes(DEFAULT_GDRIVE_FOLDER_ID)) {
              console.log('[ReviewScreen] Selfbooth IPC returned fallback/error, trying direct renderer upload...')
              try {
                const validDataFiles = filesToUpload.filter((f) => f.dataUrl && f.dataUrl.startsWith('data:'))
                const directRes = await fetch(effectiveWebhookUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                  body: JSON.stringify({
                    action: 'create_session_folder',
                    parentFolderId: eventConfig.gdriveFolderId || DEFAULT_GDRIVE_FOLDER_ID,
                    folderName: subfolderName,
                    files: validDataFiles,
                  }),
                  redirect: 'follow',
                })
                const directJson = await directRes.json()
                if (directJson && directJson.success && directJson.folderUrl) {
                  console.log('[ReviewScreen] Selfbooth direct renderer upload SUCCESS:', directJson.folderUrl)
                  res = {
                    success: true,
                    data: {
                      localDir: '',
                      cloudFolderUrl: directJson.folderUrl,
                      cloudFolderId: directJson.folderId || '',
                      subfolderName,
                      filesCount: directJson.filesCount || validDataFiles.length,
                    },
                  }
                }
              } catch (directErr: any) {
                console.warn('[ReviewScreen] Selfbooth direct fetch fallback error:', directErr.message)
              }
            }

            if (isMounted && res.success && res.data?.cloudFolderUrl && !res.data.cloudFolderUrl.includes(DEFAULT_GDRIVE_FOLDER_ID)) {
              setCloudFolderUrl(res.data.cloudFolderUrl)
              setGdriveUrl(res.data.cloudFolderUrl)
              setSyncError(null)
              setIsSyncingDrive(false)
              setDriveSyncDone(true)
            } else if (isMounted) {
              setIsSyncingDrive(false)
              setDriveSyncDone(false)
              setSyncError(res.error || 'Chưa thể tạo thư mục hoặc tải ảnh lên Google Drive.')
            }
          } else if (isMounted) {
            setIsSyncingDrive(false)
            setDriveSyncDone(true)
          }
          return
        }

        // Chế độ Photobooth truyền thống
        setIsGeneratingComposite(true)
        const photoUrls = photos.map((p) => p.compositedPath || p.enhancedPath || p.rawPath).filter(Boolean)
        const stripUrl = await generateStripComposite({
          photos: photoUrls,
          frameSize: selectedFrameSize,
          layout: selectedLayout,
          theme: selectedTheme,
          stickers: placedStickers,
          filter: selectedFilter,
          eventName: eventConfig.eventName,
          eventDate: eventConfig.date,
        })

        if (!isMounted) return

        setCompositeStripUrl(stripUrl)
        setIsGeneratingComposite(false)

        // Tự động tạo thư mục con & đẩy toàn bộ ảnh lên Google Drive (và lưu cục bộ)
        if (eventConfig.gdriveEnabled && eventConfig.gdriveAutoSync) {
          setIsSyncingDrive(true)

          const filesToUpload: Array<{ name: string; dataUrl: string }> = []

          // 1. Dải ảnh in hoàn chỉnh
          if (stripUrl) {
            filesToUpload.push({
              name: `${FILE_PREFIX_FINAL}_${selectedFrameSize}.jpg`,
              dataUrl: stripUrl,
            })
          }

          // 2. Các ảnh chụp đơn lẻ
          photos.forEach((p, idx) => {
            const dataUrl = p.compositedPath || p.enhancedPath || p.rawPath
            if (dataUrl && dataUrl.trim().length > 0) {
              filesToUpload.push({
                name: `${FILE_PREFIX_SHOT}_${idx + 1}.jpg`,
                dataUrl,
              })
            }
          })

          // 3. Video Timelapse nếu có dữ liệu dataUrl hoặc blob
          let effectiveTimelapse =
            session?.timelapseDataUrl ||
            (session?.timelapseUrl?.startsWith('data:') ? session.timelapseUrl : null)

          if (!effectiveTimelapse && session?.timelapseUrl?.startsWith('blob:')) {
            try {
              const blobRes = await fetch(session.timelapseUrl)
              const blob = await blobRes.blob()
              effectiveTimelapse = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onloadend = () => resolve(reader.result as string)
                reader.onerror = reject
                reader.readAsDataURL(blob)
              })
            } catch (blobErr) {
              console.warn('[ReviewScreen] Blob to dataUrl conversion fallback failed:', blobErr)
            }
          }

          if (effectiveTimelapse) {
            filesToUpload.push({
              name: `${FILE_PREFIX_TIMELAPSE}.webm`,
              dataUrl: effectiveTimelapse,
            })
          }

          const effectiveWebhookUrl = eventConfig.gdriveWebhookUrl || DEFAULT_GDRIVE_WEBHOOK_URL
          console.log('[ReviewScreen] Uploading Photobooth to Google Drive Webhook:', effectiveWebhookUrl, 'files count:', filesToUpload.length)

          const api = isBrowser ? mockApi : fotolismApi
          let res = await api.storage.uploadDriveSession({
            parentFolderId: eventConfig.gdriveFolderId || DEFAULT_GDRIVE_FOLDER_ID,
            subfolderName,
            files: filesToUpload,
            webhookUrl: effectiveWebhookUrl,
          })

          // Direct Renderer Fallback: Bỏ qua phụ thuộc Electron Main Process cũ, gọi trực tiếp từ Renderer
          if (!res.success || !res.data?.cloudFolderUrl || res.data.cloudFolderUrl.includes(DEFAULT_GDRIVE_FOLDER_ID)) {
            console.log('[ReviewScreen] Photobooth IPC returned fallback/error, trying direct renderer upload...')
            try {
              const directRes = await fetch(effectiveWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                  action: 'create_session_folder',
                  folderName: subfolderName,
                  files: filesToUpload,
                }),
              })
              const directJson = await directRes.json()
              if (directJson && directJson.success && directJson.folderUrl) {
                console.log('[ReviewScreen] Photobooth direct renderer upload SUCCESS:', directJson.folderUrl)
                res = {
                  success: true,
                  data: {
                    localDir: '',
                    cloudFolderUrl: directJson.folderUrl,
                    cloudFolderId: directJson.folderId || '',
                    subfolderName,
                    filesCount: directJson.filesCount || filesToUpload.length,
                  },
                }
              }
            } catch (directErr: any) {
              console.warn('[ReviewScreen] Photobooth direct fetch fallback error:', directErr.message)
            }
          }

          if (isMounted && res.success && res.data?.cloudFolderUrl && !res.data.cloudFolderUrl.includes(DEFAULT_GDRIVE_FOLDER_ID)) {
            setCloudFolderUrl(res.data.cloudFolderUrl)
            setGdriveUrl(res.data.cloudFolderUrl)
            setSyncError(null)
            setIsSyncingDrive(false)
            setDriveSyncDone(true)
          } else if (isMounted) {
            setIsSyncingDrive(false)
            setDriveSyncDone(false)
            setSyncError(res.error || 'Chưa thể tạo thư mục hoặc tải ảnh lên Google Drive.')
          }
        } else if (isMounted) {
          setIsSyncingDrive(false)
          setDriveSyncDone(true)
        }
      } catch (err: any) {
        console.error('Failed to generate strip composite or upload to Drive:', err)
        if (isMounted) {
          setIsGeneratingComposite(false)
          setIsSyncingDrive(false)
          setDriveSyncDone(false)
          setSyncError(err.message || 'Lỗi xử lý dải ảnh và tải lên Google Drive.')
        }
      }
    }

    processSessionMedia()
    return () => {
      isMounted = false
    }
  }, [
    photos,
    selectedFrameSize,
    selectedLayout,
    selectedTheme,
    placedStickers,
    selectedFilter,
    eventConfig,
    subfolderName,
    session?.timelapseUrl,
    setGdriveUrl,
  ])

  // Lưu phiên chụp vào Outbox để đồng bộ lên Cloud CMS
  const recordSessionToOutbox = useMemo(() => () => {
    if (!session) return
    const is4x6 = selectedFrameSize === '4x6'
    const layoutType = isSelfboothMode ? 'selfbooth' : (is4x6 ? '4x6' : '2x6')
    const storageUrl =
      session.storageUrl ||
      cloudFolderUrl ||
      (isSelfboothMode
        ? `https://pub-r2.fotolism.vn/sessions/${subfolderName}/`
        : `https://pub-r2.fotolism.vn/sessions/${subfolderName}/${FILE_PREFIX_FINAL}_${selectedFrameSize}.jpg`)

    cloudSyncService.queueSession({
      id: session.sessionId || `ses_${Date.now()}`,
      session_code: `JB${Date.now().toString().slice(-6)}`,
      pin_code: session.pinCode || null,
      customer_name: session.customerName || null,
      customer_phone: session.customerPhone || null,
      kiosk_id: 'kiosk_01',
      branch_id: 'branch_01',
      layout_type: layoutType,
      copies: isSelfboothMode ? 0 : printCopies,
      total_amount: session.paidAmount || (isSelfboothMode ? 50000 : (is4x6 ? 70000 : 50000)),
      payment_method: (session.paymentMethod?.toLowerCase() === 'cash' ? 'cash' : 'vietqr') as 'vietqr' | 'cash',
      coupon_code: null,
      paper_consumed: isSelfboothMode ? 0 : printCopies,
      storage_url: storageUrl,
      drive_url: storageUrl,
      status: 'completed',
      created_at: new Date().toISOString(),
      photos: photos.map((p) => p.compositedPath || p.enhancedPath || p.rawPath || ''),
    })
  }, [session, selectedFrameSize, printCopies, photos, cloudFolderUrl, subfolderName])

  function handleFinish() {
    recordSessionToOutbox()
    clearSession()
    setScreen('idle')
  }

  async function handlePrint() {
    // Lệnh in chỉ được thực hiện 1 lần trong 1 phiên chụp:
    // Chặn tuyệt đối nếu đang in hoặc phiên này đã từng in!
    if (isPrinting || session?.hasPrinted) return

    setIsPrinting(true)
    setSessionPrinted()

    try {
      const api = isBrowser ? mockApi : fotolismApi
      let pathToPrint = compositeStripUrl || photos[0]?.compositedPath || ''

      if (pathToPrint) {
        pathToPrint = await preparePrintImageForDNP(pathToPrint)
      }

      // Số tờ vật lý cần in: Khổ 2x6 kép 1 tờ chứa 2 dải, khổ 4x6 1 tờ chứa 1 ảnh
      const physicalSheets = selectedFrameSize === '2x6' ? Math.max(1, Math.ceil(printCopies / 2)) : printCopies

      const res = await api.print.send(pathToPrint, physicalSheets)
      if (res && res.success) {
        setIsPrinting(false)
      } else {
        console.error('Print failed:', res?.error)
        setIsPrinting(false)
      }
    } catch (err) {
      console.error('Print failed:', err)
      setIsPrinting(false)
    }
  }

  async function handleRetryUpload() {
      setSyncError(null)
      setIsSyncingDrive(true)
      setDriveSyncDone(false)

      try {
        const filesToUpload: Array<{ name: string; dataUrl: string }> = []
        if (!isSelfboothMode && compositeStripUrl) {
          filesToUpload.push({
            name: `${FILE_PREFIX_FINAL}_${selectedFrameSize}.jpg`,
            dataUrl: compositeStripUrl,
          })
        }

        photos.forEach((p, idx) => {
          const dataUrl = p.compositedPath || p.enhancedPath || p.rawPath
          if (dataUrl && dataUrl.trim().length > 0) {
            filesToUpload.push({
              name: `${FILE_PREFIX_SHOT}_${idx + 1}.jpg`,
              dataUrl,
            })
          }
        })

        let effectiveTimelapse =
          session?.timelapseDataUrl ||
          (session?.timelapseUrl?.startsWith('data:') ? session.timelapseUrl : null)

        if (!effectiveTimelapse && session?.timelapseUrl?.startsWith('blob:')) {
          try {
            const blobRes = await fetch(session.timelapseUrl)
            const blob = await blobRes.blob()
            effectiveTimelapse = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onloadend = () => resolve(reader.result as string)
              reader.onerror = reject
              reader.readAsDataURL(blob)
            })
          } catch (blobErr) {
            console.warn('[ReviewScreen] Retry blob to dataUrl conversion fallback failed:', blobErr)
          }
        }

        if (effectiveTimelapse) {
          filesToUpload.push({
            name: `${FILE_PREFIX_TIMELAPSE}.webm`,
            dataUrl: effectiveTimelapse,
          })
        }

        const effectiveWebhookUrl = eventConfig.gdriveWebhookUrl || DEFAULT_GDRIVE_WEBHOOK_URL
        console.log('[ReviewScreen] Retrying upload to Google Drive Webhook:', effectiveWebhookUrl, 'files count:', filesToUpload.length)

        const api = isBrowser ? mockApi : fotolismApi
        let res = await api.storage.uploadDriveSession({
          parentFolderId: eventConfig.gdriveFolderId || DEFAULT_GDRIVE_FOLDER_ID,
          subfolderName,
          files: filesToUpload,
          webhookUrl: effectiveWebhookUrl,
        })

        if (!res.success || !res.data?.cloudFolderUrl || res.data.cloudFolderUrl.includes(DEFAULT_GDRIVE_FOLDER_ID)) {
          console.log('[ReviewScreen] Retry IPC returned fallback/error, trying direct renderer upload...')
          try {
            const validDataFiles = filesToUpload.filter((f) => f.dataUrl && f.dataUrl.startsWith('data:'))
            const directRes = await fetch(effectiveWebhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({
                action: 'create_session_folder',
                parentFolderId: eventConfig.gdriveFolderId || DEFAULT_GDRIVE_FOLDER_ID,
                folderName: subfolderName,
                files: validDataFiles,
              }),
              redirect: 'follow',
            })
            const directJson = await directRes.json()
            if (directJson && directJson.success && directJson.folderUrl) {
              console.log('[ReviewScreen] Retry direct renderer upload SUCCESS:', directJson.folderUrl)
              res = {
                success: true,
                data: {
                  localDir: '',
                  cloudFolderUrl: directJson.folderUrl,
                  cloudFolderId: directJson.folderId || '',
                  subfolderName,
                  filesCount: directJson.filesCount || validDataFiles.length,
                },
              }
            }
          } catch (directErr: any) {
            console.warn('[ReviewScreen] Retry direct fetch fallback error:', directErr.message)
          }
        }

        if (res.success && res.data?.cloudFolderUrl && !res.data.cloudFolderUrl.includes(DEFAULT_GDRIVE_FOLDER_ID)) {
          setCloudFolderUrl(res.data.cloudFolderUrl)
          setGdriveUrl(res.data.cloudFolderUrl)
          setSyncError(null)
          setIsSyncingDrive(false)
          setDriveSyncDone(true)
        } else {
          setIsSyncingDrive(false)
          setDriveSyncDone(false)
          setSyncError(res.error || 'Chưa thể tạo thư mục hoặc tải ảnh lên Google Drive.')
        }
      } catch (err: any) {
        console.error('[ReviewScreen] Retry upload exception:', err)
        setIsSyncingDrive(false)
        setDriveSyncDone(false)
        setSyncError(err.message || 'Lỗi kết nối tải ảnh lên Drive.')
      }
    }

    function handleDownloadTimelapse() {
      const videoSrc = session?.timelapseUrl || session?.timelapseDataUrl
      if (!videoSrc) return
      const a = document.createElement('a')
      a.href = videoSrc
      a.download = `${FILE_PREFIX_TIMELAPSE}_${Date.now()}.webm`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }

    function handleOpenDriveBrowser() {
      if (cloudFolderUrl) {
        window.open(cloudFolderUrl, '_blank')
      }
    }

    const isGrid =
      selectedLayout.previewType === '4_grid' ||
      selectedLayout.previewType === '6_grid' ||
      selectedLayout.previewType === '8_grid'

    return (
      <div className="review-screen-pastel" id="review-screen">
        {/* ── Top Header: Tiêu đề trung tâm ── */}
        <header className="review-header-pastel">
          <div style={{ width: 48 }} />

          <div className="review-header-center">
            <h1 className="review-header-title">Ảnh Hoàn Thiện</h1>
          </div>

          <div style={{ width: 48 }} />
        </header>

        {/* Main Content */}
        {isSelfboothMode ? (
          /* ── CHẾ ĐỘ SELFBOOTH: CHỈ HIỆN DUY NHẤT QR VỚI NÚT 'QUÉT QR TẢI ẢNH' KHI ĐÃ ĐẨY XONG ẢNH ── */
          <main className="selfbooth-review-minimal">
            {isSyncingDrive || (eventConfig.gdriveEnabled && !driveSyncDone && !syncError) ? (
              <div className="selfbooth-minimal-card animate-pop" style={{ padding: '44px 32px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Loader2 size={54} className="camera-connecting-spin" strokeWidth={2.4} style={{ color: 'var(--brand-primary, #502A1D)' }} />
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 800, color: 'var(--brand-primary, #502A1D)', margin: '22px 0 8px' }}>
                  Đang tải ảnh lên Google Drive...
                </h2>
                <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary, #70594F)', maxWidth: 360, margin: 0, lineHeight: 1.5 }}>
                  Hệ thống đang tự động tạo thư mục và đẩy toàn bộ ảnh của bạn lên Google Drive. Vui lòng đợi trong giây lát để nhận mã QR.
                </p>
                <div className="selfbooth-loading-pulse-bar">
                  <div className="selfbooth-loading-pulse-fill" />
                </div>
              </div>
            ) : syncError ? (
              <div className="selfbooth-minimal-card animate-pop" style={{ padding: '36px 28px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                <AlertCircle size={48} color="#ef4444" strokeWidth={2.2} />
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 800, color: '#ef4444', margin: 0 }}>
                  Chưa thể tạo thư mục tải ảnh
                </h2>
                <p style={{ fontSize: '0.9rem', color: '#70594F', maxWidth: 380, margin: 0, lineHeight: 1.5 }}>
                  {syncError}
                </p>
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <button
                    className="btn-selfbooth-modal-cancel"
                    style={{ padding: '8px 24px', fontSize: '0.92rem' }}
                    onClick={handleFinish}
                  >
                    Kết thúc
                  </button>
                  <button
                    className="btn-selfbooth-modal-confirm"
                    style={{ padding: '8px 24px', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: 6 }}
                    onClick={handleRetryUpload}
                  >
                    <RefreshCw size={16} />
                    Thử lại
                  </button>
                </div>
              </div>
            ) : (
              <div className="selfbooth-minimal-card animate-pop">
                <button
                  className="btn-selfbooth-qr-top"
                  onClick={handleOpenDriveBrowser}
                  title="Quét QR tải ảnh"
                >
                  <QrCode size={24} strokeWidth={2.2} />
                  <span>Quét QR tải ảnh</span>
                </button>

                <div className="selfbooth-qr-img-box-large">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="Mã QR tải ảnh Selfbooth" className="selfbooth-qr-img-large" />
                  ) : (
                    <div className="selfbooth-qr-loading-large">Đang tạo mã QR...</div>
                  )}
                </div>
              </div>
            )}
          </main>
        ) : (
          /* Main 2-Column Content CHO PHOTOBOOTH */
          <main className="review-content-pastel">
            {/* Left: Photobooth Strip Frame & Timelapse Media View */}
            <section className="strip-frame-container">
              {/* Media View Mode Selector */}
              <div className="review-media-tabs">
                <button
                  className={`review-media-tab-btn ${activeMediaView === 'strip' ? 'active' : ''}`}
                  onClick={() => setActiveMediaView('strip')}
                >
                  <ImageIcon size={18} strokeWidth={2.2} />
                  <span>Dải Ảnh In ({selectedFrameSize.toUpperCase()})</span>
                </button>
                <button
                  className={`review-media-tab-btn ${activeMediaView === 'timelapse' ? 'active' : ''}`}
                  onClick={() => setActiveMediaView('timelapse')}
                >
                  <Film size={18} strokeWidth={2.2} />
                  <span>Video Timelapse ({eventConfig.timelapseSpeed || 2.5}x)</span>
                </button>
              </div>

              {/* VIEW 1: DẢI ẢNH IN */}
              {activeMediaView === 'strip' && (
                <div className="frame-preview-wrapper fade-in">
                  {isGeneratingComposite ? (
                    <div className="composite-generating-loader">
                      <span className="loader-spinner-pink" />
                      <span style={{ fontWeight: 700, color: 'var(--color-pink-primary)' }}>
                        Đang hoàn thiện dải ảnh in...
                      </span>
                    </div>
                  ) : compositeStripUrl ? (
                    <div className="final-rendered-strip-box animate-pop">
                      <img
                        src={compositeStripUrl}
                        alt={`${BRAND_NAME} Final Print`}
                        className={`final-rendered-strip-img ${selectedFrameSize === '2x6' ? 'strip-2x6-view' : 'postcard-4x6-view'}`}
                      />
                    </div>
                  ) : (
                    /* Fallback preview nếu chưa tải xong canvas */
                    <div
                      className={`photobooth-strip-paper ${selectedFrameSize === '4x6' ? 'frame-4x6-postcard' : 'frame-2x6-strip'}`}
                      style={{
                        background: selectedTheme.bgGradient || selectedTheme.bgColor,
                        borderColor: selectedTheme.borderColor,
                      }}
                    >
                      <div className="strip-header-deco">
                        <span>{selectedTheme.decorations ? selectedTheme.decorations[0] : '🌸'}</span>
                        <span className="strip-event-tag" style={{ color: selectedTheme.textColor }}>
                          {eventConfig.eventName}
                        </span>
                        <span>{selectedTheme.decorations ? selectedTheme.decorations[1] : '✨'}</span>
                      </div>

                      <div className={`strip-photos-grid ${isGrid ? 'grid-mode' : 'stack-mode'}`}>
                        {photos.map((photo, index) => (
                          <div key={photo.id || index} className="strip-photo-item">
                            <img
                              src={photo.compositedPath || photo.enhancedPath || photo.rawPath}
                              alt={`Shot ${index + 1}`}
                              style={{ filter: selectedFilter.cssFilter }}
                            />
                          </div>
                        ))}
                      </div>

                      <div className="strip-footer-deco">
                        <span className="strip-logo-text" style={{ color: selectedTheme.textColor }}>
                          {BRAND_NAME}
                        </span>
                        <span className="strip-date-text" style={{ color: selectedTheme.textColor }}>
                          {eventConfig.date}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* VIEW 2: VIDEO TIMELAPSE */}
              {activeMediaView === 'timelapse' && (
                <div className="timelapse-preview-wrapper fade-in">
                  {session?.timelapseUrl || session?.timelapseDataUrl ? (
                    <div className="timelapse-player-card">
                      <video
                        src={session?.timelapseUrl || session?.timelapseDataUrl || ''}
                        autoPlay
                        muted
                        loop
                        playsInline
                        controls
                        className="timelapse-video-element"
                        ref={(el) => {
                          if (el) el.playbackRate = eventConfig.timelapseSpeed || 2.5
                        }}
                      />
                      <div className="timelapse-meta-bar">
                        <span>Tốc độ: {eventConfig.timelapseSpeed || 2.5}x</span>
                      </div>
                      <button
                        className="download-strip-btn"
                        style={{ marginTop: 12, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                        onClick={handleDownloadTimelapse}
                      >
                        <Download size={18} strokeWidth={2.2} />
                        <span>Tải Video Timelapse</span>
                      </button>
                    </div>
                  ) : (
                    <div className="timelapse-empty-state">
                      <Film size={54} strokeWidth={1.8} color="var(--brand-primary, #502A1D)" />
                      <h3 style={{ margin: '10px 0 6px', color: 'var(--color-pink-primary)' }}>
                        Video Timelapse
                      </h3>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Right: Instant QR & Print */}
            <section className="review-delivery-deck">
              {/* Card QR Tải Ảnh - Đồng bộ phong cách tối giản với Selfbooth */}
              <div className="delivery-card-pastel animate-pop">
                <button
                  className="btn-selfbooth-qr-top"
                  onClick={handleOpenDriveBrowser}
                  title="Quét QR tải ảnh"
                  style={{ width: '100%' }}
                >
                  <QrCode size={22} strokeWidth={2.2} />
                  <span>Quét QR tải ảnh</span>
                </button>

                {isSyncingDrive || (eventConfig.gdriveEnabled && !driveSyncDone && !syncError) ? (
                  <div style={{ padding: '24px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Loader2 size={42} className="camera-connecting-spin" strokeWidth={2.4} style={{ color: 'var(--brand-primary, #502A1D)' }} />
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--brand-primary, #502A1D)', margin: '16px 0 6px' }}>
                      Đang tải ảnh lên Google Drive...
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #70594F)', maxWidth: 320, margin: 0, lineHeight: 1.4 }}>
                      Hệ thống đang tự động tải ảnh và video lên Google Drive. Vui lòng đợi trong giây lát để nhận mã QR.
                    </p>
                    <div className="selfbooth-loading-pulse-bar" style={{ width: 220, marginTop: 16 }}>
                      <div className="selfbooth-loading-pulse-fill" />
                    </div>
                  </div>
                ) : syncError ? (
                  <div style={{ padding: '20px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <AlertCircle size={38} color="#ef4444" strokeWidth={2.2} />
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800, color: '#ef4444', margin: 0 }}>
                      Chưa thể tạo thư mục tải ảnh
                    </h3>
                    <p style={{ fontSize: '0.84rem', color: '#70594F', maxWidth: 320, margin: 0, lineHeight: 1.4 }}>
                      {syncError}
                    </p>
                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                      <button
                        className="btn-selfbooth-modal-confirm"
                        style={{ padding: '8px 20px', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6 }}
                        onClick={handleRetryUpload}
                      >
                        <RefreshCw size={15} />
                        <span>Thử lại</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                    <div className="selfbooth-qr-img-box-large" style={{ padding: 12, borderRadius: 20 }}>
                      {qrDataUrl ? (
                        <img
                          src={qrDataUrl}
                          alt="Mã QR tải ảnh Photobooth"
                          style={{ width: 190, height: 190, display: 'block', borderRadius: 10 }}
                        />
                      ) : (
                        <div style={{ width: 190, height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#70594F', fontSize: '0.9rem' }}>
                          Đang tạo mã QR...
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Card In Ảnh */}
              <div className="delivery-card-pastel">
                <div className="card-title-pastel">
                  <Printer size={20} strokeWidth={2.2} color="var(--brand-primary, #502A1D)" />
                  <span>In Ảnh</span>
                </div>

                <div className="print-copies-row">
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Số bản in:</span>
                    {session?.paidCopies && (
                      <span style={{ fontSize: '0.76rem', color: '#059669', fontWeight: 600 }}>
                        Đã thanh toán: {session.paidCopies} {selectedFrameSize === '2x6' ? 'dải' : 'tấm'}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <button
                      className="copies-btn-pastel"
                      onClick={() => {
                        const step = selectedFrameSize === '2x6' ? 2 : 1
                        const min = selectedFrameSize === '2x6' ? 2 : 1
                        setPrintCopies((c) => Math.max(min, c - step))
                      }}
                      disabled={Boolean(session?.hasPrinted) || isPrinting || printCopies <= (selectedFrameSize === '2x6' ? 2 : 1)}
                    >
                      -
                    </button>
                    <span style={{ fontWeight: 900, fontSize: '1.2rem', color: 'var(--color-pink-primary)' }}>
                      {printCopies} {selectedFrameSize === '2x6' ? 'dải' : 'tấm'}
                    </span>
                    <button
                      className="copies-btn-pastel"
                      onClick={() => {
                        const step = selectedFrameSize === '2x6' ? 2 : 1
                        setPrintCopies((c) => Math.min(12, c + step))
                      }}
                      disabled={Boolean(session?.hasPrinted) || isPrinting || printCopies >= 12}
                    >
                      +
                    </button>
                  </div>
                </div>

                <button
                  className="print-btn-pastel"
                  id="print-button"
                  disabled={Boolean(session?.hasPrinted) || isPrinting || isGeneratingComposite}
                  onClick={handlePrint}
                >
                  In ảnh
                </button>
              </div>
            </section>
          </main>
        )}

        {/* ── Bottom Bar: Cách lề mặc định 100px với 2 chữ 'Quay lại' và 'Tiếp tục' ── */}
        {(Boolean(qrDataUrl) || Boolean(syncError)) && (
          <footer className="kiosk-bottom-nav-bar review-bottom-bar-pastel animate-pop">
            <button
              className="kiosk-nav-btn btn-nav-back"
              onClick={() => setScreen('select-filter')}
              title="Quay lại"
              aria-label="Quay lại"
            >
              Quay lại
            </button>

            <button
              className="kiosk-nav-btn btn-nav-next"
              id="finish-button"
              onClick={handleFinish}
              title="Tiếp tục"
              aria-label="Tiếp tục"
            >
              Tiếp tục
            </button>
          </footer>
        )}
      </div>
    )
  }
