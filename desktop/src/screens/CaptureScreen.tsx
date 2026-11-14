import ConnectedReferenceView from '../components/reference/ConnectedReferenceView'
import { useState, useRef, useEffect, useCallback } from 'react'
import {
    useAppStore,
    COLOR_FILTERS,
    type CapturedPhoto,
} from '../store/appStore'
import { fotolismApi, isBrowser, mockApi, api } from '../lib/api'
import {
    FILE_PREFIX_SHOT,
    FILE_PREFIX_SELF,
    FILE_PREFIX_FINAL,
    DEFAULT_PRINT_SCALE,
    DEFAULT_SELFBOOTH_DURATION_SECONDS,
    isRemoteTriggerEvent,
} from '../lib/constants'
import {
    BeautyCameraView,
    type BeautyCameraHandle,
} from '../components/BeautyCameraView'
import { CaptureAspectGuide } from '../components/capture/CaptureAspectGuide'
import { LiveSlotsDock } from '../components/capture/LiveSlotsDock'
import {
    cropImageToAspect,
    generateStripComposite,
    preparePrintImageForDNP,
} from '../lib/canvasCompositor'
import { Camera, Palette, Loader2, Clock } from 'lucide-react'
import './CaptureScreen.css'
import { isPhotoEnhanced } from '../lib/enhanceState'

// ── Giả lập âm thanh màn trập cơ học "TÁCH!" dứt khoát 1 lần duy nhất qua Web Audio API ──
function playCameraShutterSound() {
    try {
        const AudioContextClass =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
                .webkitAudioContext
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
    } catch {}
}

