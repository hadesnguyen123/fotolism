import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import { fotolismApi, isBrowser, mockApi } from '../lib/api'
import { generateStripComposite, preparePrintImageForDNP, type SlotOffset } from '../lib/canvasCompositor'
import {
  FILE_PREFIX_SHOT,
  FILE_PREFIX_FINAL,
  SESSION_FOLDER_PREFIX,
  DEFAULT_GDRIVE_FOLDER_ID,
  DEFAULT_GDRIVE_WEBHOOK_URL,
  DEFAULT_ADMIN_PIN,
} from '../lib/constants'
import QRCode from 'qrcode'
import { QrCode, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { cloudSyncService } from '../services/cloudSyncService'
import { BRAND_LOGO_SRC } from '../lib/brandLogo'
import { InteractiveStripPreview } from '../components/review/InteractiveStripPreview'
import { PrintActionDeck } from '../components/review/PrintActionDeck'
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
    deviceConfig,
  } = useAppStore()

  const defaultCopies = session?.paidCopies || selectedCopies || (selectedFrameSize === '2x6' ? 2 : 1)

  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [printCopies, setPrintCopies] = useState<number>(defaultCopies)
  const [isPrinting, setIsPrinting] = useState<boolean>(false)
  const [printError, setPrintError] = useState<string | null>(null)
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

  // ── Offset cân chỉnh vị trí ảnh từng ô (Normalized Offset -1.0 đến +1.0) ──
  const [slotOffsets, setSlotOffsets] = useState<SlotOffset[]>(() =>
    Array(photos.length).fill({ x: 0, y: 0 })
  )
  const slotOffsetsRef = useRef<SlotOffset[]>(slotOffsets)
  slotOffsetsRef.current = slotOffsets

  const [activeDragIndex, setActiveDragIndex] = useState<number | null>(null)
  const dragStartRef = useRef<{
    index: number
    startX: number
    startY: number
    initOffset: SlotOffset
    slotPixelWidth: number
    slotPixelHeight: number
  } | null>(null)

  const is2x6 = (selectedTheme?.frameSize || selectedFrameSize) === '2x6'
  const totalW = is2x6 ? 600 : 1200
  const totalH = 1800

  const frameSlots = useMemo(() => {
    if (selectedTheme?.slots && selectedTheme.slots.length > 0) {
      return selectedTheme.slots.map((s: { x: number; y: number; w: number; h: number }) => ({
        xPercent: (s.x / totalW) * 100,
        yPercent: (s.y / totalH) * 100,
        wPercent: (s.w / totalW) * 100,
        hPercent: (s.h / totalH) * 100,
        slotW: s.w,
        slotH: s.h,
        aspectRatio: s.w / s.h,
      }))
    }
    const totalSlots = selectedLayout.photosCount || 4
    const cols = selectedLayout.cols || (is2x6 ? 1 : 2)
    const rows = selectedLayout.rows || Math.max(1, Math.ceil(totalSlots / cols))
    const footerHeight = selectedTheme?.hideFooter ? 0 : 150
    const padX = is2x6 ? 36 : 50
    const padTop = 40
    const gap = 20
    const availableHeight = totalH - padTop - footerHeight
    const defW = (totalW - padX * 2 - gap * (cols - 1)) / cols
    const defH = (availableHeight - gap * (rows - 1)) / rows

    return Array.from({ length: totalSlots }).map((_, i) => {
      const colIdx = i % cols
      const rowIdx = Math.floor(i / cols)
      const sx = padX + colIdx * (defW + gap)
      const sy = padTop + rowIdx * (defH + gap)
      return {
        xPercent: (sx / totalW) * 100,
        yPercent: (sy / totalH) * 100,
        wPercent: (defW / totalW) * 100,
        hPercent: (defH / totalH) * 100,
        slotW: defW,
        slotH: defH,
        aspectRatio: defW / defH,
      }
    })
  }, [selectedTheme, selectedLayout, is2x6, totalW, totalH])

  const regenerateComposite = useCallback(
    async (offsets: SlotOffset[]) => {
      try {
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
          slotOffsets: offsets,
        })
        setCompositeStripUrl(stripUrl)
      } catch (err) {
        console.warn('Error regenerating strip composite:', err)
      }
    },
    [photos, selectedFrameSize, selectedLayout, selectedTheme, placedStickers, selectedFilter, eventConfig]
  )

  const handlePointerDown = (index: number, e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    try {
      target.setPointerCapture(e.pointerId)
    } catch {}
    const rect = target.getBoundingClientRect()
    dragStartRef.current = {
      index,
      startX: e.clientX,
      startY: e.clientY,
      initOffset: slotOffsetsRef.current[index] || { x: 0, y: 0 },
      slotPixelWidth: rect.width,
      slotPixelHeight: rect.height,
    }
    setActiveDragIndex(index)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current || activeDragIndex === null) return
    const { index, startX, startY, initOffset, slotPixelWidth, slotPixelHeight } = dragStartRef.current
    const dx = e.clientX - startX
    const dy = e.clientY - startY

    // Sensitivity: vuốt 45% bề rộng ô tương ứng dịch chuyển hết biên (offset 1.0)
    const sensitivityX = Math.max(slotPixelWidth * 0.45, 40)
    const sensitivityY = Math.max(slotPixelHeight * 0.45, 40)

    const nextX = Math.max(-1, Math.min(1, initOffset.x + dx / sensitivityX))
    const nextY = Math.max(-1, Math.min(1, initOffset.y + dy / sensitivityY))

    setSlotOffsets((prev) => {
      const next = [...prev]
      next[index] = { x: nextX, y: nextY }
      return next
    })
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeDragIndex !== null) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {}
      const finalOffsets = [...slotOffsetsRef.current]
      dragStartRef.current = null
      setActiveDragIndex(null)
      regenerateComposite(finalOffsets)
    }
  }

  // Link đích của mã QR: Customer Gallery trên Cloudflare R2 / CMS
  const cmsBaseUrl = (deviceConfig?.cms_url || 'https://fotolism-cms.vercel.app').replace(/\/$/, '')
  const webGalleryUrl = `${cmsBaseUrl}/gallery/${session?.sessionId || subfolderName}`
  const targetCloudUrl = webGalleryUrl

  // Tạo mã QR Code cho Cloud Gallery
  useEffect(() => {
    if (!targetCloudUrl) {
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
  }, [targetCloudUrl])

  // Sinh bản ghép canvas composite chất lượng cao & Đẩy ảnh lên Google Drive
  useEffect(() => {
    let isMounted = true

    async function processSessionMedia() {
        try {
        if (isSelfboothMode) {
          // Chế độ Selfbooth: Không cần ghép khung in ấn
          setIsGeneratingComposite(false)

          // Nếu đã hoàn thành đồng bộ từ bước ProcessingScreen thì không cần gọi lại
          if (driveSyncDone && cloudFolderUrl && !cloudFolderUrl.includes(DEFAULT_GDRIVE_FOLDER_ID)) {
            return
          }

          // Nếu đang trong quá trình đồng bộ nền từ CaptureScreen/ProcessingScreen thì chờ đợi
          if (isSyncingDrive) {
            return
          }

          if (eventConfig.gdriveEnabled && eventConfig.gdriveAutoSync) {
            setIsSyncingDrive(true)
            const filesToUpload: Array<{ name: string; dataUrl: string }> = []
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

            const effectiveWebhookUrl = eventConfig.gdriveWebhookUrl || DEFAULT_GDRIVE_WEBHOOK_URL
            const api = isBrowser ? mockApi : fotolismApi
            let res = await api.storage.uploadDriveSession({
              parentFolderId: eventConfig.gdriveFolderId || DEFAULT_GDRIVE_FOLDER_ID,
              subfolderName,
              files: filesToUpload,
              webhookUrl: effectiveWebhookUrl,
            })

            if (!res.success || !res.data?.cloudFolderUrl || res.data.cloudFolderUrl.includes(DEFAULT_GDRIVE_FOLDER_ID)) {
              try {
                const directRes = await fetch(effectiveWebhookUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                  body: JSON.stringify({
                    action: 'create_session_folder',
                    parentFolderId: eventConfig.gdriveFolderId || DEFAULT_GDRIVE_FOLDER_ID,
                    folderName: subfolderName,
                    files: filesToUpload.filter((f) => f.dataUrl && f.dataUrl.startsWith('data:')),
                  }),
                })
                const directJson = await directRes.json()
                if (directJson && directJson.success && directJson.folderUrl) {
                  res = {
                    success: true,
                    data: {
                      localDir: '',
                      cloudFolderUrl: directJson.folderUrl,
                      cloudFolderId: directJson.folderId || '',
                      subfolderName,
                      filesCount: filesToUpload.length,
                    },
                  }
                }
              } catch (directErr) {
                console.warn('[ReviewScreen] Selfbooth direct fetch failed:', directErr)
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

          const prebuiltStrip = useAppStore.getState().compositeStripUrl || session?.compositeStripUrl
        if (prebuiltStrip) {
          setCompositeStripUrl(prebuiltStrip)
          setIsGeneratingComposite(false)
          if (cloudFolderUrl || useAppStore.getState().cloudFolderUrl) {
            setIsSyncingDrive(false)
            setDriveSyncDone(true)
            return
          }
        }

        // Sinh dải ảnh in hoàn chỉnh cho cả Photobooth và Selfbooth (fallback)
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
          slotOffsets: slotOffsetsRef.current,
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

          // 2. Toàn bộ ảnh chụp đơn lẻ (bao gồm toàn bộ kho ảnh Selfbooth nếu có)
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
    setGdriveUrl,
  ])

  // Đánh dấu vé lượt chụp hoàn thành (COMPLETED) trên Cloud CMS
  const markTicketCompleted = useCallback(async () => {
    const pin = session?.pinCode
    const adminPin = (eventConfig.adminPin || DEFAULT_ADMIN_PIN || '8888').trim()
    if (!pin || pin === '8888' || pin === adminPin) return

    try {
      await fetch('http://localhost:3000/api/kiosk/tickets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin_code: pin,
          status: 'COMPLETED',
          kiosk_id: isSelfboothMode ? 'kiosk_02' : 'kiosk_01',
        }),
      })
      console.log(`[ReviewScreen] Đã cập nhật vé ${pin} sang COMPLETED trên Cloud CMS`)
    } catch (err) {
      console.warn('[ReviewScreen] Không thể cập nhật trạng thái vé COMPLETED:', err)
    }
  }, [session?.pinCode, eventConfig.adminPin, isSelfboothMode])

  // Cập nhật trạng thái COMPLETED ngay khi khách vào màn hình Review nhận ảnh
  useEffect(() => {
    markTicketCompleted()
  }, [markTicketCompleted])

  // Lưu phiên chụp vào Outbox để đồng bộ lên Cloud CMS
  const recordSessionToOutbox = useMemo(() => () => {
    if (!session) return
    const is4x6 = selectedFrameSize === '4x6'
    const layoutType = isSelfboothMode ? 'selfbooth' : (is4x6 ? '4x6' : '2x6')
    const kioskId = isSelfboothMode ? 'kiosk_02' : 'kiosk_01'
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
      kiosk_id: kioskId,
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
      photos: photos.map((p) => {
        const pth = p.compositedPath || p.enhancedPath || p.rawPath || ''
        // Chống lỗi QuotaExceededError (5MB) trong LocalStorage khi lưu DataURL base64 lớn
        return pth.startsWith('data:') ? `[photo_slot_${p.id || 'shot'}]` : pth
      }),
    })
  }, [session, selectedFrameSize, printCopies, photos, cloudFolderUrl, subfolderName, isSelfboothMode])

  // ── Auto Return to Idle Timer (Cố định tối thiểu 120s / 2 phút cho tiến trình ngầm) ──
  const [countdownToIdle, setCountdownToIdle] = useState<number>(() => Math.max(120, eventConfig.idleTimeoutSeconds || 120))

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdownToIdle((prev) => {
        if (prev <= 1) {
          // Nếu các tiến trình ngầm (tải Drive, nén composite) chưa hoàn tất, hoãn đếm ngược
          if (isSyncingDrive || isGeneratingComposite) {
            return 15
          }
          clearInterval(timer)
          handleFinish()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [isSyncingDrive, isGeneratingComposite])

  // Dọn dẹp Object URL nhị phân khi unmount
  useEffect(() => {
    return () => {
      if (compositeStripUrl && compositeStripUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(compositeStripUrl) } catch { }
      }
    }
  }, [compositeStripUrl])

  function handleFinish() {
    if (isSyncingDrive || isGeneratingComposite) {
      console.log('Background upload/sync is still active, waiting...')
      return
    }
    markTicketCompleted()
    recordSessionToOutbox()
    clearSession()
    setScreen('idle')
  }

  async function handlePrint() {
    // Lệnh in chỉ được thực hiện khi chưa in thành công và không trong tiến trình in
    if (isPrinting || session?.hasPrinted) return

    setIsPrinting(true)
    setPrintError(null)

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
        setSessionPrinted()
        setIsPrinting(false)
        setPrintError(null)
      } else {
        const errorMsg = res?.error || 'Máy in không phản hồi hoặc lệnh in bị từ chối.'
        console.error('Print failed:', errorMsg)
        setPrintError(errorMsg)
        setIsPrinting(false)
      }
    } catch (err: any) {
      console.error('Print failed:', err)
      setPrintError(err?.message || 'Lỗi kết nối máy in.')
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

    function handleOpenDriveBrowser() {
      if (cloudFolderUrl) {
        window.open(cloudFolderUrl, '_blank')
      }
    }

    return (
      <div className="review-screen-pastel" id="review-screen">
        {/* ── Fixed Brand Logo góc trên bên trái ── */}
        <img src={BRAND_LOGO_SRC} alt="fotolism" className="review-fixed-brand-logo" />

        {/* ── Top Header: Tiêu đề trung tâm ── */}
        <header className="review-header-pastel">
          <div className="review-header-center">
            <div className="review-header-icon-box" aria-hidden="true">
              <svg
                width="34"
                height="34"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#502A1D"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="4" />
                <circle cx="8.5" cy="8.5" r="1.5" fill="#502A1D" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </div>
            <h1 className="review-header-title">Ảnh Hoàn Thiện</h1>
          </div>
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
            {/* Left: Photobooth Strip Frame */}
            <section className="strip-frame-container">
              <div className="frame-preview-wrapper fade-in">
                {isGeneratingComposite ? (
                  <div className="composite-generating-loader">
                    <span className="loader-spinner-pink" />
                    <span style={{ fontWeight: 700, color: 'var(--color-pink-primary)' }}>
                      Đang hoàn thiện dải ảnh in...
                    </span>
                  </div>
                ) : (
                  <InteractiveStripPreview
                    selectedFrameSize={selectedFrameSize}
                    selectedTheme={selectedTheme}
                    selectedFilter={selectedFilter}
                    is2x6={is2x6}
                    frameSlots={frameSlots}
                    photos={photos}
                    slotOffsets={slotOffsets}
                    activeDragIndex={activeDragIndex}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                  />
                )}
              </div>
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
              <PrintActionDeck
                selectedFrameSize={selectedFrameSize}
                paidCopies={session?.paidCopies}
                hasPrinted={session?.hasPrinted}
                isPrinting={isPrinting}
                isGeneratingComposite={isGeneratingComposite}
                printCopies={printCopies}
                printError={printError}
                onSetPrintCopies={setPrintCopies}
                onPrint={handlePrint}
              />
            </section>
          </main>
        )}

        {/* ── Bottom Bar: Nút Tiếp Tục / Hoàn Thành ── */}
        {(Boolean(qrDataUrl) || Boolean(syncError)) && (
          <footer className="kiosk-bottom-nav-bar review-bottom-bar-pastel animate-pop" style={{ justifyContent: 'flex-end' }}>
            <button
              className={`kiosk-nav-btn btn-nav-next ${(isSyncingDrive || isGeneratingComposite) ? 'disabled' : ''}`}
              id="finish-button"
              disabled={isSyncingDrive || isGeneratingComposite}
              onClick={handleFinish}
              title={isSyncingDrive ? 'Đang hoàn tất lưu ảnh ngầm...' : 'Tiếp tục'}
              aria-label="Tiếp tục"
              style={{ margin: '0 0 0 auto' }}
            >
              {isSyncingDrive ? 'Đang lưu ảnh ngầm...' : `Tiếp tục (${countdownToIdle}s)`}
            </button>
          </footer>
        )}
      </div>
    )
  }
