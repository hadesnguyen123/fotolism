import { useState, useRef, useEffect, useCallback } from 'react'
import { useAppStore, COLOR_FILTERS, type CapturedPhoto } from '../store/appStore'
import { fotolismApi, isBrowser, mockApi, api } from '../lib/api'
import {
  FILE_PREFIX_SHOT,
  FILE_PREFIX_SELF,
  SESSION_FOLDER_PREFIX,
  DEFAULT_GDRIVE_FOLDER_ID,
  DEFAULT_GDRIVE_WEBHOOK_URL,
  DEFAULT_SELFBOOTH_DURATION_SECONDS,
  isRemoteTriggerEvent,
} from '../lib/constants'
import { BeautyCameraView, type BeautyCameraHandle } from '../components/BeautyCameraView'
import { cropImageToAspect } from '../lib/canvasCompositor'
import { Camera, Palette, Loader2, Clock } from 'lucide-react'
import './CaptureScreen.css'

// ── Giả lập âm thanh màn trập cơ học "TÁCH!" dứt khoát 1 lần duy nhất qua Web Audio API ──
function playCameraShutterSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    const now = ctx.currentTime

    // 1 Tiếng "TÁCH!" cơ học dứt khoát duy nhất (Single crisp shutter click)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(1100, now)
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.045)
    gain.gain.setValueAtTime(0.45, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.05)
  } catch { }
}

