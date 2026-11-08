import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import { generateStripComposite } from '../lib/canvasCompositor'
import { fotolismApi, mockApi } from '../lib/api'
import {
  DEFAULT_GDRIVE_FOLDER_ID,
  DEFAULT_GDRIVE_WEBHOOK_URL,
  FILE_PREFIX_FINAL,
  FILE_PREFIX_SHOT,
  FILE_PREFIX_TIMELAPSE,
} from '../lib/constants'
import QRCode from 'qrcode'
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, ArrowRight } from 'lucide-react'
import { BRAND_LOGO_SRC } from '../lib/brandLogo'
import './ProcessingScreen.css'

export default function ProcessingScreen() {
  const {
    session,
    setCompositeStripUrl,
    setGdriveUrl,
    setCloudFolderUrl,
    selectedFrameSize,
    selectedLayout,
    selectedTheme,
    selectedFilter,
    placedStickers,
    eventConfig,
    setScreen,
  } = useAppStore()

  const [compositeDone, setCompositeDone] = useState(false)
  const [uploadDone, setUploadDone] = useState(false)
  const [qrDone, setQrDone] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isRetrying, setIsRetrying] = useState(false)

  const isBrowser = typeof window !== 'undefined' && !(window as any).electronAPI
  const isSelfbooth = eventConfig.captureMode === 'selfbooth'
  const isStarted = useRef(false)

  // Đặt tên thư mục phiên chụp chuẩn
  const subfolderName = useRef(() => {
    const now = new Date()
    const pad = (n: number) => (n < 10 ? '0' : '') + n
    const timeStamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}h${pad(now.getMinutes())}`
    const prefix = isSelfbooth ? 'Fotolism_Selfbooth' : 'Fotolism_Photobooth'
    return `${prefix}_${timeStamp}_${(session?.sessionId || 'session').slice(-6)}`
  }).current()

  async function processMediaAndUpload() {
    try {
      setErrorMessage(null)

      const photos = session?.photos || []
      let stripUrl: string | null = null

      if (isSelfbooth) {
        // Selfbooth: Không ghép khung in ấn, chuẩn bị kho ảnh chụp tự do
        setCompositeDone(true)
      } else {
        // Photobooth: Ghép Khung Ảnh Thành Phẩm (Composite Strip)
        const photoUrls = photos.map((p) => p.compositedPath || p.enhancedPath || p.rawPath).filter(Boolean)
        console.log('[ProcessingScreen] Generating final composite strip with', photoUrls.length, 'photos...')
        stripUrl = await generateStripComposite({
          photos: photoUrls,
          frameSize: selectedFrameSize,
          layout: selectedLayout,
          theme: selectedTheme,
          stickers: placedStickers,
          filter: selectedFilter,
          eventName: eventConfig.eventName,
          eventDate: eventConfig.date,
        })

        if (stripUrl) {
          setCompositeStripUrl(stripUrl)
          setCompositeDone(true)
        } else {
          throw new Error('Không thể tạo dải ảnh thành phẩm.')
        }
      }

      // ── BƯỚC 2: Upload Lên Cloud / Google Drive ──
      const effectiveWebhookUrl = eventConfig.gdriveWebhookUrl || DEFAULT_GDRIVE_WEBHOOK_URL
      const parentFolderId = eventConfig.gdriveFolderId || DEFAULT_GDRIVE_FOLDER_ID
      const api = isBrowser ? mockApi : fotolismApi

      let cloudFolder = useAppStore.getState().cloudFolderUrl || null

      if (eventConfig.gdriveEnabled && eventConfig.gdriveAutoSync) {
        const filesToUpload: Array<{ name: string; dataUrl: string }> = []

        // Dải ảnh in hoàn chỉnh (chỉ cho Photobooth nếu có stripUrl)
        if (!isSelfbooth && stripUrl) {
          filesToUpload.push({
            name: `${FILE_PREFIX_FINAL}_${selectedFrameSize}.jpg`,
            dataUrl: stripUrl,
          })
        }

        // Đẩy toàn bộ ảnh chụp đơn lẻ (cả Photobooth và kho ảnh Selfbooth)
        const sourcePhotos = (session?.selfboothLibrary && session.selfboothLibrary.length > 0)
          ? session.selfboothLibrary
          : photos

        sourcePhotos.forEach((p, idx) => {
          const dataUrl = p.compositedPath || p.enhancedPath || p.rawPath
          if (dataUrl && dataUrl.trim().length > 0) {
            filesToUpload.push({
              name: `${FILE_PREFIX_SHOT}_${idx + 1}.jpg`,
              dataUrl,
            })
          }
        })

        const effectiveTimelapse =
          session?.timelapseDataUrl ||
          (session?.timelapseUrl?.startsWith('data:') ? session.timelapseUrl : null)

        if (effectiveTimelapse) {
          filesToUpload.push({
            name: `${FILE_PREFIX_TIMELAPSE}.webm`,
            dataUrl: effectiveTimelapse,
          })
        }

        console.log('[ProcessingScreen] Uploading session media to Drive...', filesToUpload.length, 'files')

        try {
          const res = await api.storage.uploadDriveSession({
            parentFolderId,
            subfolderName,
            files: filesToUpload,
            webhookUrl: effectiveWebhookUrl,
          })

          if (res?.success && res.data?.cloudFolderUrl && !res.data.cloudFolderUrl.includes(DEFAULT_GDRIVE_FOLDER_ID)) {
            cloudFolder = res.data.cloudFolderUrl
          } else {
            // Direct renderer fallback nếu IPC chính lỗi
            const directRes = await fetch(effectiveWebhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({
                action: 'create_session_folder',
                parentFolderId,
                folderName: subfolderName,
                files: filesToUpload.filter((f) => f.dataUrl && f.dataUrl.startsWith('data:')),
              }),
            })
            const directJson = await directRes.json()
            if (directJson && directJson.success && directJson.folderUrl) {
              cloudFolder = directJson.folderUrl
            }
          }
        } catch (uploadErr) {
          console.warn('[ProcessingScreen] Upload to Drive error, activating offline fallback:', uploadErr)
        }
      }

      // Lưu URL thư mục Cloud
      if (cloudFolder) {
        setCloudFolderUrl(cloudFolder)
        setGdriveUrl(cloudFolder)
        useAppStore.getState().setDriveSyncDone(true)
        useAppStore.getState().setIsSyncingDrive(false)
      }
      setUploadDone(true)

      // ── BƯỚC 3: Tạo Mã QR Tải Ảnh ──
      const qrTarget = cloudFolder || `https://fotolism.vn/q/${session?.sessionId || Date.now()}`
      try {
        await QRCode.toDataURL(qrTarget, {
          margin: 1,
          width: 260,
          color: { dark: '#2d2426', light: '#ffffff' },
        })
        setQrDone(true)
      } catch (qrErr) {
        console.warn('[ProcessingScreen] QR generation warning:', qrErr)
        setQrDone(true)
      }

      // ── BƯỚC 4: Chuyển Sang Màn Hình Review Cuối Cùng ──
      setTimeout(() => {
        setScreen('review')
      }, 600)
    } catch (err: any) {
      console.error('[ProcessingScreen] Process failed:', err)
      setErrorMessage(err.message || 'Lỗi xử lý ảnh. Vui lòng thử lại.')
    } finally {
      setIsRetrying(false)
    }
  }

  useEffect(() => {
    if (!isStarted.current) {
      isStarted.current = true
      processMediaAndUpload()
    }
  }, [])

  function handleRetry() {
    setIsRetrying(true)
    processMediaAndUpload()
  }

  function handleProceedOffline() {
    // Luôn đảm bảo Offline-First: Chuyển sang review để khách nhận mã QR hoặc in tại buồng
    setScreen('review')
  }

  return (
    <div className="processing-screen-container animate-fade-in">
      <img src={BRAND_LOGO_SRC} alt="fotolism" className="processing-fixed-brand" />

      <div className="processing-card animate-pop">
        <div className="processing-icon-orbit">
          <Loader2 className="processing-spinner" size={60} strokeWidth={2.5} />
        </div>

        <h1 className="processing-title">Đang Xử Lý Bộ Ảnh</h1>
        <p className="processing-desc">
          Vui lòng đợi giây lát, hệ thống đang tải ảnh và chuẩn bị mã tải về...
        </p>

        <div className="processing-steps-list">
          <div className={`proc-step-item ${compositeDone ? 'done' : 'active'}`}>
            <div className="proc-step-indicator">
              {compositeDone ? (
                <CheckCircle2 size={20} color="#16A34A" />
              ) : (
                <Loader2 size={18} className="step-spin" />
              )}
            </div>
            <span className="proc-step-text">{isSelfbooth ? 'Chuẩn bị kho ảnh Selfbooth' : 'Ghép khung & bộ lọc màu thành phẩm'}</span>
          </div>

          <div className={`proc-step-item ${uploadDone ? 'done' : compositeDone ? 'active' : 'pending'}`}>
            <div className="proc-step-indicator">
              {uploadDone ? (
                <CheckCircle2 size={20} color="#16A34A" />
              ) : compositeDone ? (
                <Loader2 size={18} className="step-spin" />
              ) : (
                <div className="proc-step-dot" />
              )}
            </div>
            <span className="proc-step-text">Tải ảnh lên Cloud & Google Drive</span>
          </div>

          <div className={`proc-step-item ${qrDone ? 'done' : uploadDone ? 'active' : 'pending'}`}>
            <div className="proc-step-indicator">
              {qrDone ? (
                <CheckCircle2 size={20} color="#16A34A" />
              ) : uploadDone ? (
                <Loader2 size={18} className="step-spin" />
              ) : (
                <div className="proc-step-dot" />
              )}
            </div>
            <span className="proc-step-text">Tạo mã QR tải ảnh về điện thoại</span>
          </div>
        </div>

        {errorMessage && (
          <div className="proc-error-box animate-fade-in">
            <AlertCircle size={20} color="#DC2626" />
            <p>{errorMessage}</p>
          </div>
        )}

        {errorMessage && (
          <div className="proc-action-row animate-fade-in">
            <button
              className="btn-proc-retry"
              onClick={handleRetry}
              disabled={isRetrying}
            >
              <RefreshCw size={18} className={isRetrying ? 'step-spin' : ''} />
              <span>Thử lại</span>
            </button>
            <button
              className="btn-proc-offline"
              onClick={handleProceedOffline}
            >
              <span>Tiếp tục (Offline)</span>
              <ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