export default function CaptureScreen() {
    const {
        session,
        setScreen,
        setSessionPhotos,
        setCompositeStripUrl,
        selectedTheme,
        placedStickers,
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
        beautyEnabled,
        setBeautyEnabled,
        slimFace,
        vLine,
        bigEyes,
        skinSmoothing,
        setSkinSmoothing,
        skinToneEvenness,
        blush,
        whiteningTone,
        brightnessAdjust,
        contrastAdjust,
        saturationAdjust,
        rosyTone,
        glowClarity,
        getBeautyFilterCss,
        photoboothSessionEndTime,
        startPhotoboothSessionTimer,
    } = useAppStore()

    const videoRef = useRef<HTMLVideoElement | null>(null)
    const beautyCameraRef = useRef<BeautyCameraHandle>(null)
    const currentStreamRef = useRef<MediaStream | null>(null)
    const [activeMediaStream, setActiveMediaStream] =
        useState<MediaStream | null>(null)
    const pendingCapturesRef = useRef<Set<string>>(new Set())
    const totalShots = selectedLayout.photosCount || 4
    const isSelfboothMode = eventConfig.captureMode === 'selfbooth'

    useEffect(() => {
        if (!isSelfboothMode && !photoboothSessionEndTime) {
            startPhotoboothSessionTimer()
        }
    }, [isSelfboothMode, photoboothSessionEndTime, startPhotoboothSessionTimer])

    // Đảm bảo AI nhận diện khuôn mặt (MediaPipe) và làm mịn da (WebGL) luôn bật trên Live View
    useEffect(() => {
        if (!beautyEnabled) {
            setBeautyEnabled(true)
        }
        if (skinSmoothing <= 0) {
            setSkinSmoothing(45)
            setSkinSmoothing(60)
        }
    }, [beautyEnabled, skinSmoothing, setBeautyEnabled, setSkinSmoothing])

    // Xác định tỉ lệ và kích thước ô chuẩn theo Single Source of Truth:
    // - Khung 4 ảnh 2x6: 528 x 352 (tỉ lệ 3:2 = 1.5)
    // - Khung 4 ảnh 4x6: 544 x 726 (tỉ lệ 272:363 ≈ 0.7493)
    // - Khung 9 ảnh 4x6: 281 x 580 (tỉ lệ 281:580 ≈ 0.4845)
    const is2x6 = selectedFrameSize === '2x6'
    const is9Grid = selectedLayout.photosCount === 9
    const targetSlotDimensions = is2x6
        ? { w: 528, h: 352, label: '528×352' }
        : is9Grid
          ? { w: 281, h: 580, label: '281×580' }
          : { w: 544, h: 726, label: '544×726' }

    // ── Tính toán khung vàng (Safe Area Viewfinder Guide) trong vùng Live View 3:2 ──
    // - Khung vàng sử dụng chính xác tỷ lệ của ô ảnh trong layout.
    // - Tự động co từ hai bên vào, căn giữa Live View.
    // - Ưu tiên giữ chiều cao tối đa (100%) trong Live View; tính lại chiều rộng theo tỷ lệ.
    // - Nếu chiều rộng vượt quá hiển thị, tự động thu nhỏ cả hai chiều để nằm trọn trong Live View.
    const slotAspect = targetSlotDimensions.w / targetSlotDimensions.h
    const liveAspect = 3 / 2
    const guideBoxStyle: React.CSSProperties =
        slotAspect <= liveAspect
            ? {
                  height: '100%',
                  width: `${((slotAspect / liveAspect) * 100).toFixed(4)}%`,
                  aspectRatio: `${targetSlotDimensions.w} / ${targetSlotDimensions.h}`,
              }
            : {
                  width: '100%',
                  height: `${((liveAspect / slotAspect) * 100).toFixed(4)}%`,
                  aspectRatio: `${targetSlotDimensions.w} / ${targetSlotDimensions.h}`,
              }

    const [hasCamera, setHasCamera] = useState<boolean>(false)
    const [activeFlyout, setActiveFlyout] = useState<'filter' | null>(null)

    // ── Trạng thái chung khi chụp ──
    const [isSessionActive, setIsSessionActive] = useState<boolean>(false)
    const [isCapturingShot, setIsCapturingShot] = useState<boolean>(false)
    const [currentCountdown, setCurrentCountdown] = useState<number>(3)
    const [showFlash, setShowFlash] = useState<boolean>(false)
    const [snapshotFlyer, setSnapshotFlyer] = useState<{
        photoUrl: string
        slotIndex: number
        isEdsdk?: boolean
    } | null>(null)
    const [justCapturedSlot, setJustCapturedSlot] = useState<number | null>(
        null
    )
    const [cameraFreezeFrame, setCameraFreezeFrame] = useState<string | null>(
        null
    )

    // ── Session ID cho Fotolism 2.2 SQLite & Idempotency ──
    const [sessionId] = useState<string>(
        () =>
            session?.pinCode ||
            session?.sessionId ||
            `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    )

    // ── Chế độ PHOTOBOOTH CỔ ĐIỂN (Có Retake / Xóa ô xấu) ──
    const [slots, setSlots] = useState<(CapturedPhoto | null)[]>(
        Array(totalShots).fill(null)
    )
    const slotsRef = useRef<(CapturedPhoto | null)[]>(slots)
    slotsRef.current = slots
    const [retakeSlotIndex, setRetakeSlotIndex] = useState<number | null>(null)
    // Số lần đã xóa chụp lại của từng ô (mỗi ô tối đa 2 lần xóa)
    const [slotDeleteCounts, setSlotDeleteCounts] = useState<
        Record<number, number>
    >({})
    // Giới hạn lượt chụp lại: chỉ chụp lại từ đầu tối đa 1 lần
    const [sessionResetCount, setSessionResetCount] = useState<number>(0)
    // Trạng thái chờ xử lý AI Enhance trước khi chuyển sang màn hình Chọn Theme/Frame
    const [isAiProcessingBeforeTheme, setIsAiProcessingBeforeTheme] =
        useState<boolean>(false)
    const [aiProgressText, setAiProgressText] = useState<string>('')
    const [aiProcessingError, setAiProcessingError] = useState<string | null>(null)
    const isProceedingRef = useRef<boolean>(false)
    const proceedPhotoboothRef = useRef<
        ((options?: { allowPartialOnTimeout?: boolean }) => Promise<void>) | null
    >(null)

    useEffect(() => {
        // Đánh thức Canon Daemon và gia hạn shutdown timer
        fetch('http://127.0.0.1:8899/wake').catch(() => {})

        // Khởi tạo phiên trong SQLite persistent session storage (FR-06)
        api.session
            ?.create({
                id: sessionId,
                status: 'ACTIVE',
                started_at: new Date().toISOString(),
                total_slots: totalShots,
                layout_id: selectedLayout?.id,
                payment_status: 'PAID',
                print_copies: selectedCopies || 1,
            })
            .catch(console.warn)
    }, [sessionId, totalShots, selectedLayout?.id, selectedCopies])

    // ── Chế độ SELFBOOTH (Chụp tự do không giới hạn & Bấm remote 2.5s hồi đèn flash) ──
    const SELFBOOTH_FLASH_RECYCLE_MS = 2500
    const [isSelfboothRunning, setIsSelfboothRunning] = useState<boolean>(false)
    const [selfboothLibrary, setSelfboothLibrary] = useState<CapturedPhoto[]>(
        []
    )
    const selfboothLibraryRef = useRef(selfboothLibrary)
    selfboothLibraryRef.current = selfboothLibrary
    const [isCanonDaemonActive, setIsCanonDaemonActive] =
        useState<boolean>(false)
    const [showFinishConfirm, setShowFinishConfirm] = useState<boolean>(false)
    const [isFlashCoolingDown, setIsFlashCoolingDown] = useState<boolean>(false)

    // Khởi động Camera thiết bị
    const startCamera = useCallback(
        async (deviceId?: string) => {
            // Gửi tín hiệu đánh thức camera daemon trước khi khởi động luồng
            fetch('http://127.0.0.1:8899/wake').catch(() => {})
            // 0. Kiểm tra Canon Persistent Daemon (Direct EDSDK)
            const userCameraType = useAppStore.getState().cameraType
            let daemonActive = false
            try {
                const daemonRes = await (
                    isBrowser ? mockApi : fotolismApi
                ).camera.canonDaemonStatus?.()
                if (daemonRes?.success && daemonRes.data?.running) {
                    daemonActive = true
                }
            } catch {}

            // Lấy toàn bộ danh sách thiết bị video của hệ thống
            let allDevices: MediaDeviceInfo[] = []
            try {
                allDevices = await navigator.mediaDevices.enumerateDevices()
            } catch {}

            // Kiểm tra xem người dùng có đang cố tình chọn một webcam phụ (ví dụ webcam laptop) hay không
            const isExplicitNonCanonWebcam =
                Boolean(deviceId) &&
                deviceId !== 'canon-daemon-stream' &&
                !/canon|eos/i.test(deviceId || '') &&
                allDevices.some(
                    (d) =>
                        d.deviceId === deviceId && !/canon|eos/i.test(d.label)
                )

            // NẾU Canon Daemon đang hoạt động và không chọn webcam phụ khác -> BẮT BUỘC dùng luồng Canon EDSDK trực tiếp
            if (
                daemonActive &&
                !isExplicitNonCanonWebcam &&
                userCameraType !== 'laptop'
            ) {
                if (currentStreamRef.current) {
                    currentStreamRef.current
                        .getTracks()
                        .forEach((track) => track.stop())
                    currentStreamRef.current = null
                }
                setActiveMediaStream(null)
                setIsCanonDaemonActive(true)
                selectCamera('canon-daemon-stream')
                setHasCamera(true)

                // Lọc bỏ HOÀN TOÀN driver ảo EOS Webcam Utility (DirectShow) để không bao giờ chiếm cổng USB của máy ảnh
                const nonCanonDevices = allDevices
                    .filter(
                        (d) =>
                            d.kind === 'videoinput' &&
                            !/eos|canon/i.test(d.label)
                    )
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
                currentStreamRef.current
                    .getTracks()
                    .forEach((track) => track.stop())
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
                    const storedDev = videoDevices.find(
                        (d) => d.id === storedId
                    )
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
                        video: targetId
                            ? {
                                  ...videoConstraints,
                                  deviceId: { exact: targetId },
                              }
                            : videoConstraints,
                        audio: false,
                    })
                } catch {
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: targetId
                            ? {
                                  ...videoConstraints,
                                  deviceId: { ideal: targetId },
                              }
                            : true,
                        audio: false,
                    })
                }

                currentStreamRef.current = stream
                setActiveMediaStream(stream)

                const actualTrack = stream.getVideoTracks()[0]
                const actualDeviceId =
                    actualTrack?.getSettings()?.deviceId || targetId
                if (actualDeviceId) {
                    selectCamera(actualDeviceId)
                }

                if (videoRef.current) {
                    videoRef.current.srcObject = stream
                    videoRef.current
                        .play()
                        .catch((e) => console.warn('Play video error:', e))
                }

                setHasCamera(true)
            } catch (err) {
                console.warn(
                    'Cannot connect camera with constraints, trying fallback:',
                    err
                )
                try {
                    const fallbackStream =
                        await navigator.mediaDevices.getUserMedia({
                            video: true,
                            audio: false,
                        })
                    currentStreamRef.current = fallbackStream
                    setActiveMediaStream(fallbackStream)
                    const actualTrack = fallbackStream.getVideoTracks()[0]
                    const fallbackId = actualTrack?.getSettings()?.deviceId
                    if (fallbackId) {
                        selectCamera(fallbackId)
                    }
                    if (videoRef.current) {
                        videoRef.current.srcObject = fallbackStream
                        videoRef.current.play().catch(() => {})
                    }
                    setHasCamera(true)
                } catch (fallbackErr) {
                    console.error('All camera attempts failed:', fallbackErr)
                    setHasCamera(false)
                }
            }
        },
        [setCameras, selectCamera]
    )

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
                currentStreamRef.current
                    .getTracks()
                    .forEach((track) => track.stop())
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
                const daemonRes = await (
                    isBrowser ? mockApi : fotolismApi
                ).camera.canonDaemonStatus?.()
                if (daemonRes?.success && daemonRes.data?.running) {
                    console.log(
                        '⚡ [CaptureScreen] Canon EOS Daemon detected active, auto-switching to live stream...'
                    )
                    startCamera('canon-daemon-stream')
                }
            } catch {}
        }, 2000)

        return () => clearInterval(probeTimer)
    }, [isCanonDaemonActive, startCamera])

    const finishSelfboothRef = useRef<() => void>(() => {})

    // Tự động kích hoạt phiên Selfbooth khi vào màn hình (không giới hạn thời gian)
    useEffect(() => {
        if (isSelfboothMode) {
            setIsSelfboothRunning(true)
            setIsSessionActive(true)
        }
    }, [isSelfboothMode])

    // Đồng hồ đếm ngược thời gian chụp Selfbooth (05:00 -> 00:00). Hết giờ tự động out ra review
    const totalDuration =
        eventConfig.selfboothDurationSeconds ||
        DEFAULT_SELFBOOTH_DURATION_SECONDS
    const [selfboothSecondsLeft, setSelfboothSecondsLeft] =
        useState<number>(totalDuration)
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
            if (
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement
            )
                return
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
    }, [
        isSelfboothMode,
        isCapturingShot,
        isFlashCoolingDown,
        isSelfboothRunning,
        handleTakeSelfboothShot,
    ])

    // Chụp 1 khung hình từ video sang DataURL với bảo đảm không bao giờ trả về ảnh đen
    function grabVideoFrame(): string {
        // 1. Chụp từ WebGL Beauty Camera (đã có kiểm tra readPixels chống đen do swapchain)
        if (beautyCameraRef.current) {
            const liveFrame = beautyCameraRef.current.captureFrame()
            if (
                liveFrame &&
                liveFrame.length > 1000 &&
                !liveFrame.startsWith('data:,')
            ) {
                return liveFrame
            }
        }

        // 2. Dự phòng trực tiếp: Canvas 2D lấy từ video element đang chạy
        const video =
            beautyCameraRef.current?.getVideoElement() || videoRef.current
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

                // Kiosk: Ảnh chụp xong luôn luôn lật gương
                ctx.translate(w, 0)
                ctx.scale(-1, 1)

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
        } catch {}

        return ''
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // XỬ LÝ PHOTOBOOTH CỔ ĐIỂN (Retake / Xóa ô xấu)
    // ══════════════════════════════════════════════════════════════════════════════
    const filledSlotsCount = slots.filter(Boolean).length
    const isPhotoboothFull = filledSlotsCount === totalShots

    async function handleTakePhotoboothShot() {
        if (isCapturingShot || isFlashCoolingDown) return
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
            const rawFileName = `${FILE_PREFIX_SHOT}_${targetIndex + 1}_${timestamp}.jpg`
            const rawSavePath = `F:\\Fotolism_image\\sessions\\${sessionId}\\raw\\${rawFileName}`
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
            setIsFlashCoolingDown(true)
            setTimeout(
                () => setIsFlashCoolingDown(false),
                SELFBOOTH_FLASH_RECYCLE_MS
            )

            // 2. Chụp khung hình tại đúng 0s (người dùng đã cười tươi tạo dáng xong)
            let photoDataUrl = grabVideoFrame()
            if (photoDataUrl) {
                // Cắt crop theo đúng tỉ lệ chuẩn của ô layout (528x352, 544x726, 381x580)
                photoDataUrl = await cropImageToAspect(
                    photoDataUrl,
                    targetSlotDimensions.w,
                    targetSlotDimensions.h
                )
                setCameraFreezeFrame(photoDataUrl)
            }
            const photoPath =
                photoDataUrl || `photo_${timestamp}_${targetIndex + 1}.jpg`

            const newPhoto: CapturedPhoto = {
                id: `photo_${timestamp}_${targetIndex + 1}`,
                rawPath: photoPath,
                enhancedPath: photoPath,
                compositedPath: photoPath,
                enhanceStatus: 'pending',
                timestamp,
            }

            // 3. Đẩy ảnh vào ô khung hình (Slot) NGAY LẬP TỨC (< 0.1s sau 0s)
            setSlots((prev) => {
                const nextSlots = [...prev]
                nextSlots[targetIndex] = newPhoto
                slotsRef.current = nextSlots
                return nextSlots
            })

            // Reset lại retake index sau khi chụp xong
            setRetakeSlotIndex(null)

            // Chỉ lưu ảnh gốc khi chụp; chỉ chạy AI xử lý ảnh khi hoàn tất các ô và chuyển sang màn Frame + Filter.
            if (!isCanonDaemonActive && photoDataUrl && photoDataUrl.startsWith('data:image')) {
                pendingCapturesRef.current.add(newPhoto.id)
                api.storage
                    .savePhoto(photoDataUrl, rawSavePath)
                    .then((saved) => {
                        if (!saved.success) throw new Error(saved.error || 'Không thể lưu ảnh gốc')
                        setSlots((prev) => {
                            const next = [...prev]
                            if (next[targetIndex]?.id === newPhoto.id) {
                                next[targetIndex] = {
                                    ...next[targetIndex]!,
                                    rawPath: rawSavePath,
                                }
                            }
                            slotsRef.current = next
                            return next
                        })
                    })
                    .catch((err) => console.warn('Save photo error:', err))
                    .finally(() => {
                        pendingCapturesRef.current.delete(newPhoto.id)
                    })
            }

            // 6. PHƯƠNG ÁN 2: KÍCH HOẠT MÁY ẢNH CANON EOS THẬT (24MP FULL EXIF) - FOTOLISM 2.2 IDEMPOTENCY
            // CHỈ kích hoạt máy ảnh Canon khi Canon Daemon đang active (tránh treo giao diện khi dùng webcam)
            // Chạy hoàn toàn bất đồng bộ trong nền (Non-blocking), không cản trở luồng chụp và chuyển ô
            if (isCanonDaemonActive) {
                pendingCapturesRef.current.add(newPhoto.id)
                const captureId = `cap_${sessionId}_slot${targetIndex}_${Date.now()}`
                api.camera
                    .edsdkCapture({
                        captureId,
                        sessionId,
                        slotIndex: targetIndex,
                        savePath: rawSavePath,
                        shotIndex: targetIndex,
                    })
                    .then(async (res) => {
                        if (
                            res &&
                            res.success &&
                            res.data &&
                            res.data.savedPath
                        ) {
                            const canonData = res.data
                            console.log(
                                `[Method 2] Canon EOS 24MP captured: ${canonData.savedPath}`
                            )

                            const canonUrl =
                                canonData.dataUrl ||
                                `file://${canonData.savedPath.replace(/\\/g, '/')}`

                            setSlots((prev) => {
                                const next = [...prev]
                                if (next[targetIndex]?.id === newPhoto.id) {
                                    next[targetIndex] = {
                                        ...next[targetIndex]!,
                                        rawPath: canonData.savedPath,
                                        enhancedPath: canonUrl,
                                        compositedPath: canonUrl,
                                        enhanceStatus: 'pending',
                                    }
                                }
                                slotsRef.current = next
                                return next
                            })
                            setSnapshotFlyer((prev) =>
                                prev && prev.slotIndex === targetIndex
                                    ? {
                                          ...prev,
                                          photoUrl: canonUrl,
                                          isEdsdk: true,
                                      }
                                    : prev
                            )
                        }
                    })
                    .catch((err) => {
                        console.warn(
                            '[Method 2] Canon hardware capture fallback:',
                            err
                        )
                    })
                    .finally(() => {
                        pendingCapturesRef.current.delete(newPhoto.id)
                    })
            }

            // Xóa khung đóng băng camera ngay sau hiệu ứng chớp flash dứt khoát (< 350ms)
            setTimeout(() => setCameraFreezeFrame(null), 350)
            setTimeout(() => setSnapshotFlyer(null), 850)
            setTimeout(() => setJustCapturedSlot(null), 1400)

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
    async function handleProceedPhotobooth(options?: {
        allowPartialOnTimeout?: boolean
    }) {
        if (isProceedingRef.current) return
        const allowPartial = Boolean(options?.allowPartialOnTimeout)
        const initialPhotos = slotsRef.current.filter(
            (s): s is CapturedPhoto => s !== null
        )
        if (!allowPartial && initialPhotos.length < totalShots) return

        isProceedingRef.current = true
        setIsAiProcessingBeforeTheme(true)
        setAiProgressText('Đang xử lý ảnh AI...')
        setAiProcessingError(null)

        try {
            // Đợi toàn bộ tiến trình chụp và AI hoàn tất trong nền
            if (pendingCapturesRef.current.size > 0) {
                await new Promise((resolve) => {
                    const interval = setInterval(() => {
                        if (pendingCapturesRef.current.size === 0) {
                            clearInterval(interval)
                            resolve(true)
                        }
                    }, 100)
                })
            }
            await new Promise((resolve) => setTimeout(resolve, 150))

            // Đảm bảo 100% các ô đã chụp đều hoàn thành AI Enhance vào thư mục final (chạy song song đồng thời)
            const currentSlots = [...slotsRef.current]
            const api = isBrowser ? mockApi : fotolismApi
            await Promise.all(
                currentSlots.map(async (slot, i) => {
                    if (!slot) return
                    const hasAiEnhance = isPhotoEnhanced(slot)
                    if (!hasAiEnhance) {
                        try {
                            const timestamp = slot.timestamp || Date.now()
                            const enhancedFileName = `fotolism_enhanced_${i + 1}_${timestamp}.jpg`
                            const enhancedSavePath = `F:\\Fotolism_image\\sessions\\${sessionId}\\final\\${enhancedFileName}`
                            let rawPath = slot.rawPath
                            if (rawPath && rawPath.startsWith('data:image')) {
                                const rawFileName = `${FILE_PREFIX_SHOT}_${i + 1}_${timestamp}.jpg`
                                const rawSavePath = `F:\\Fotolism_image\\sessions\\${sessionId}\\raw\\${rawFileName}`
                                await api.storage.savePhoto(rawPath, rawSavePath)
                                rawPath = rawSavePath
                            }
                            if (rawPath && !rawPath.startsWith('data:image')) {
                                const enhRes = await api.ai.enhance(
                                    rawPath,
                                    50,
                                    'white_pink_v2',
                                    'natural',
                                    enhancedSavePath
                                )
                                if (enhRes?.success && enhRes?.data?.enhancedPath) {
                                    const enhUrl = `file://${enhRes.data.enhancedPath.replace(/\\/g, '/')}`
                                    currentSlots[i] = {
                                        ...slot,
                                        rawPath,
                                        enhancedPath: enhUrl,
                                        compositedPath: enhUrl,
                                        enhanceStatus: 'processed',
                                    }
                                }
                            }
                        } catch (enhErr) {
                            console.warn(`Fallback enhance for slot ${i + 1}:`, enhErr)
                        }
                    }
                })
            )

            slotsRef.current = currentSlots
            setSlots(currentSlots)

            const capturedSlots = currentSlots.filter(
                (s): s is CapturedPhoto => s !== null
            )
            if (capturedSlots.some((photo) => !isPhotoEnhanced(photo))) {
                setAiProcessingError(
                    'Một số ảnh chưa xử lý AI thành công. Ảnh gốc đã được giữ lại; hãy bấm tiếp tục để thử lại.'
                )
                return
            }

            if (capturedSlots.length === 0) {
                setIsSessionActive(false)
                setScreen('select-theme')
                return
            }

            let chosenPhotos = capturedSlots
            if (allowPartial && chosenPhotos.length < totalShots) {
                const filled = [...chosenPhotos]
                while (filled.length < totalShots) {
                    filled.push(filled[filled.length - 1])
                }
                chosenPhotos = filled.slice(0, totalShots)
            }
            setSessionPhotos(chosenPhotos)

            // ── TỰ ĐỘNG TẠO DẢI ẢNH THÀNH PHẨM & BẢN IN GHÉP 4X6 NGAY KHI KẾT THÚC LƯỢT CHỤP ──
            try {
                const photoUrls = chosenPhotos
                    .map((p) => p.compositedPath || p.enhancedPath || p.rawPath)
                    .filter(Boolean)
                if (photoUrls.length >= totalShots) {
                    const initialStrip = await generateStripComposite({
                        photos: photoUrls,
                        frameSize: selectedFrameSize,
                        layout: selectedLayout,
                        theme: selectedTheme,
                        stickers: placedStickers || [],
                        filter: selectedFilter,
                        eventName: eventConfig.eventName,
                        eventDate: eventConfig.date,
                        slotOffsets: [],
                    })
                    if (initialStrip) {
                        setCompositeStripUrl(initialStrip)
                        const currentPrintScale =
                            useAppStore.getState().printScale || DEFAULT_PRINT_SCALE
                        let paired4x6: string | null = null
                        try {
                            paired4x6 = await preparePrintImageForDNP(
                                initialStrip,
                                currentPrintScale
                            )
                        } catch (pairErr) {
                            console.warn(
                                '[CaptureScreen] preparePrintImageForDNP warning:',
                                pairErr
                            )
                        }
                        const compositeFileName = `${FILE_PREFIX_FINAL}_${selectedFrameSize}.jpg`
                        const pairedFileName =
                            selectedFrameSize === '2x6'
                                ? `${FILE_PREFIX_FINAL}_2x6_paired_4x6.jpg`
                                : `${FILE_PREFIX_FINAL}_4x6_scaled.jpg`

                        const finalized = await api.storage.finalizeSessionMedia({
                            sessionId,
                            sessionType: 'photobooth',
                            compositeDataUrl: initialStrip,
                            compositeFileName,
                            pairedPrintDataUrl: paired4x6 || undefined,
                            pairedPrintFileName: pairedFileName,
                            shots: chosenPhotos.map((p, idx) => ({
                                slotIndex: idx,
                                id: p.id || `shot_${idx + 1}`,
                                fileName: `${FILE_PREFIX_SHOT}_${idx + 1}.jpg`,
                                rawPath: p.rawPath,
                                enhancedPath: p.enhancedPath,
                            })),
                        })
                        if (!finalized.success) {
                            throw new Error(
                                finalized.error || 'Không thể xác minh ảnh AI'
                            )
                        }
                    }
                }
            } catch (compErr) {
                console.warn(
                    '[CaptureScreen] Auto-generating initial composite warning:',
                    compErr
                )
                setAiProcessingError(
                    'Chưa thể lưu ảnh final. Ảnh gốc được giữ nguyên; hãy thử lại.'
                )
                return
            }

            setIsSessionActive(false)
            setScreen('select-theme')
        } finally {
            setIsAiProcessingBeforeTheme(false)
            isProceedingRef.current = false
        }
    }

    proceedPhotoboothRef.current = handleProceedPhotobooth

    useEffect(() => {
        if (isSelfboothMode) return
        const onTimeout = () => {
            void proceedPhotoboothRef.current?.({ allowPartialOnTimeout: true })
        }
        window.addEventListener('fotolism:photobooth-capture-timeout', onTimeout)
        return () =>
            window.removeEventListener(
                'fotolism:photobooth-capture-timeout',
                onTimeout
            )
    }, [isSelfboothMode])

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
            const rawFileName = `${FILE_PREFIX_SELF}_${photoNum}_${timestamp}.jpg`
            const rawSavePath = `F:\\Fotolism_image\\sessions\\${sessionId}\\raw\\${rawFileName}`
            const enhancedFileName = `fotolism_enhanced_self_${photoNum}_${timestamp}.jpg`
            const enhancedSavePath = `F:\\Fotolism_image\\sessions\\${sessionId}\\final\\${enhancedFileName}`
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
            setIsFlashCoolingDown(true)
            setTimeout(
                () => setIsFlashCoolingDown(false),
                SELFBOOTH_FLASH_RECYCLE_MS
            )

            let photoDataUrl = grabVideoFrame()
            if (photoDataUrl) {
                setCameraFreezeFrame(photoDataUrl)
            }
            const photoPath =
                photoDataUrl || `selfbooth_${timestamp}_${photoNum}.jpg`

            const newPhoto: CapturedPhoto = {
                id: `selfbooth_${timestamp}_${photoNum}`,
                rawPath: photoPath,
                enhancedPath: photoPath,
                compositedPath: photoPath,
                enhanceStatus: 'pending',
                timestamp,
            }

            setSelfboothLibrary((prev) => [...prev, newPhoto])

            // Khi dùng Canon, preview chỉ hiển thị; chỉ ảnh cảm biến được lưu và enhance.
            if (!isCanonDaemonActive && photoDataUrl && photoDataUrl.startsWith('data:image')) {
                pendingCapturesRef.current.add(newPhoto.id)
                selfApi.storage
                    .savePhoto(photoDataUrl, rawSavePath)
                    .then((saved) => {
                        if (!saved.success) throw new Error(saved.error || 'Không thể lưu ảnh gốc')
                        return selfApi.ai
                            .enhance(
                                rawSavePath,
                                50,
                                'white_pink_v2',
                                'natural',
                                enhancedSavePath
                            )
                            .then((enhRes) => {
                                if (
                                    enhRes &&
                                    enhRes.success &&
                                    enhRes.data &&
                                    enhRes.data.enhancedPath
                                ) {
                                    const enhUrl = `file://${enhRes.data.enhancedPath.replace(/\\/g, '/')}`
                                    setSelfboothLibrary((prev) => {
                                        const next: CapturedPhoto[] = prev.map((p) =>
                                            p.id === newPhoto.id
                                                ? {
                                                      ...p,
                                                      rawPath: rawSavePath,
                                                      enhancedPath: enhUrl,
                                                      compositedPath: enhUrl,
                                                      enhanceStatus: 'processed',
                                                  }
                                                : p
                                        )
                                        selfboothLibraryRef.current = next
                                        return next
                                    })
                                }
                            })
                            .catch((err) =>
                                console.warn(
                                    'AI enhance selfbooth webcam shot error:',
                                    err
                                )
                            )
                    })
                    .catch((err) =>
                        console.warn('Save selfbooth photo error:', err)
                    )
                    .finally(() => {
                        pendingCapturesRef.current.delete(newPhoto.id)
                    })
            }

            // PHƯƠNG ÁN 2 cho Selfbooth: Chụp ảnh thật từ cảm biến máy ảnh Canon (Fotolism 2.2 Idempotency)
            // CHỈ kích hoạt máy ảnh Canon khi Canon Daemon đang active (tránh đứng màn hình khi dùng webcam)
            if (isCanonDaemonActive) {
                pendingCapturesRef.current.add(newPhoto.id)
                const captureId = `cap_${sessionId}_self${photoNum}_${Date.now()}`
                selfApi.camera
                    .edsdkCapture({
                        captureId,
                        sessionId,
                        slotIndex: photoNum,
                        savePath: rawSavePath,
                        shotIndex: photoNum,
                    })
                    .then(async (res) => {
                        if (
                            res &&
                            res.success &&
                            res.data &&
                            res.data.savedPath
                        ) {
                            const canonData = res.data
                            console.log(
                                `[Method 2 Selfbooth] Canon 24MP captured: ${canonData.savedPath}`
                            )
                            let enhancementSucceeded = false
                            let finalPhotoUrl =
                                canonData.dataUrl || canonData.savedPath

                            // ── Chạy Python AI Service (White Pink) trên ảnh 24MP lưu vào final ──
                            try {
                                const enhanceRes = await selfApi.ai.enhance(
                                    canonData.savedPath,
                                    50,
                                    'white_pink_v2',
                                    'natural',
                                    enhancedSavePath
                                )
                                if (
                                    enhanceRes &&
                                    enhanceRes.success &&
                                    enhanceRes.data &&
                                    enhanceRes.data.enhancedPath
                                ) {
                                    enhancementSucceeded = true
                                    finalPhotoUrl = `file://${enhanceRes.data.enhancedPath.replace(/\\/g, '/')}`
                                    console.log(
                                        `[Selfbooth AI] White Pink applied: ${enhanceRes.data.enhancedPath}`
                                    )
                                }
                            } catch (aiErr) {
                                console.warn(
                                    '[Selfbooth AI] Python enhance fallback:',
                                    aiErr
                                )
                            }

                            setSelfboothLibrary((prev) => {
                                const next: CapturedPhoto[] = prev.map((p) =>
                                    p.id === newPhoto.id
                                        ? {
                                              ...p,
                                              rawPath: canonData.savedPath,
                                              enhancedPath: finalPhotoUrl,
                                              compositedPath: finalPhotoUrl,
                                              enhanceStatus: enhancementSucceeded ? 'processed' : 'failed',
                                          }
                                        : p
                                )
                                selfboothLibraryRef.current = next
                                return next
                            })
                        }
                    })
                    .catch((err) =>
                        console.warn(
                            '[Method 2] Selfbooth Canon capture fallback:',
                            err
                        )
                    )
                    .finally(() => {
                        pendingCapturesRef.current.delete(newPhoto.id)
                    })
            }

            // Giữ khung đóng băng xem lại ảnh vừa chụp trong 1.5s (Instant Review) trước khi mở lại Live View
            setTimeout(() => setCameraFreezeFrame(null), 1500)

            // Hiệu ứng bay lên ngay lập tức (< 0.4s)
            setSnapshotFlyer({
                photoUrl: photoPath,
                slotIndex: 0,
                isEdsdk: false,
            })
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
                selfboothLibraryRef.current = finalPhotos
                setSelfboothLibrary(finalPhotos)
            }
        }

        setIsAiProcessingBeforeTheme(true)
        setAiProgressText('Đang xử lý ảnh')
        setAiProcessingError(null)

        // Đợi toàn bộ ảnh hoàn tất lưu và xử lý AI trong nền nếu đang chụp
        if (pendingCapturesRef.current.size > 0) {
            await new Promise((resolve) => {
                const interval = setInterval(() => {
                    if (pendingCapturesRef.current.size === 0) {
                        clearInterval(interval)
                        resolve(true)
                    }
                }, 100)
            })
        }

        // Đọc lại ảnh sau khi Canon/AI hoàn tất, tránh enhance lại preview từ snapshot cũ.
        finalPhotos = [...selfboothLibraryRef.current]

        // Đảm bảo 100% kho ảnh Selfbooth đã có ảnh AI Enhance vào thư mục final (chạy song song đồng thời)
        const selfApi = isBrowser ? mockApi : fotolismApi
        await Promise.all(
            finalPhotos.map(async (p, idx) => {
                const hasEnhance = isPhotoEnhanced(p)
                if (!hasEnhance) {
                    const timestamp = p.timestamp || Date.now()
                    const photoNum = idx + 1
                    const enhancedFileName = `fotolism_enhanced_self_${photoNum}_${timestamp}.jpg`
                    const enhancedSavePath = `F:\\Fotolism_image\\sessions\\${sessionId}\\final\\${enhancedFileName}`
                    let rawP = p.rawPath
                    if (rawP && rawP.startsWith('data:image')) {
                        const rawFileName = `${FILE_PREFIX_SELF}_${photoNum}_${timestamp}.jpg`
                        const rawSavePath = `F:\\Fotolism_image\\sessions\\${sessionId}\\raw\\${rawFileName}`
                        await selfApi.storage.savePhoto(rawP, rawSavePath)
                        rawP = rawSavePath
                    }
                    if (rawP && !rawP.startsWith('data:image')) {
                        try {
                            const enhRes = await selfApi.ai.enhance(
                                rawP,
                                50,
                                'white_pink_v2',
                                'natural',
                                enhancedSavePath
                            )
                            if (enhRes?.success && enhRes?.data?.enhancedPath) {
                                const enhUrl = `file://${enhRes.data.enhancedPath.replace(/\\/g, '/')}`
                                finalPhotos[idx] = {
                                    ...p,
                                    rawPath: rawP,
                                    enhancedPath: enhUrl,
                                    compositedPath: enhUrl,
                                    enhanceStatus: 'processed',
                                }
                            }
                        } catch (e) {
                            console.warn(
                                `Fallback enhance selfbooth photo ${idx + 1}:`,
                                e
                            )
                        }
                    }
                }
            })
        )
        selfboothLibraryRef.current = finalPhotos
        setSelfboothLibrary(finalPhotos)
        if (finalPhotos.some((photo) => !isPhotoEnhanced(photo))) {
            setIsAiProcessingBeforeTheme(false)
            setAiProcessingError('Một số ảnh chưa xử lý AI thành công. Ảnh gốc đã được giữ lại; hãy thử lại trước khi tiếp tục.')
            return
        }
        setIsAiProcessingBeforeTheme(false)

        // 1. Lưu toàn bộ ảnh khách đã chụp vào session store
        setSessionPhotos(finalPhotos)
        setIsSessionActive(false)

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

    if (!isSelfboothMode) return <ConnectedReferenceView screen="camera-booth"
        onNavigate={() => {}}
        values={{ capturedPhotos: slots.map(photo => photo?.compositedPath || photo?.enhancedPath || photo?.rawPath || null), countdownSetting: countdownSeconds, activeCountdown: isCapturingShot ? currentCountdown : null, isFlashing: showFlash, isProcessing: isAiProcessingBeforeTheme }}
        changes={{ countdownSetting: (value) => { if (!isSessionActive && !slots.some(Boolean)) setCountdownSeconds(Number(value)); } }}
        onCapture={(index) => {
            if (isCapturingShot || isFlashCoolingDown || isAiProcessingBeforeTheme) return;
            if (index !== undefined && slots[index]) { handleDeleteSlot(index); return; }
            if (slots.every(Boolean)) void handleProceedPhotobooth();
            else void handleTakePhotoboothShot();
        }}
        status={aiProcessingError || (isAiProcessingBeforeTheme ? aiProgressText : !hasCamera ? 'Đang kết nối máy ảnh…' : undefined)}
        camera={hasCamera ? <>
                                <BeautyCameraView
                                    ref={beautyCameraRef}
                                    stream={
                                        isCanonDaemonActive
                                            ? null
                                            : activeMediaStream
                                    }
                                    mjpegUrl={
                                        isCanonDaemonActive &&
                                        !(
                                            typeof window !== 'undefined' &&
                                            window.location.search.includes(
                                                'noLiveStream=1'
                                            )
                                        )
                                            ? 'http://127.0.0.1:8899/liveview'
                                            : undefined
                                    }
                                    mirrorCamera={mirrorCamera}
                                    beautyEnabled={beautyEnabled}
                                    skinSmoothing={skinSmoothing}
                                    skinToneEvenness={skinToneEvenness}
                                    vLine={vLine}
                                    bigEyes={bigEyes}
                                    blush={blush}
                                    slimFace={slimFace}
                                    whiteningTone={whiteningTone}
                                    rosyTone={rosyTone}
                                    glowClarity={glowClarity}
                                    brightnessAdjust={brightnessAdjust}
                                    contrastAdjust={contrastAdjust}
                                    saturationAdjust={saturationAdjust}
                                    style={{
                                        filter:
                                            selectedFilter?.cssFilter &&
                                            selectedFilter.cssFilter !== 'none'
                                                ? selectedFilter.cssFilter
                                                : undefined,
                                    }}
                                    className="camera-preview-element"
                                />
                                <CaptureAspectGuide
                                    guideBoxStyle={guideBoxStyle}
                                />
        </> : null}
    />

    return (
        <div className="capture-screen-pastel" id="capture-screen">
            {/* Screen Flash Animation */}
            {showFlash && <div className="screen-flash" />}

            {/* Focus Dim Backdrop: Làm tối xung quanh khi đang chụp photobooth */}
            {isSessionActive && !isSelfboothMode && (
                <div className="focus-dim-backdrop" />
            )}

            {/* ── Top Bar: Timer / Countdown (Đã xóa hoàn toàn nút quay lại, x thoát và cài đặt) ── */}
            <header className="capture-top-bar">
                <div className="capture-top-left">
                    {isSelfboothMode ? (
                        /* Đồng hồ đếm ngược Selfbooth góc trái (05:00 -> 00:00) */
                        <div
                            className={`selfbooth-elapsed-timer-badge ${selfboothSecondsLeft < 30 ? 'warning' : ''}`}
                        >
                            <Clock
                                size={18}
                                className={
                                    selfboothSecondsLeft < 30
                                        ? 'pulse-warning'
                                        : ''
                                }
                            />
                            <span className="selfbooth-timer-label">
                                Còn lại:
                            </span>
                            <span className="selfbooth-timer-digits">
                                {formatElapsedTime(selfboothSecondsLeft)}
                            </span>
                        </div>
                    ) : (
                        <div className="countdown-capsule-group">
                            {[8, 5].map((sec) => {
                                const isLocked =
                                    isSessionActive ||
                                    slots.some(Boolean) ||
                                    isCapturingShot ||
                                    isFlashCoolingDown
                                return (
                                    <button
                                        key={sec}
                                        className={`countdown-pill ${countdownSeconds === sec ? 'active' : ''} ${isLocked ? 'locked-disabled' : ''}`}
                                        onClick={() =>
                                            !isLocked &&
                                            setCountdownSeconds(sec)
                                        }
                                        disabled={isLocked}
                                        title={
                                            isLocked
                                                ? 'Đã bắt đầu chụp, không thể thay đổi số giây'
                                                : `Thời gian đếm ngược ${sec} giây`
                                        }
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
            <div
                className={`capture-main-stage ${isSelfboothMode ? 'selfbooth-stage' : ''}`}
            >
                {/* ── CỘT 1/12: Bộ lọc màu nhanh (Chỉ hiển thị trong Photobooth) ── */}
                {!isSelfboothMode && (
                    <aside
                        className={`dock-grid-col-1 left-sidebar-dock ${isSessionActive || slots.some(Boolean) || isCapturingShot ? 'locked-dimmed' : ''}`}
                    >
                        <button
                            className={`dock-btn ${activeFlyout === 'filter' ? 'active' : ''}`}
                            onClick={() => {
                                if (
                                    isSessionActive ||
                                    slots.some(Boolean) ||
                                    isCapturingShot
                                )
                                    return
                                setActiveFlyout(
                                    activeFlyout === 'filter' ? null : 'filter'
                                )
                            }}
                            disabled={
                                isSessionActive ||
                                slots.some(Boolean) ||
                                isCapturingShot
                            }
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
                            <button
                                className="flyout-close-btn"
                                onClick={() => setActiveFlyout(null)}
                            >
                                ✕
                            </button>
                        </div>

                        <div className="flyout-content">
                            <div className="filter-presets-container">
                                <div className="filter-presets-list">
                                    {COLOR_FILTERS.map((filter) => {
                                        const isSelected =
                                            selectedFilter?.id === filter.id
                                        return (
                                            <button
                                                key={filter.id}
                                                className={`filter-preset-card ${isSelected ? 'active' : ''}`}
                                                onClick={() =>
                                                    selectFilter(filter)
                                                }
                                            >
                                                <div
                                                    className="filter-preview-chip"
                                                    style={{
                                                        background:
                                                            filter.previewColor,
                                                        border:
                                                            filter.id ===
                                                            'normal'
                                                                ? '1.5px solid #E6D9CF'
                                                                : 'none',
                                                    }}
                                                />
                                                <div className="filter-card-info">
                                                    <span className="filter-card-name">
                                                        {filter.name}
                                                    </span>
                                                </div>
                                                {isSelected && (
                                                    <span className="filter-card-check">
                                                        ✓
                                                    </span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── CỘT LIVE VIEW: Chiếm 9/12 trong Photobooth hoặc Chiếm trọn màn hình trong Selfbooth ── */}
                <div
                    className={
                        isSelfboothMode
                            ? 'liveview-selfbooth-full'
                            : 'liveview-grid-col-9'
                    }
                >
                    <div
                        className={`camera-viewfinder-wrapper ${isSessionActive && !isPhotoboothFull ? 'shooting-focus' : ''} ${
                            isSelfboothMode
                                ? isFlashCoolingDown
                                    ? 'selfbooth-cooling-down'
                                    : 'selfbooth-clickable'
                                : ''
                        }`}
                        onClick={() => {
                            if (
                                isSelfboothMode &&
                                !isCapturingShot &&
                                !isFlashCoolingDown
                            ) {
                                handleTakeSelfboothShot()
                            }
                        }}
                    >
                        {hasCamera ? (
                            <>
                                <BeautyCameraView
                                    ref={beautyCameraRef}
                                    stream={
                                        isCanonDaemonActive
                                            ? null
                                            : activeMediaStream
                                    }
                                    mjpegUrl={
                                        isCanonDaemonActive &&
                                        !(
                                            typeof window !== 'undefined' &&
                                            window.location.search.includes(
                                                'noLiveStream=1'
                                            )
                                        )
                                            ? 'http://127.0.0.1:8899/liveview'
                                            : undefined
                                    }
                                    mirrorCamera={mirrorCamera}
                                    beautyEnabled={beautyEnabled}
                                    skinSmoothing={skinSmoothing}
                                    skinToneEvenness={skinToneEvenness}
                                    vLine={vLine}
                                    bigEyes={bigEyes}
                                    blush={blush}
                                    slimFace={slimFace}
                                    whiteningTone={whiteningTone}
                                    rosyTone={rosyTone}
                                    glowClarity={glowClarity}
                                    brightnessAdjust={brightnessAdjust}
                                    contrastAdjust={contrastAdjust}
                                    saturationAdjust={saturationAdjust}
                                    style={{
                                        filter:
                                            selectedFilter?.cssFilter &&
                                            selectedFilter.cssFilter !== 'none'
                                                ? selectedFilter.cssFilter
                                                : undefined,
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
                                    <div
                                        className="retro-film-grain-overlay"
                                        style={{ zIndex: 3 }}
                                    />
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
                                <Loader2
                                    size={46}
                                    className="camera-connecting-spin"
                                    strokeWidth={2.4}
                                />
                                <p className="camera-connecting-text">
                                    Đang kết nối
                                </p>
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
                            <CaptureAspectGuide guideBoxStyle={guideBoxStyle} />
                        )}

                        {/* ── Màn hình Lazy Loading xoay tròn 2.5s sau mỗi lần chụp (hồi đèn flash & xử lý ảnh) ── */}
                        {isFlashCoolingDown && (
                            <div className="selfbooth-loading-overlay animate-fade-in">
                                <div className="selfbooth-loading-spinner-box">
                                    <div className="selfbooth-spinner-ring" />
                                </div>
                            </div>
                        )}

                        {/* Countdown digits overlay */}
                        {!isSelfboothMode &&
                            isCapturingShot &&
                            currentCountdown > 0 && (
                                <div className="multi-shot-countdown-overlay">
                                    <div className="countdown-digits-translucent">
                                        {currentCountdown}
                                    </div>
                                </div>
                            )}

                        {/* Flying Snap Effect Animation */}
                        {snapshotFlyer && (
                            <div className="snapshot-flying-overlay">
                                <div className="snapshot-card-animate">
                                    <img
                                        src={snapshotFlyer.photoUrl}
                                        alt="Just Captured"
                                    />
                                    <div
                                        className="snapshot-card-badge"
                                        style={
                                            snapshotFlyer.isEdsdk
                                                ? {
                                                      background:
                                                          'linear-gradient(135deg, #0284c7, #0ea5e9)',
                                                      color: '#ffffff',
                                                      fontWeight: 800,
                                                  }
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
                    <LiveSlotsDock
                        totalShots={totalShots}
                        selectedFrameSize={selectedFrameSize}
                        slots={slots}
                        retakeSlotIndex={retakeSlotIndex}
                        justCapturedSlot={justCapturedSlot}
                        slotDeleteCounts={slotDeleteCounts}
                        isCapturingShot={isCapturingShot}
                        targetSlotDimensions={targetSlotDimensions}
                        is2x6={is2x6}
                        is9Grid={is9Grid}
                        onDeleteSlot={handleDeleteSlot}
                        onSelectRetakeSlot={setRetakeSlotIndex}
                    />
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
                                {isPhotoboothFull &&
                                retakeSlotIndex === null ? (
                                    /* ĐÃ ĐỦ FULL ẢNH: Nút Hài Lòng & Tiếp Tục */
                                    <div
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                        }}
                                    >
                                        <button
                                            className="start-capture-btn-pink proceed-glow-btn"
                                            id="proceed-theme-button"
                                            onClick={() => void handleProceedPhotobooth()}
                                        >
                                            <span>Tiếp Tục Chọn Frame</span>
                                        </button>
                                    </div>
                                ) : (
                                    /* CHƯA ĐỦ ẢNH HOẶC ĐANG CHỤP LẠI (RETAKE) */
                                    <button
                                        className="start-capture-btn-pink"
                                        id="start-capture-button"
                                        disabled={
                                            isCapturingShot ||
                                            isFlashCoolingDown
                                        }
                                        onClick={handleTakePhotoboothShot}
                                    >
                                        <Camera size={26} strokeWidth={2} />
                                        <span>
                                            {isCapturingShot
                                                ? `Đang đếm ngược...`
                                                : isFlashCoolingDown
                                                  ? `Đang xử lý ảnh...`
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
                                                onClick={
                                                    handleResetShootSession
                                                }
                                                title="Chỉ được phép chụp lại từ đầu 1 lần duy nhất"
                                            >
                                                ↩ Chụp lại từ đầu (Còn 1 lần)
                                            </button>
                                        ) : (
                                            <span
                                                className="cancel-shoot-used-text"
                                                title="Bạn đã dùng hết lượt chụp lại từ đầu"
                                            >
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
                                if (isCapturingShot || isFlashCoolingDown)
                                    return
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
                <div
                    className="selfbooth-confirm-overlay"
                    onClick={() => setShowFinishConfirm(false)}
                >
                    <div
                        className="selfbooth-confirm-modal animate-pop"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="selfbooth-confirm-title">
                            Xác nhận kết thúc?
                        </h3>
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
            {/* ── MÀN HÌNH CHỜ XỬ LÝ LÀM ĐẸP AI TRƯỚC KHI VÀO MÀN HÌNH CHỌN FRAME / REVIEW ── */}
            {(isAiProcessingBeforeTheme || aiProcessingError) && (
                <div
                    className="ai-enhance-processing-modal-overlay animate-fade-in"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.88)',
                        backdropFilter: 'blur(8px)',
                        zIndex: 99999,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                    }}
                >
                    <div
                        style={{
                            background:
                                'linear-gradient(145deg, #FFF5F7 0%, #FFE4E9 50%, #FFDCE2 100%)',
                            padding: '44px 56px',
                            borderRadius: '28px',
                            border: '2px solid rgba(255, 141, 161, 0.65)',
                            boxShadow:
                                '0 25px 60px -10px rgba(255, 75, 114, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.8) inset',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            minWidth: '380px',
                            maxWidth: '460px',
                            textAlign: 'center',
                        }}
                    >
                        {/* Dấu quay tròn màu hồng */}
                        <div
                            className="selfbooth-spinner-ring"
                            style={{
                                width: '64px',
                                height: '64px',
                                borderWidth: '5px',
                                borderColor: 'rgba(255, 75, 114, 0.2)',
                                borderTopColor: '#FF4B72',
                                borderRightColor: '#FF758F',
                                marginBottom: '24px',
                            }}
                        />
                        <h2
                            style={{
                                fontSize: '26px',
                                fontWeight: 700,
                                margin: 0,
                                color: '#9F1239',
                                letterSpacing: '-0.01em',
                            }}
                        >
                            {aiProcessingError || aiProgressText || 'Đang xử lý ảnh'}
                        </h2>
                        {aiProcessingError && (
                            <button className="btn-primary" onClick={() => void (isSelfboothMode ? handleFinishSelfboothToReview() : handleProceedPhotobooth())} style={{ marginTop: 24 }}>
                                Thử lại
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