export default function CaptureScreen() {
  const {
    setScreen,
    setSessionPhotos,
    countdownSeconds,
    setCountdownSeconds,
    selectedLayout,
    selectedFrameSize,
    selectedCopies,
    selectedFilter,
    selectFilter,
    ringLightEnabled,
    ringLightLevel,
    mirrorCamera,
    setCameras,
    selectCamera,
    eventConfig,
    setGdriveUrl,
    setIsSyncingDrive,
    setDriveSyncDone,
    setDriveSyncError,
    setCloudFolderUrl,
    slimFace,
    vLine,
    bigEyes,
    whiteningTone,
    brightnessAdjust,
    contrastAdjust,
    saturationAdjust,
    skinSmoothing,
    rosyTone,
    glowClarity,
    getBeautyFilterCss,
    photoboothSessionEndTime,
    startPhotoboothSessionTimer,
  } = useAppStore()

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const beautyCameraRef = useRef<BeautyCameraHandle>(null)
  const currentStreamRef = useRef<MediaStream | null>(null)
  const [activeMediaStream, setActiveMediaStream] = useState<MediaStream | null>(null)
  const pendingCapturesRef = useRef<Set<number>>(new Set())
  const totalShots = selectedLayout.photosCount || 4
  const isSelfboothMode = eventConfig.captureMode === 'selfbooth'

  useEffect(() => {
    if (!isSelfboothMode && !photoboothSessionEndTime) {
      startPhotoboothSessionTimer()
    }
  }, [isSelfboothMode, photoboothSessionEndTime, startPhotoboothSessionTimer])

  // Xác định tỉ lệ và kích thước ô chuẩn theo yêu cầu:
  // - Khung 4 ảnh 2x6: 528 x 352 (tỉ lệ 1.5)
  // - Khung 4 ảnh 4x6: 544 x 726 (tỉ lệ 0.7493)
  // - Khung 9 ảnh 4x6: 381 x 580 (tỉ lệ 0.6569)
  const is2x6 = selectedFrameSize === '2x6'
  const is9Grid = selectedLayout.photosCount === 9
  const targetSlotDimensions = is2x6
    ? { w: 528, h: 352, label: '528×352' }
    : is9Grid
      ? { w: 381, h: 580, label: '381×580' }
      : { w: 544, h: 726, label: '544×726' }

  const [hasCamera, setHasCamera] = useState<boolean>(false)
  const [activeFlyout, setActiveFlyout] = useState<'filter' | null>(null)

  // ── Trạng thái chung khi chụp ──
  const [isSessionActive, setIsSessionActive] = useState<boolean>(false)
  const [isCapturingShot, setIsCapturingShot] = useState<boolean>(false)
  const [currentCountdown, setCurrentCountdown] = useState<number>(3)
  const [showFlash, setShowFlash] = useState<boolean>(false)
  const [snapshotFlyer, setSnapshotFlyer] = useState<{ photoUrl: string; slotIndex: number; isEdsdk?: boolean } | null>(null)
  const [justCapturedSlot, setJustCapturedSlot] = useState<number | null>(null)
  const [cameraFreezeFrame, setCameraFreezeFrame] = useState<string | null>(null)

  // ── Session ID cho Fotolism 2.2 SQLite & Idempotency ──
  const [sessionId] = useState<string>(() => `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`)

  // ── Chế độ PHOTOBOOTH CỔ ĐIỂN (Có Retake / Xóa ô xấu) ──
  const [slots, setSlots] = useState<(CapturedPhoto | null)[]>(Array(totalShots).fill(null))
  const slotsRef = useRef<(CapturedPhoto | null)[]>(slots)
  slotsRef.current = slots
  const [retakeSlotIndex, setRetakeSlotIndex] = useState<number | null>(null)
  // Số lần đã xóa chụp lại của từng ô (mỗi ô tối đa 2 lần xóa)
  const [slotDeleteCounts, setSlotDeleteCounts] = useState<Record<number, number>>({})
  // Giới hạn lượt chụp lại: chỉ chụp lại từ đầu tối đa 1 lần
  const [sessionResetCount, setSessionResetCount] = useState<number>(0)

  useEffect(() => {
    // Khởi tạo phiên trong SQLite persistent session storage (FR-06)
    api.session?.create({
      id: sessionId,
      status: 'ACTIVE',
      started_at: new Date().toISOString(),
      total_slots: totalShots,
      layout_id: selectedLayout?.id,
      payment_status: 'PAID',
      print_copies: selectedCopies || 1,
    }).catch(console.warn)
  }, [sessionId, totalShots, selectedLayout?.id, selectedCopies])

  // ── Chế độ SELFBOOTH (Chụp tự do không giới hạn & Bấm remote 2.5s hồi đèn flash) ──
  const SELFBOOTH_FLASH_RECYCLE_MS = 2500
  const [isSelfboothRunning, setIsSelfboothRunning] = useState<boolean>(false)
  const [selfboothLibrary, setSelfboothLibrary] = useState<CapturedPhoto[]>([])
  const [isCanonDaemonActive, setIsCanonDaemonActive] = useState<boolean>(false)
  const [showFinishConfirm, setShowFinishConfirm] = useState<boolean>(false)
  const [isFlashCoolingDown, setIsFlashCoolingDown] = useState<boolean>(false)

  // Khởi động Camera thiết bị
  const startCamera = useCallback(async (deviceId?: string) => {
    // 0. Kiểm tra Canon Persistent Daemon (Direct EDSDK)
    const userCameraType = useAppStore.getState().cameraType
    let daemonActive = false
    try {
      const daemonRes = await (isBrowser ? mockApi : fotolismApi).camera.canonDaemonStatus?.()
      if (daemonRes?.success && daemonRes.data?.running) {
        daemonActive = true
      }
    } catch { }

    // Lấy toàn bộ danh sách thiết bị video của hệ thống
    let allDevices: MediaDeviceInfo[] = []
    try {
      allDevices = await navigator.mediaDevices.enumerateDevices()
    } catch { }

    // Kiểm tra xem người dùng có đang cố tình chọn một webcam phụ (ví dụ webcam laptop) hay không
    const isExplicitNonCanonWebcam =
      Boolean(deviceId) &&
      deviceId !== 'canon-daemon-stream' &&
      !/canon|eos/i.test(deviceId || '') &&
      allDevices.some((d) => d.deviceId === deviceId && !/canon|eos/i.test(d.label))

    // NẾU Canon Daemon đang hoạt động và không chọn webcam phụ khác -> BẮT BUỘC dùng luồng Canon EDSDK trực tiếp
    if (daemonActive && !isExplicitNonCanonWebcam && userCameraType !== 'laptop') {
      if (currentStreamRef.current) {
        currentStreamRef.current.getTracks().forEach((track) => track.stop())
        currentStreamRef.current = null
      }
      setActiveMediaStream(null)
      setIsCanonDaemonActive(true)
      selectCamera('canon-daemon-stream')
      setHasCamera(true)

      // Lọc bỏ HOÀN TOÀN driver ảo EOS Webcam Utility (DirectShow) để không bao giờ chiếm cổng USB của máy ảnh
      const nonCanonDevices = allDevices
        .filter((d) => d.kind === 'videoinput' && !/eos|canon/i.test(d.label))
        .map((d, index) => ({
          id: d.deviceId,
          name: d.label || `Webcam ${index + 1}`,
        }))

      const cameraList = [
        {
          id: 'canon-daemon-stream',
          name: '📸 Máy ảnh Canon EOS (EDSDK Trực Tiếp - Chuẩn)',
        },
        ...nonCanonDevices,
      ]
      setCameras(cameraList)
      return
    }

    setIsCanonDaemonActive(false)
    if (currentStreamRef.current) {
      currentStreamRef.current.getTracks().forEach((track) => track.stop())
      currentStreamRef.current = null
    }

    try {
      // 1. Quét danh sách thiết bị webcam thông thường
      const videoDevices = allDevices
        .filter((d) => d.kind === 'videoinput')
        .map((d, index) => {
          let displayName = d.label || `Camera ${index + 1}`
          if (/eos|canon/i.test(displayName)) {
            displayName = '📷 Máy ảnh Canon EOS (DirectShow)'
          }
          return {
            id: d.deviceId,
            name: displayName,
          }
        })

      if (daemonActive) {
        videoDevices.unshift({
          id: 'canon-daemon-stream',
          name: '📸 Máy ảnh Canon EOS (EDSDK Trực Tiếp - Chuẩn)',
        })
      }

      if (videoDevices.length > 0) {
        setCameras(videoDevices)
      }

      // Ưu tiên chọn camera
      let targetId = deviceId
      if (!targetId) {
        const storedId = useAppStore.getState().selectedCameraId
        const storedDev = videoDevices.find((d) => d.id === storedId)
        if (storedDev) {
          targetId = storedId || undefined
        } else {
          targetId = videoDevices[0]?.id
          if (targetId) selectCamera(targetId)
        }
      }

      if (targetId === 'canon-daemon-stream') {
        setIsCanonDaemonActive(true)
        setHasCamera(true)
        return
      }

      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      }

      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: targetId ? { ...videoConstraints, deviceId: { exact: targetId } } : videoConstraints,
          audio: false,
        })
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: targetId ? { ...videoConstraints, deviceId: { ideal: targetId } } : true,
          audio: false,
        })
      }

      currentStreamRef.current = stream
      setActiveMediaStream(stream)

      const actualTrack = stream.getVideoTracks()[0]
      const actualDeviceId = actualTrack?.getSettings()?.deviceId || targetId
      if (actualDeviceId) {
        selectCamera(actualDeviceId)
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch((e) => console.warn('Play video error:', e))
      }

      setHasCamera(true)
    } catch (err) {
      console.warn('Cannot connect camera with constraints, trying fallback:', err)
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        currentStreamRef.current = fallbackStream
        setActiveMediaStream(fallbackStream)
        const actualTrack = fallbackStream.getVideoTracks()[0]
        const fallbackId = actualTrack?.getSettings()?.deviceId
        if (fallbackId) {
          selectCamera(fallbackId)
        }
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream
          videoRef.current.play().catch(() => { })
        }
        setHasCamera(true)
      } catch (fallbackErr) {
        console.error('All camera attempts failed:', fallbackErr)
        setHasCamera(false)
      }
    }
  }, [setCameras, selectCamera])

  useEffect(() => {
    // Chỉ reset bộ lọc khi ở chế độ Photobooth, Selfbooth đã chọn màu ở bước trước
    if (!isSelfboothMode) {
      selectFilter(COLOR_FILTERS[0])
    }
  }, [isSelfboothMode, selectFilter])

  useEffect(() => {
    const initialId = useAppStore.getState().selectedCameraId
    startCamera(initialId || undefined)

    return () => {
      if (currentStreamRef.current) {
        currentStreamRef.current.getTracks().forEach((track) => track.stop())
        currentStreamRef.current = null
      }
    }
  }, [startCamera])

  // Tự động phát hiện và kết nối lại máy ảnh Canon EOS ngay khi máy bật nguồn hoặc cắm lại cáp USB
  useEffect(() => {
    if (isCanonDaemonActive) return

    const probeTimer = setInterval(async () => {
      try {
        const currentCameraType = useAppStore.getState().cameraType
        if (currentCameraType === 'laptop') return
        const daemonRes = await (isBrowser ? mockApi : fotolismApi).camera.canonDaemonStatus?.()
        if (daemonRes?.success && daemonRes.data?.running) {
          console.log('⚡ [CaptureScreen] Canon EOS Daemon detected active, auto-switching to live stream...')
          startCamera('canon-daemon-stream')
        }
      } catch { }
    }, 2000)

    return () => clearInterval(probeTimer)
  }, [isCanonDaemonActive, startCamera])

  const finishSelfboothRef = useRef<() => void>(() => { })

  // Tự động kích hoạt phiên Selfbooth khi vào màn hình (không giới hạn thời gian)
  useEffect(() => {
    if (isSelfboothMode) {
      setIsSelfboothRunning(true)
      setIsSessionActive(true)
    }
  }, [isSelfboothMode])

  // Đồng hồ đếm ngược thời gian chụp Selfbooth (05:00 -> 00:00). Hết giờ tự động out ra review
  const totalDuration = eventConfig.selfboothDurationSeconds || DEFAULT_SELFBOOTH_DURATION_SECONDS
  const [selfboothSecondsLeft, setSelfboothSecondsLeft] = useState<number>(totalDuration)
  const isAutoFinishingRef = useRef<boolean>(false)

  useEffect(() => {
    if (!isSelfboothMode || !isSelfboothRunning) return
    const timer = setInterval(() => {
      setSelfboothSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          if (!isAutoFinishingRef.current) {
            isAutoFinishingRef.current = true
            finishSelfboothRef.current()
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [isSelfboothMode, isSelfboothRunning])

  // Định dạng thời gian trôi qua dạng mm:ss
  function formatElapsedTime(sec: number): string {
    const mins = Math.floor(sec / 60)
    const secs = sec % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  // Lắng nghe phím Remote (Rapoo R100 / USB Clicker / Bluetooth) trong chế độ Selfbooth
  useEffect(() => {
    if (!isSelfboothMode) return

    const handleRemoteKeyDown = (e: KeyboardEvent) => {
      // Bỏ qua nếu đang gõ text vào input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      // Chặn ngay lập tức nếu đang trong quá trình chụp hoặc đèn flash đang nạp hồi 2.5s
      if (isCapturingShot || isFlashCoolingDown) return

      // Kiểm tra phím bấm từ Remote Rapoo R100 (PageDown, PageUp, Dot, Arrows, Space, Enter...)
      if (isRemoteTriggerEvent(e)) {
        e.preventDefault()
        handleTakeSelfboothShot()
      }
    }

    window.addEventListener('keydown', handleRemoteKeyDown)
    return () => window.removeEventListener('keydown', handleRemoteKeyDown)
  }, [isSelfboothMode, isCapturingShot, isFlashCoolingDown, isSelfboothRunning, handleTakeSelfboothShot])

  // Chụp 1 khung hình từ video sang DataURL với bảo đảm không bao giờ trả về ảnh đen
  function grabVideoFrame(): string {
    // 1. Chụp từ WebGL Beauty Camera (đã có kiểm tra readPixels chống đen do swapchain)
    if (beautyCameraRef.current) {
      const liveFrame = beautyCameraRef.current.captureFrame()
      if (liveFrame && liveFrame.length > 1000 && !liveFrame.startsWith('data:,')) {
        return liveFrame
      }
    }

    // 2. Dự phòng trực tiếp: Canvas 2D lấy từ video element đang chạy
    const video = beautyCameraRef.current?.getVideoElement() || videoRef.current
    if (video && (video.videoWidth > 0 || video.readyState >= 2)) {
      const w = video.videoWidth || 1920
      const h = video.videoHeight || 1080
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')

      if (ctx) {
        const beautyFilter = getBeautyFilterCss()
        if (beautyFilter && beautyFilter !== 'none') {
          ctx.filter = beautyFilter
        }

        if (mirrorCamera) {
          ctx.translate(w, 0)
          ctx.scale(-1, 1)
        }

        ctx.drawImage(video, 0, 0, w, h)
        const fallbackDataUrl = canvas.toDataURL('image/jpeg', 0.98)
        if (fallbackDataUrl && fallbackDataUrl.length > 1000) {
          return fallbackDataUrl
        }
      }
    }

    // 3. Fallback an toàn tuyệt đối: Sinh ảnh nền chuẩn 1920x1080 chất lượng cao để đảm bảo luôn có ảnh tải lên Drive
    try {
      const fallbackCanvas = document.createElement('canvas')
      fallbackCanvas.width = 1920
      fallbackCanvas.height = 1080
      const fbCtx = fallbackCanvas.getContext('2d')
      if (fbCtx) {
        const grad = fbCtx.createLinearGradient(0, 0, 1920, 1080)
        grad.addColorStop(0, '#fdfaf8')
        grad.addColorStop(1, '#f7ebe6')
        fbCtx.fillStyle = grad
        fbCtx.fillRect(0, 0, 1920, 1080)

        fbCtx.fillStyle = '#502a1d'
        fbCtx.font = 'bold 54px sans-serif'
        fbCtx.textAlign = 'center'
        fbCtx.fillText('fotolism photobooth', 960, 520)

        fbCtx.fillStyle = '#8c7368'
        fbCtx.font = '28px sans-serif'
        fbCtx.fillText(new Date().toLocaleString('vi-VN'), 960, 590)

        return fallbackCanvas.toDataURL('image/jpeg', 0.95)
      }
    } catch { }

    return ''
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // XỬ LÝ PHOTOBOOTH CỔ ĐIỂN (Retake / Xóa ô xấu)
  // ══════════════════════════════════════════════════════════════════════════════
  const filledSlotsCount = slots.filter(Boolean).length
  const isPhotoboothFull = filledSlotsCount === totalShots

  async function handleTakePhotoboothShot() {
    if (isCapturingShot) return
    if (isPhotoboothFull && retakeSlotIndex === null) return

    // Xác định ô sẽ được gán ảnh vào
    let targetIndex = retakeSlotIndex
    if (targetIndex === null) {
      targetIndex = slots.findIndex((s) => s === null)
      if (targetIndex === -1) targetIndex = 0
    }

    setActiveFlyout(null)
    setIsSessionActive(true)
    setIsCapturingShot(true)

    try {
      const timestamp = Date.now()
      const fileName = `${FILE_PREFIX_SHOT}_${targetIndex + 1}_${timestamp}.jpg`

      const canonSavePath = `F:\\Fotolism_image\\${fileName}`
      const api = isBrowser ? mockApi : fotolismApi

      // Đếm ngược mượt mà (3s, 5s hoặc 10s), giữ nguyên luồng video cho người dùng tạo dáng
      for (let c = countdownSeconds; c >= 1; c--) {
        setCurrentCountdown(c)
        await new Promise((r) => setTimeout(r, 1000))
      }

      // ── BẮT ẢNH TỨC THÌ TẠI 0s (KHÔNG BỊ LỆCH TƯ THẾ) ──────────────
      // 1. Chớp Flash và âm thanh màn trập cơ học "TÁCH!" dứt khoát
      if (!isCanonDaemonActive) {
        playCameraShutterSound()
      }
      setCurrentCountdown(0)
      setShowFlash(true)
      setTimeout(() => setShowFlash(false), 450)

      // 2. Chụp khung hình tại đúng 0s (người dùng đã cười tươi tạo dáng xong)
      let photoDataUrl = grabVideoFrame()
      if (photoDataUrl) {
        // Cắt crop theo đúng tỉ lệ chuẩn của ô layout (528x352, 544x726, 381x580)
        photoDataUrl = await cropImageToAspect(photoDataUrl, targetSlotDimensions.w, targetSlotDimensions.h)
        setCameraFreezeFrame(photoDataUrl)
      }
      const photoPath = photoDataUrl || `photo_${timestamp}_${targetIndex + 1}.jpg`

      const newPhoto: CapturedPhoto = {
        id: `photo_${timestamp}_${targetIndex + 1}`,
        rawPath: photoPath,
        enhancedPath: photoPath,
        compositedPath: photoPath,
        timestamp,
      }

      // 3. Đẩy ảnh vào ô khung hình (Slot) NGAY LẬP TỨC (< 0.1s sau 0s)
      const nextSlots = [...slots]
      nextSlots[targetIndex] = newPhoto
      setSlots(nextSlots)

      // Reset lại retake index sau khi chụp xong
      setRetakeSlotIndex(null)

      // Lưu ảnh preview/fallback vào đĩa trong nền bất đồng bộ (không chặn giao diện người dùng)
      if (photoDataUrl && photoDataUrl.startsWith('data:image')) {
        api.storage.savePhoto(photoDataUrl, fileName).catch((err) => console.warn('Save photo error:', err))
      }

      // 6. PHƯƠNG ÁN 2: KÍCH HOẠT MÁY ẢNH CANON EOS THẬT (24MP FULL EXIF) - FOTOLISM 2.2 IDEMPOTENCY
      // CHỈ kích hoạt máy ảnh Canon khi Canon Daemon đang active (tránh treo giao diện khi dùng webcam)
      // Chạy hoàn toàn bất đồng bộ trong nền (Non-blocking), không cản trở luồng chụp và chuyển ô
      if (isCanonDaemonActive) {
        pendingCapturesRef.current.add(targetIndex)
        const captureId = `cap_${sessionId}_slot${targetIndex}_${Date.now()}`
        api.camera.edsdkCapture({
          captureId,
          sessionId,
          slotIndex: targetIndex,
          savePath: canonSavePath,
          shotIndex: targetIndex,
        })
          .then(async (res) => {
            if (res && res.success && res.data && res.data.savedPath) {
              const canonData = res.data
              console.log(`[Method 2] Canon EOS 24MP captured: ${canonData.savedPath}`)

              let finalPhotoPath = canonData.savedPath
              let finalPhotoUrl = canonData.dataUrl || canonData.savedPath

              // ── ƯU TIÊN 1: Chạy Python AI Service (Korean Soft Beauty) trên ảnh 24MP gốc ──
              try {
                const enhanceRes = await api.ai.enhance(canonData.savedPath, 50)
                if (enhanceRes && enhanceRes.success && enhanceRes.data && enhanceRes.data.enhancedPath) {
                  finalPhotoPath = enhanceRes.data.enhancedPath
                  finalPhotoUrl = `file://${finalPhotoPath.replace(/\\/g, '/')}`
                  console.log(`[AI Engine] Korean Soft Beauty applied: ${finalPhotoPath}`)
                }
              } catch (aiErr) {
                console.warn('[AI Engine] Python enhance fallback:', aiErr)
              }

              setSlots((prev) => {
                const next = [...prev]
                if (next[targetIndex]) {
                  next[targetIndex] = {
                    ...next[targetIndex]!,
                    rawPath: canonData.savedPath,
                    enhancedPath: finalPhotoUrl,
                    compositedPath: finalPhotoUrl,
                  }
                }
                return next
              })
              setSnapshotFlyer((prev) =>
                prev && prev.slotIndex === targetIndex ? { ...prev, photoUrl: finalPhotoUrl, isEdsdk: true } : prev
              )
            }
          })
          .catch((err) => {
            console.warn('[Method 2] Canon hardware capture fallback:', err)
          })
          .finally(() => {
            pendingCapturesRef.current.delete(targetIndex)
          })
      }

      // Xóa khung đóng băng camera ngay sau hiệu ứng chớp flash dứt khoát (< 350ms)
      setTimeout(() => setCameraFreezeFrame(null), 350)
      setTimeout(() => setSnapshotFlyer(null), 850)
      setTimeout(() => setJustCapturedSlot(null), 1400)


      // Nếu sau lần chụp này đã full tất cả các ô:
      // KHÔNG tự động chuyển màn hình ngay!
      // Giữ nguyên để khách xem lại, xóa ảnh không đẹp hoặc bấm Tiếp tục.
      if (nextSlots.every(Boolean)) {
        if (eventConfig.gdriveEnabled) {
          const folderLink =
            eventConfig.gdriveFolderUrl ||
            `https://drive.google.com/drive/folders/${eventConfig.gdriveFolderId || `${SESSION_FOLDER_PREFIX}_Demo`}`
          setGdriveUrl(folderLink)
        }
      }
    } catch (shootErr) {
      console.error('Error during photobooth shot:', shootErr)
    } finally {
      setCurrentCountdown(0)
      setIsCapturingShot(false)
    }
  }

  // Xóa ảnh ở ô slot k để chuẩn bị chụp lại (mỗi ô tối đa 2 lần xóa)
  function handleDeleteSlot(indexToDelete: number) {
    if (isCapturingShot) return

    const currentCount = slotDeleteCounts[indexToDelete] || 0
    if (currentCount >= 2) return

    setSlotDeleteCounts((prev) => ({
      ...prev,
      [indexToDelete]: currentCount + 1,
    }))

    const nextSlots = [...slots]
    nextSlots[indexToDelete] = null
    setSlots(nextSlots)
    setRetakeSlotIndex(indexToDelete)
  }

  // Khách hài lòng và bấm xác nhận tiếp tục sang bước chọn theme
  async function handleProceedPhotobooth() {
    const validPhotos = slots.filter((s): s is CapturedPhoto => s !== null)
    if (validPhotos.length < totalShots) return

    // Đợi ảnh Canon hoàn tất lưu và chạy AI trong nền nếu đang xử lý
    if (pendingCapturesRef.current.size > 0) {
      await new Promise((resolve) => {
        const interval = setInterval(() => {
          if (pendingCapturesRef.current.size === 0) {
            clearInterval(interval)
            resolve(true)
          }
        }, 150)
        setTimeout(() => {
          clearInterval(interval)
          resolve(false)
        }, 5000)
      })
    }

    const finalPhotos = slotsRef.current.filter((s): s is CapturedPhoto => s !== null)
    setSessionPhotos(finalPhotos.length === totalShots ? finalPhotos : validPhotos)
    setIsSessionActive(false)
    setScreen('select-theme')
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // XỬ LÝ CHẾ ĐỘ SELFBOOTH (Chụp tự do không giới hạn thời gian & Chọn ảnh)
  // ══════════════════════════════════════════════════════════════════════════════

  // Bấm chụp 1 ảnh trong phiên Selfbooth (chụp tự do liên tục bằng remote hoặc nút bấm)
  async function handleTakeSelfboothShot() {
    if (isCapturingShot || isFlashCoolingDown) return
    if (!isSelfboothRunning) {
      setIsSelfboothRunning(true)
      setIsSessionActive(true)
    }

    setIsCapturingShot(true)
    setIsFlashCoolingDown(true)

    try {
      const timestamp = Date.now()
      const photoNum = selfboothLibrary.length + 1
      const fileName = `${FILE_PREFIX_SELF}_${photoNum}_${timestamp}.jpg`

      const canonSelfPath = `F:\\Fotolism_image\\${fileName}`
      const selfApi = isBrowser ? mockApi : fotolismApi

      // ── BỎ HOÀN TOÀN COUNTDOWN: BẮT ẢNH TỨC THÌ (< 50ms) ──────────────
      setCurrentCountdown(0)

      // ── BẮT ẢNH TỨC THÌ TỪ LUỒNG MÁY ẢNH CANON SELFBOOTH ──────────────
      if (!isCanonDaemonActive) {
        playCameraShutterSound()
      }
      setCurrentCountdown(0)
      setShowFlash(true)
      setTimeout(() => setShowFlash(false), 450)

      let photoDataUrl = grabVideoFrame()
      if (photoDataUrl) {
        setCameraFreezeFrame(photoDataUrl)
      }
      const photoPath = photoDataUrl || `selfbooth_${timestamp}_${photoNum}.jpg`

      const newPhoto: CapturedPhoto = {
        id: `selfbooth_${timestamp}_${photoNum}`,
        rawPath: photoPath,
        enhancedPath: photoPath,
        compositedPath: photoPath,
        timestamp,
      }

      setSelfboothLibrary((prev) => [...prev, newPhoto])

      // Lưu ảnh vào máy trong nền bất đồng bộ
      if (photoDataUrl && photoDataUrl.startsWith('data:image')) {
        selfApi.storage.savePhoto(photoDataUrl, fileName).catch((err) => console.warn('Save selfbooth photo error:', err))
      }

      // PHƯƠNG ÁN 2 cho Selfbooth: Chụp ảnh thật từ cảm biến máy ảnh Canon (Fotolism 2.2 Idempotency)
      // CHỈ kích hoạt máy ảnh Canon khi Canon Daemon đang active (tránh đứng màn hình khi dùng webcam)
      if (isCanonDaemonActive) {
        pendingCapturesRef.current.add(photoNum)
        const captureId = `cap_${sessionId}_self${photoNum}_${Date.now()}`
        selfApi.camera.edsdkCapture({
          captureId,
          sessionId,
          slotIndex: photoNum,
          savePath: canonSelfPath,
          shotIndex: photoNum,
        })
          .then(async (res) => {
            if (res && res.success && res.data && res.data.savedPath) {
              const canonData = res.data
              console.log(`[Method 2 Selfbooth] Canon 24MP captured: ${canonData.savedPath}`)
              let finalPhotoUrl = canonData.dataUrl || canonData.savedPath

              // ── Chạy Python AI Service (Korean Soft Beauty) trên ảnh 24MP ──
              try {
                const enhanceRes = await selfApi.ai.enhance(canonData.savedPath, 50)
                if (enhanceRes && enhanceRes.success && enhanceRes.data && enhanceRes.data.enhancedPath) {
                  finalPhotoUrl = `file://${enhanceRes.data.enhancedPath.replace(/\\/g, '/')}`
                  console.log(`[Selfbooth AI] Korean Soft Beauty applied: ${enhanceRes.data.enhancedPath}`)
                }
              } catch (aiErr) {
                console.warn('[Selfbooth AI] Python enhance fallback:', aiErr)
              }

              setSelfboothLibrary((prev) =>
                prev.map((p) =>
                  p.id === newPhoto.id
                    ? { ...p, rawPath: canonData.savedPath, enhancedPath: finalPhotoUrl, compositedPath: finalPhotoUrl }
                    : p
                )
              )
            }
          })
          .catch((err) => console.warn('[Method 2] Selfbooth Canon capture fallback:', err))
          .finally(() => {
            pendingCapturesRef.current.delete(photoNum)
          })
      }

      // Giữ khung đóng băng xem lại ảnh vừa chụp trong 1.5s (Instant Review) trước khi mở lại Live View
      setTimeout(() => setCameraFreezeFrame(null), 1500)

      // Hiệu ứng bay lên ngay lập tức (< 0.4s)
      setSnapshotFlyer({ photoUrl: photoPath, slotIndex: 0, isEdsdk: false })
      setTimeout(() => setSnapshotFlyer(null), 800)

      // Khóa nhận lệnh trong đúng 2.5s để đèn Flash Studio hồi tụ điện, Canon R100 phơi sáng và truyền ảnh an toàn
      await new Promise((r) => setTimeout(r, SELFBOOTH_FLASH_RECYCLE_MS))

    } catch (shootErr) {
      console.error('Error during selfbooth shot:', shootErr)
    } finally {
      setCurrentCountdown(0)
      setIsCapturingShot(false)
      setIsFlashCoolingDown(false)
      setCameraFreezeFrame(null)
    }
  }

  // Kết thúc phiên chụp Selfbooth: Lưu toàn bộ ảnh và chuyển thẳng sang màn hình quét QR lấy ảnh
  async function handleFinishSelfboothToReview() {
    setIsSelfboothRunning(false)

    // Nếu khách chưa kịp chụp ảnh nào trước khi hết giờ, tự động bắt 1 ảnh từ camera để không bị rỗng
    let finalPhotos = [...selfboothLibrary]
    if (finalPhotos.length === 0) {
      const snap = grabVideoFrame()
      if (snap) {
        const dummy: CapturedPhoto = {
          id: `selfbooth_${Date.now()}_1`,
          rawPath: snap,
          enhancedPath: snap,
          compositedPath: snap,
          timestamp: Date.now(),
        }
        finalPhotos = [dummy]
        setSelfboothLibrary(finalPhotos)
      }
    }

    // Đợi ảnh Canon hoàn tất lưu và xử lý AI trong nền nếu đang chụp
    if (pendingCapturesRef.current.size > 0) {
      await new Promise((resolve) => {
        const interval = setInterval(() => {
          if (pendingCapturesRef.current.size === 0) {
            clearInterval(interval)
            resolve(true)
          }
        }, 150)
        setTimeout(() => {
          clearInterval(interval)
          resolve(false)
        }, 5000)
      })
    }

    // 1. Lưu toàn bộ ảnh khách đã chụp vào session store
    setSessionPhotos(finalPhotos)
    setIsSessionActive(false)

    // 2. KHỞI ĐỘNG ĐẨY ẢNH LÊN GOOGLE DRIVE NGAY LẬP TỨC TRONG NỀN
    // Tạo thư mục phiên chụp riêng trên Google Drive và đẩy toàn bộ ảnh lên ngay
    if (eventConfig.gdriveEnabled && eventConfig.gdriveAutoSync) {
      setIsSyncingDrive(true)
      setDriveSyncDone(false)
      setDriveSyncError(null)

      const filesToUpload: Array<{ name: string; dataUrl: string }> = []
      selfboothLibrary.forEach((p, idx) => {
        const dataUrl = p.compositedPath || p.enhancedPath || p.rawPath
        if (dataUrl && dataUrl.trim().length > 0) {
          filesToUpload.push({
            name: `${FILE_PREFIX_SHOT}_${idx + 1}.jpg`,
            dataUrl,
          })
        }
      })

      const now = new Date()
      const pad = (n: number) => (n < 10 ? '0' : '') + n
      const timeStamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}h${pad(now.getMinutes())}`
      const subfolderName = `Fotolism_${timeStamp}_${sessionId.slice(-6)}`

      const effectiveWebhookUrl = eventConfig.gdriveWebhookUrl || DEFAULT_GDRIVE_WEBHOOK_URL
      console.log('[CaptureScreen] Selfbooth finished! Uploading to Drive in background:', effectiveWebhookUrl, 'files:', filesToUpload.length)

      const api = isBrowser ? mockApi : fotolismApi
      api.storage.uploadDriveSession({
        parentFolderId: eventConfig.gdriveFolderId || DEFAULT_GDRIVE_FOLDER_ID,
        subfolderName,
        files: filesToUpload,
        webhookUrl: effectiveWebhookUrl,
      }).then(async (res) => {
        if (res.success && res.data?.cloudFolderUrl && !res.data.cloudFolderUrl.includes(DEFAULT_GDRIVE_FOLDER_ID)) {
          console.log('[CaptureScreen] Background Drive upload SUCCESS! Subfolder:', res.data.cloudFolderUrl)
          setCloudFolderUrl(res.data.cloudFolderUrl)
          setGdriveUrl(res.data.cloudFolderUrl)
          setIsSyncingDrive(false)
          setDriveSyncDone(true)
        } else {
          console.warn('[CaptureScreen] Background IPC upload returned fallback/error, trying direct fetch...')
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
              console.log('[CaptureScreen] Background direct fetch upload SUCCESS:', directJson.folderUrl)
              setCloudFolderUrl(directJson.folderUrl)
              setGdriveUrl(directJson.folderUrl)
              setIsSyncingDrive(false)
              setDriveSyncDone(true)
              return
            }
          } catch (directErr) {
            console.warn('[CaptureScreen] Background direct fetch failed:', directErr)
          }

          setIsSyncingDrive(false)
          setDriveSyncDone(false)
          setDriveSyncError(res.error || 'Chưa thể tạo thư mục Google Drive.')
        }
      }).catch((err) => {
        console.error('[CaptureScreen] Background Drive upload exception:', err)
        setIsSyncingDrive(false)
        setDriveSyncDone(false)
        setDriveSyncError(err.message || 'Lỗi kết nối tải ảnh lên Drive.')
      })
    }

    // Selfbooth Flow: Bỏ màn chọn ảnh ghép frame, chuyển thẳng sang màn processing đẩy ảnh và QR
    setScreen('processing')
  }

  useEffect(() => {
    finishSelfboothRef.current = handleFinishSelfboothToReview
  })

  // Hủy buổi chụp và làm mới (chỉ được phép chụp lại từ đầu 1 lần)
  function handleResetShootSession() {
    if (sessionResetCount >= 1) return
    setSessionResetCount((c) => c + 1)
    setIsSessionActive(false)
    setIsCapturingShot(false)
    setIsSelfboothRunning(false)
    setSlots(Array(totalShots).fill(null))
    setRetakeSlotIndex(null)
    setSlotDeleteCounts({})
    setSelfboothLibrary([])
    setSelfboothSecondsLeft(totalDuration)
    setShowFinishConfirm(false)
  }

  return (
    <div className="capture-screen-pastel" id="capture-screen">
      {/* Screen Flash Animation */}
      {showFlash && <div className="screen-flash" />}

      {/* Focus Dim Backdrop: Làm tối xung quanh khi đang chụp photobooth */}
      {isSessionActive && !isSelfboothMode && <div className="focus-dim-backdrop" />}

      {/* ── Top Bar: Timer / Countdown (Đã xóa hoàn toàn nút quay lại, x thoát và cài đặt) ── */}
      <header className="capture-top-bar">
        <div className="capture-top-left">
          {isSelfboothMode ? (
            /* Đồng hồ đếm ngược Selfbooth góc trái (05:00 -> 00:00) */
            <div className={`selfbooth-elapsed-timer-badge ${selfboothSecondsLeft < 30 ? 'warning' : ''}`}>
              <Clock size={18} className={selfboothSecondsLeft < 30 ? 'pulse-warning' : ''} />
              <span className="selfbooth-timer-label">Còn lại:</span>
              <span className="selfbooth-timer-digits">{formatElapsedTime(selfboothSecondsLeft)}</span>
            </div>
          ) : (
            <div className="countdown-capsule-group">
              {[5, 3].map((sec) => {
                const isLocked = isSessionActive || slots.some(Boolean) || isCapturingShot
                return (
                  <button
                    key={sec}
                    className={`countdown-pill ${countdownSeconds === sec ? 'active' : ''} ${isLocked ? 'locked-disabled' : ''}`}
                    onClick={() => !isLocked && setCountdownSeconds(sec)}
                    disabled={isLocked}
                    title={isLocked ? 'Đã bắt đầu chụp, không thể thay đổi số giây' : `Thời gian đếm ngược ${sec} giây`}
                  >
                    <span>{sec}s</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Right utility options: Trống hoàn toàn — một khi vào màn chụp chỉ có thể chụp và kết thúc */}
        <div className="top-utility-actions" />
      </header>

      {/* ── Main Stage Area: 1/12 Dock + 9/12 Live View + 2/12 Vertical Slots (hoặc Full trong Selfbooth) ── */}
      <div className={`capture-main-stage ${isSelfboothMode ? 'selfbooth-stage' : ''}`}>
        {/* ── CỘT 1/12: Bộ lọc màu nhanh (Chỉ hiển thị trong Photobooth) ── */}
        {!isSelfboothMode && (
          <aside className={`dock-grid-col-1 left-sidebar-dock ${(isSessionActive || slots.some(Boolean) || isCapturingShot) ? 'locked-dimmed' : ''}`}>
            <button
              className={`dock-btn ${activeFlyout === 'filter' ? 'active' : ''}`}
              onClick={() => {
                if (isSessionActive || slots.some(Boolean) || isCapturingShot) return
                setActiveFlyout(activeFlyout === 'filter' ? null : 'filter')
              }}
              disabled={isSessionActive || slots.some(Boolean) || isCapturingShot}
              title="Bộ lọc màu ảnh"
              aria-label="Bộ lọc màu"
            >
              <Palette size={28} strokeWidth={1.8} />
            </button>
          </aside>
        )}

        {/* ── Flyout Panel 1: Bộ Lọc Màu (Color Filter) ── */}
        {activeFlyout === 'filter' && (
          <div className="flyout-panel animate-pop">
            <div className="flyout-header">
              <span className="flyout-title">Bộ Lọc Màu</span>
              <button className="flyout-close-btn" onClick={() => setActiveFlyout(null)}>
                ✕
              </button>
            </div>

            <div className="flyout-content">
              <div className="filter-presets-container">
                <div className="filter-presets-list">
                  {COLOR_FILTERS.map((filter) => {
                    const isSelected = selectedFilter?.id === filter.id
                    return (
                      <button
                        key={filter.id}
                        className={`filter-preset-card ${isSelected ? 'active' : ''}`}
                        onClick={() => selectFilter(filter)}
                      >
                        <div
                          className="filter-preview-chip"
                          style={{
                            background: filter.previewColor,
                            border: filter.id === 'normal' ? '1.5px solid #E6D9CF' : 'none',
                          }}
                        />
                        <div className="filter-card-info">
                          <span className="filter-card-name">{filter.name}</span>
                        </div>
                        {isSelected && <span className="filter-card-check">✓</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── CỘT LIVE VIEW: Chiếm 9/12 trong Photobooth hoặc Chiếm trọn màn hình trong Selfbooth ── */}
        <div className={isSelfboothMode ? 'liveview-selfbooth-full' : 'liveview-grid-col-9'}>
          <div
            className={`camera-viewfinder-wrapper ${isSessionActive && !isPhotoboothFull ? 'shooting-focus' : ''} ${
              isSelfboothMode ? (isFlashCoolingDown ? 'selfbooth-cooling-down' : 'selfbooth-clickable') : ''
            }`}
            onClick={() => {
              if (isSelfboothMode && !isCapturingShot && !isFlashCoolingDown) {
                handleTakeSelfboothShot()
              }
            }}
          >
            {hasCamera ? (
              <>
                <BeautyCameraView
                  ref={beautyCameraRef}
                  stream={isCanonDaemonActive ? null : activeMediaStream}
                  mjpegUrl={isCanonDaemonActive && !(typeof window !== 'undefined' && window.location.search.includes('noLiveStream=1')) ? 'http://127.0.0.1:8899/liveview' : undefined}
                  mirrorCamera={mirrorCamera}
                  slimFace={slimFace}
                  vLine={vLine}
                  bigEyes={bigEyes}
                  skinSmoothing={skinSmoothing}
                  whiteningTone={whiteningTone}
                  rosyTone={rosyTone}
                  glowClarity={glowClarity}
                  brightnessAdjust={brightnessAdjust}
                  contrastAdjust={contrastAdjust}
                  saturationAdjust={saturationAdjust}
                  style={{
                    filter: selectedFilter?.cssFilter && selectedFilter.cssFilter !== 'none' ? selectedFilter.cssFilter : undefined,
                  }}
                  className="camera-preview-element"
                />
                {cameraFreezeFrame && (
                  <img
                    src={cameraFreezeFrame}
                    alt="Capture Freeze"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      zIndex: 2,
                      pointerEvents: 'none',
                    }}
                  />
                )}
                {selectedFilter?.id === 'retro_90s' && (
                  <div className="retro-film-grain-overlay" style={{ zIndex: 3 }} />
                )}
                {/* Thẻ video nguồn dự phòng cấp thấp luôn phát stream camera */}
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: 1,
                    height: 1,
                    opacity: 0.01,
                    pointerEvents: 'none',
                    zIndex: -999,
                  }}
                />
              </>
            ) : (
              <div className="camera-connecting-wrapper">
                <Loader2 size={46} className="camera-connecting-spin" strokeWidth={2.4} />
                <p className="camera-connecting-text">Đang kết nối</p>
              </div>
            )}

            {/* Ring Light Overlay effect */}
            {ringLightEnabled && (
              <div
                className="ring-light-overlay"
                style={{
                  borderWidth: `${Math.round(16 + (ringLightLevel / 100) * 20)}px`,
                  opacity: ringLightLevel / 100,
                }}
              />
            )}

            {/* ── Khung Giới Hạn Tỉ Lệ Chuẩn (Safe Area Viewfinder Guide) cho khách đứng đúng khuôn hình (Chỉ dùng cho Photobooth) ── */}
            {!isSelfboothMode && (
              <div className="capture-aspect-guide-overlay">
                <div
                  className="capture-aspect-guide-box"
                  style={{
                    aspectRatio: `${targetSlotDimensions.w} / ${targetSlotDimensions.h}`,
                  }}
                >
                  <div className="guide-corner top-left" />
                  <div className="guide-corner top-right" />
                  <div className="guide-corner bottom-left" />
                  <div className="guide-corner bottom-right" />

                  <div className="guide-hint-text">
                    Đứng trong khung này để không bị cắt ảnh
                  </div>
                </div>
              </div>
            )}

            {/* ── Màn hình Lazy Loading xoay xoay trong 2.5s hồi đèn flash cho Selfbooth ── */}
            {isSelfboothMode && isFlashCoolingDown && (
              <div className="selfbooth-loading-overlay animate-fade-in">
                <div className="selfbooth-loading-spinner-box">
                  <div className="selfbooth-spinner-ring" />
                </div>
              </div>
            )}

            {/* Countdown digits overlay */}
            {!isSelfboothMode && isCapturingShot && currentCountdown > 0 && (
              <div className="multi-shot-countdown-overlay">
                <div className="countdown-digits-translucent">{currentCountdown}</div>
              </div>
            )}

            {/* Flying Snap Effect Animation */}
            {snapshotFlyer && (
              <div className="snapshot-flying-overlay">
                <div className="snapshot-card-animate">
                  <img src={snapshotFlyer.photoUrl} alt="Just Captured" />
                  <div
                    className="snapshot-card-badge"
                    style={
                      snapshotFlyer.isEdsdk
                        ? { background: 'linear-gradient(135deg, #0284c7, #0ea5e9)', color: '#ffffff', fontWeight: 800 }
                        : undefined
                    }
                  >
                    {isSelfboothMode
                      ? snapshotFlyer.isEdsdk
                        ? `📸 Canon R100 (24MP) • Đã lưu ảnh ${selfboothLibrary.length}`
                        : `✨ Đã thêm vào bộ sưu tập (${selfboothLibrary.length} ảnh)`
                      : snapshotFlyer.isEdsdk
                        ? `📸 Canon R100 (24MP) ➔ Ô ${snapshotFlyer.slotIndex + 1}`
                        : `✨ Đã lưu vào ô ${snapshotFlyer.slotIndex + 1}`}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── CỘT DẢI Ô DỌC: Chỉ hiển thị trong Photobooth ── */}
        {!isSelfboothMode && (
          <aside className="slots-grid-col-2 right-slots-dock">
            <div className={`live-slots-deck vertical-slots-deck ${totalShots >= 6 ? 'multi-col-deck' : ''} shots-${totalShots} frame-${selectedFrameSize}`}>
              <div className={`live-slots-list ${totalShots >= 6 ? 'slots-grid-2cols' : ''} shots-${totalShots}`}>
                {Array.from({ length: totalShots }).map((_, index) => {
                  const slotItem = slots[index]
                  const isFilled = slotItem !== null
                  const isRetaking = retakeSlotIndex === index
                  const isJustCaptured = justCapturedSlot === index
                  const isCenteredLast = totalShots === 9 && index === 8
                  const deleteCount = slotDeleteCounts[index] || 0
                  const canDelete = deleteCount < 2

                  return (
                    <div
                      key={index}
                      className={`live-slot-thumb slot-ratio-${is2x6 ? '2x6' : is9Grid ? '4x6-9' : '4x6-4'} ${isFilled ? 'filled' : 'empty'} ${isRetaking ? 'retaking-target' : ''} ${isJustCaptured ? 'just-captured' : ''} ${isCenteredLast ? 'slot-thumb-centered-last' : ''}`}
                      onClick={() => {
                        if (!isCapturingShot) {
                          if (isFilled) {
                            if (canDelete) {
                              handleDeleteSlot(index)
                            }
                          } else {
                            setRetakeSlotIndex(index)
                          }
                        }
                      }}
                      title={
                        isFilled
                          ? canDelete
                            ? `Bấm ✕ để xóa ảnh ô ${index + 1} và chụp lại ảnh khác (còn ${2 - deleteCount} lần)`
                            : `Ô ${index + 1} đã hết 2 lượt xóa chụp lại`
                          : `Ô ${index + 1} đang chờ chụp`
                      }
                    >
                      {isFilled ? (
                        <>
                          <img src={slotItem.compositedPath || slotItem.rawPath} alt={`Slot ${index + 1}`} />
                          <span className="slot-index-badge">{index + 1}</span>
                          {!isCapturingShot && canDelete && (
                            <button
                              className="slot-delete-btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteSlot(index)
                              }}
                              title={`Xóa ảnh ô ${index + 1} để chụp lại (còn ${2 - deleteCount} lần)`}
                              aria-label={`Xóa ảnh ô ${index + 1}`}
                            >
                              ✕
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="slot-empty-content">
                          <span className="slot-empty-plus">+</span>
                          <span className="slot-empty-label">Ô {index + 1}</span>
                          {isRetaking && (
                            <span className="slot-retake-used-tag">Chụp lại</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="live-slots-counter">
                {filledSlotsCount}/{totalShots}
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* ── Bottom Deck: Shutter Action Control (Căn thẳng theo Live View 9/12) ── */}
      <footer className="capture-bottom-deck">
        {!isSelfboothMode ? (
          /* ── PHOTOBOOTH MODE CONTROLS ── */
          <div className="bottom-deck-12col">
            <div className="shutter-col-1" />
            <div className="shutter-col-9">
              <div className="capture-shutter-container">
                {isPhotoboothFull && retakeSlotIndex === null ? (
                  /* ĐÃ ĐỦ FULL ẢNH: Nút Hài Lòng & Tiếp Tục */
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <button
                      className="start-capture-btn-pink proceed-glow-btn"
                      id="proceed-theme-button"
                      onClick={handleProceedPhotobooth}
                    >
                      <span>Tiếp Tục Chọn Frame</span>
                    </button>
                  </div>
                ) : (
                  /* CHƯA ĐỦ ẢNH HOẶC ĐANG CHỤP LẠI (RETAKE) */
                  <button
                    className="start-capture-btn-pink"
                    id="start-capture-button"
                    disabled={isCapturingShot}
                    onClick={handleTakePhotoboothShot}
                  >
                    <Camera size={26} strokeWidth={2} />
                    <span>
                      {isCapturingShot
                        ? `Đang đếm ngược...`
                        : retakeSlotIndex !== null
                          ? `📸 Chụp Lại Ô ${retakeSlotIndex + 1}`
                          : filledSlotsCount === 0
                            ? `Bắt đầu chụp (Ảnh 1 / ${totalShots})`
                            : `Chụp tiếp ảnh ${filledSlotsCount + 1} / ${totalShots}`}
                    </span>
                  </button>
                )}

                <div className="capture-aux-action-slot">
                  {isSessionActive && !isCapturingShot ? (
                    sessionResetCount < 1 ? (
                      <button
                        className="cancel-shoot-btn"
                        onClick={handleResetShootSession}
                        title="Chỉ được phép chụp lại từ đầu 1 lần duy nhất"
                      >
                        ↩ Chụp lại từ đầu (Còn 1 lần)
                      </button>
                    ) : (
                      <span className="cancel-shoot-used-text" title="Bạn đã dùng hết lượt chụp lại từ đầu">
                        🔒 Đã dùng lượt chụp lại (1/1)
                      </span>
                    )
                  ) : null}
                </div>
              </div>
            </div>
            <div className="shutter-col-2" />
          </div>
        ) : (
          /* ── SELFBOOTH MODE CONTROLS: CHỈ DUY NHẤT 1 NÚT KẾT THÚC CÓ POPUP CONFIRM ── */
          <div className="selfbooth-bottom-single-deck">
            <button
              className={`btn-selfbooth-finish-main ${isCapturingShot || isFlashCoolingDown ? 'is-disabled' : ''}`}
              disabled={isCapturingShot || isFlashCoolingDown}
              onClick={() => {
                if (isCapturingShot || isFlashCoolingDown) return
                setShowFinishConfirm(true)
              }}
              id="selfbooth-finish-button"
            >
              <span>KẾT THÚC</span>
            </button>
          </div>
        )}
      </footer>

      {/* ── POPUP CONFIRM KẾT THÚC BUỔI CHỤP SELFBOOTH ── */}
      {showFinishConfirm && (
        <div className="selfbooth-confirm-overlay" onClick={() => setShowFinishConfirm(false)}>
          <div className="selfbooth-confirm-modal animate-pop" onClick={(e) => e.stopPropagation()}>
            <h3 className="selfbooth-confirm-title">Xác nhận kết thúc?</h3>
            <div className="selfbooth-confirm-btn-group">
              <button
                className="btn-selfbooth-modal-cancel"
                onClick={() => setShowFinishConfirm(false)}
              >
                Không
              </button>
              <button
                className="btn-selfbooth-modal-confirm"
                onClick={() => {
                  setShowFinishConfirm(false)
                  handleFinishSelfboothToReview()
                }}
              >
                Có
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
