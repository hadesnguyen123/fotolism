import { useState, useEffect, useMemo } from 'react'
import { useAppStore } from '../store/appStore'
import { fotolismApi, isBrowser, mockApi } from '../lib/api'
import { generateStripComposite } from '../lib/canvasCompositor'
import {
  FILE_PREFIX_SHOT,
  FILE_PREFIX_FINAL,
  FILE_PREFIX_TIMELAPSE,
  SESSION_FOLDER_PREFIX,
  BRAND_NAME,
  DEFAULT_GDRIVE_FOLDER_ID,
  DEFAULT_GDRIVE_FOLDER_URL,
  DEFAULT_IDLE_TIMEOUT_SECONDS,
} from '../lib/constants'
import QRCode from 'qrcode'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { cloudSyncService } from '../services/cloudSyncService'
import './ReviewScreen.css'

export default function ReviewScreen() {
  const {
    session,
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
  } = useAppStore()

  const defaultCopies = session?.paidCopies || selectedCopies || (selectedFrameSize === '2x6' ? 2 : 1)

  const [activeMediaView, setActiveMediaView] = useState<'strip' | 'timelapse'>('strip')
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [printCopies, setPrintCopies] = useState<number>(defaultCopies)
  const [isPrinting, setIsPrinting] = useState<boolean>(false)
  const [printSuccess, setPrintSuccess] = useState<boolean>(false)
  const [timeLeft, setTimeLeft] = useState<number>(
    eventConfig.idleTimeoutSeconds || DEFAULT_IDLE_TIMEOUT_SECONDS
  )
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
  const [cloudFolderUrl, setCloudFolderUrl] = useState<string>(
    eventConfig.gdriveFolderUrl || DEFAULT_GDRIVE_FOLDER_URL
  )
  const [isSyncingDrive, setIsSyncingDrive] = useState<boolean>(false)
  const [driveSyncDone, setDriveSyncDone] = useState<boolean>(false)
  const [localFolderDir, setLocalFolderDir] = useState<string>('')

  const photos = useMemo(() => {
    if (session?.photos && session.photos.length > 0) return session.photos
    return [
      { id: '1', rawPath: '', enhancedPath: '', compositedPath: '', timestamp: 1 },
      { id: '2', rawPath: '', enhancedPath: '', compositedPath: '', timestamp: 2 },
      { id: '3', rawPath: '', enhancedPath: '', compositedPath: '', timestamp: 3 },
      { id: '4', rawPath: '', enhancedPath: '', compositedPath: '', timestamp: 4 },
    ]
  }, [session?.photos])

  // Link đích của mã QR: Google Drive Subfolder hoặc Gallery
  const targetCloudUrl = cloudFolderUrl || `https://drive.google.com/drive/folders/${eventConfig.gdriveFolderId || DEFAULT_GDRIVE_FOLDER_ID}`

  // Tạo mã QR Code
  useEffect(() => {
    QRCode.toDataURL(targetCloudUrl, {
      margin: 1,
      width: 260,
      color: { dark: '#2d2426', light: '#ffffff' },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Error generating QR:', err))
  }, [targetCloudUrl])

  // Sinh bản ghép canvas composite chất lượng cao & Đẩy ảnh lên Google Drive
  useEffect(() => {
    let isMounted = true

    async function processSessionMedia() {
      try {
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
            if (dataUrl && dataUrl.startsWith('data:image')) {
              filesToUpload.push({
                name: `${FILE_PREFIX_SHOT}_${idx + 1}.jpg`,
                dataUrl,
              })
            }
          })

          // 3. Video Timelapse nếu có dữ liệu dataUrl
          if (session?.timelapseUrl && session.timelapseUrl.startsWith('data:')) {
            filesToUpload.push({
              name: `${FILE_PREFIX_TIMELAPSE}.webm`,
              dataUrl: session.timelapseUrl,
            })
          }

          const api = isBrowser ? mockApi : fotolismApi
          const res = await api.storage.uploadDriveSession({
            parentFolderId: eventConfig.gdriveFolderId || DEFAULT_GDRIVE_FOLDER_ID,
            subfolderName,
            files: filesToUpload,
            webhookUrl: eventConfig.gdriveWebhookUrl,
          })

          if (isMounted && res.success && res.data) {
            setLocalFolderDir(res.data.localDir)
            if (res.data.cloudFolderUrl) {
              setCloudFolderUrl(res.data.cloudFolderUrl)
              setGdriveUrl(res.data.cloudFolderUrl)
            }
            setIsSyncingDrive(false)
            setDriveSyncDone(true)
          } else if (isMounted) {
            setIsSyncingDrive(false)
          }
        }
      } catch (err) {
        console.error('Failed to generate strip composite or upload to Drive:', err)
        if (isMounted) {
          setIsGeneratingComposite(false)
          setIsSyncingDrive(false)
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
    cloudSyncService.queueSession({
      id: session.sessionId || `ses_${Date.now()}`,
      session_code: `JB${Date.now().toString().slice(-6)}`,
      kiosk_id: 'kiosk_01',
      branch_id: 'branch_01',
      layout_type: is4x6 ? '4x6' : '2x6',
      copies: printCopies,
      total_amount: session.paidAmount || (is4x6 ? 70000 : 50000),
      payment_method: (session.paymentMethod?.toLowerCase() === 'cash' ? 'cash' : 'vietqr') as 'vietqr' | 'cash',
      coupon_code: null,
      paper_consumed: printCopies,
      drive_url: session.gdriveUrl || null,
      status: 'completed',
      created_at: new Date().toISOString(),
      photos: photos.map((p) => p.compositedPath || p.enhancedPath || p.rawPath || ''),
    })
  }, [session, selectedFrameSize, printCopies, photos])

  // Tự động đếm ngược
  useEffect(() => {
    if (timeLeft <= 0) {
      recordSessionToOutbox()
      clearSession()
      setScreen('idle')
      return
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [timeLeft, clearSession, setScreen, recordSessionToOutbox])

  function handleFinish() {
    recordSessionToOutbox()
    clearSession()
    setScreen('idle')
  }

  async function handlePrint() {
    if (isPrinting) return
    setIsPrinting(true)
    setPrintSuccess(false)

    try {
      const api = isBrowser ? mockApi : fotolismApi
      const pathToPrint = compositeStripUrl || photos[0]?.compositedPath || ''
      await api.print.send(pathToPrint, printCopies)
      setTimeout(() => {
        setIsPrinting(false)
        setPrintSuccess(true)
      }, 1500)
    } catch (err) {
      console.error('Print failed:', err)
      setIsPrinting(false)
    }
  }

  function handleDownloadStrip() {
    if (!compositeStripUrl) return
    const a = document.createElement('a')
    a.href = compositeStripUrl
    a.download = `${FILE_PREFIX_FINAL}_${selectedFrameSize}_${Date.now()}.jpg`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  function handleDownloadTimelapse() {
    if (!session?.timelapseUrl) return
    const a = document.createElement('a')
    a.href = session.timelapseUrl
    a.download = `${FILE_PREFIX_TIMELAPSE}_${Date.now()}.webm`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  function handleOpenLocalFolder() {
    const api = isBrowser ? mockApi : fotolismApi
    api.storage.openFolder(localFolderDir || undefined)
  }

  function handleOpenDriveBrowser() {
    window.open(cloudFolderUrl, '_blank')
  }

  const isGrid =
    selectedLayout.previewType === '4_grid' ||
    selectedLayout.previewType === '6_grid' ||
    selectedLayout.previewType === '8_grid'

  return (
    <div className="review-screen-pastel" id="review-screen">
      {/* ── Top Header: Single Left Back Arrow + Center Title + Timer ── */}
      <header className="review-header-pastel">
        <button
          className="screen-back-btn"
          onClick={() => setScreen('select-filter')}
          title="Quay lại chọn bộ lọc"
          aria-label="Quay lại"
        >
          <ArrowLeft size={28} strokeWidth={2} />
        </button>

        <div className="review-header-center">
          <h1 className="review-header-title">Dải Ảnh Của Bạn</h1>
        </div>

        <div className="review-timer-capsule">
          <span>Tự động kết thúc sau: <strong>{timeLeft}s</strong></span>
        </div>
      </header>

      {/* Main 2-Column Content */}
      <main className="review-content-pastel">
        {/* Left: Photobooth Strip Frame & Timelapse Media View */}
        <section className="strip-frame-container">
          {/* Media View Mode Selector */}
          <div className="review-media-tabs">
            <button
              className={`review-media-tab-btn ${activeMediaView === 'strip' ? 'active' : ''}`}
              onClick={() => setActiveMediaView('strip')}
            >
              <span>🖼️</span>
              <span>Dải Ảnh In ({selectedFrameSize.toUpperCase()})</span>
            </button>
            <button
              className={`review-media-tab-btn ${activeMediaView === 'timelapse' ? 'active' : ''}`}
              onClick={() => setActiveMediaView('timelapse')}
            >
              <span>🎬</span>
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
              {session?.timelapseUrl ? (
                <div className="timelapse-player-card">
                  <video
                    src={session.timelapseUrl}
                    autoPlay
                    loop
                    playsInline
                    controls
                    className="timelapse-video-element"
                    ref={(el) => {
                      if (el) el.playbackRate = eventConfig.timelapseSpeed || 2.5
                    }}
                  />
                  <div className="timelapse-meta-bar">
                    <span>⚡ Tua nhanh: {eventConfig.timelapseSpeed || 2.5}x</span>
                    <span>🎥 1 Camera Đa Nhiệm (Stream + Capture)</span>
                  </div>
                  <button
                    className="download-strip-btn"
                    style={{ marginTop: 12, width: '100%' }}
                    onClick={handleDownloadTimelapse}
                  >
                    🎬 Tải Video Timelapse Về Máy (.webm)
                  </button>
                </div>
              ) : (
                <div className="timelapse-empty-state">
                  <span style={{ fontSize: '3.5rem' }}>🎬</span>
                  <h3 style={{ margin: '10px 0 6px', color: 'var(--color-pink-primary)' }}>
                    Video Timelapse Hậu Trường
                  </h3>
                  <p style={{ fontSize: '0.9rem', color: '#555', lineHeight: 1.5, textAlign: 'center', maxWidth: 300 }}>
                    Camera vừa quay luồng trực tiếp vừa chụp ảnh đồng thời. Hãy bật tính năng trong menu Quản Trị để tự động xuất video mỗi phiên chụp!
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right: Instant QR & Print */}
        <section className="review-delivery-deck">
          {/* Card QR Tải Ảnh & Cloud Google Drive */}
          <div className="delivery-card-pastel">
            <div className="card-title-pastel">
              <span>📁</span>
              <span>Quét QR Nhận Ảnh Trên Google Drive</span>
            </div>
            <div className="qr-row">
              <div className="qr-box-pastel">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR Code tải ảnh Google Drive" />
                ) : (
                  <span>Tạo mã QR...</span>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <p className="qr-guide-text">
                  Mở Camera điện thoại hoặc Zalo để mở thư mục Google Drive riêng của bạn, chứa đầy đủ dải ảnh in, ảnh gốc và video timelapse.
                </p>

                {/* Badge thông báo thư mục con theo ngày giờ */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '8px 0' }}>
                  <div className="cloud-sync-badge-custom">
                    {isSyncingDrive ? (
                      <span>⏳ Đang tạo thư mục Google Drive: <strong>{subfolderName}</strong>...</span>
                    ) : driveSyncDone ? (
                      <span>✅ Đã lưu vào thư mục: <strong>{subfolderName}</strong></span>
                    ) : (
                      <span>☁️ Đã kết nối folder Google Drive: <strong>{subfolderName}</strong></span>
                    )}
                  </div>
                </div>

                {/* Nút thao tác mở nhanh */}
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-pill-white"
                    style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                    onClick={handleOpenDriveBrowser}
                    title="Mở thư mục Google Drive trên trình duyệt"
                  >
                    🌐 Mở Google Drive
                  </button>
                  <button
                    className="btn btn-pill-white"
                    style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                    onClick={handleOpenLocalFolder}
                    title="Mở thư mục lưu trữ trên máy tính"
                  >
                    📂 Mở Folder Máy
                  </button>
                </div>

                <p className="qr-subguide" style={{ marginTop: 8 }}>
                  Khổ in: {selectedFrameSize.toUpperCase()} • Bộ lọc: {selectedFilter.name}
                </p>
                
                {compositeStripUrl && (
                  <button
                    className="download-strip-btn"
                    onClick={handleDownloadStrip}
                    style={{ marginTop: 8 }}
                  >
                    💾 Tải Dải Strip Về Máy ({selectedFrameSize.toUpperCase()})
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Card In Ảnh */}
          <div className="delivery-card-pastel">
            <div className="card-title-pastel">
              <span>🖨️</span>
              <span>In Ảnh Nhiệt Lấy Liền (Dye-Sub)</span>
            </div>

            <div className="print-copies-row">
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Số lượng bản in:</span>
                {session?.paidCopies ? (
                  <span style={{ fontSize: '0.76rem', color: '#059669', fontWeight: 600 }}>
                    (Đã thanh toán {session.paidCopies} {selectedFrameSize === '2x6' ? 'dải' : 'tấm'})
                  </span>
                ) : null}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <button
                  className="copies-btn-pastel"
                  onClick={() => setPrintCopies((c) => Math.max(1, c - 1))}
                  disabled={printCopies <= 1}
                >
                  -
                </button>
                <span style={{ fontWeight: 900, fontSize: '1.2rem', color: 'var(--color-pink-primary)' }}>
                  {printCopies}
                </span>
                <button
                  className="copies-btn-pastel"
                  onClick={() => setPrintCopies((c) => Math.min(12, c + 1))}
                  disabled={printCopies >= 12}
                >
                  +
                </button>
              </div>
            </div>

            <button
              className="print-btn-pastel"
              id="print-button"
              disabled={isPrinting || isGeneratingComposite}
              onClick={handlePrint}
            >
              {isPrinting ? (
                <>⏳ ĐANG GỬI LỆNH IN ({printCopies} BẢN)...</>
              ) : printSuccess ? (
                <>✅ ĐÃ GỬI LỆNH IN! VUI LÒNG NHẬN ẢNH</>
              ) : (
                <>🖨️ IN {printCopies} BẢN NGAY ➔</>
              )}
            </button>
          </div>
        </section>
      </main>

      {/* ── Bottom Bar: Only Single Primary Action ── */}
      <footer className="review-bottom-bar-pastel">
        <button
          className="btn-finish-review"
          id="finish-button"
          onClick={handleFinish}
        >
          <span>Hoàn Tất & Kết Thúc</span>
          <ArrowRight size={22} strokeWidth={2.2} />
        </button>
      </footer>
    </div>
  )
}
