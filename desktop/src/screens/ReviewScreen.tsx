import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAppStore } from '../store/appStore'
import { fotolismApi, isBrowser, mockApi, api } from '../lib/api'
import {
    generateStripComposite,
    preparePrintImageForDNP,
} from '../lib/canvasCompositor'
import {
    FILE_PREFIX_SHOT,
    FILE_PREFIX_FINAL,
    SESSION_FOLDER_PREFIX,
    DEFAULT_ADMIN_PIN,
} from '../lib/constants'
import QRCode from 'qrcode'
import { QrCode, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { cloudSyncService } from '../services/cloudSyncService'
import { BRAND_LOGO_SRC } from '../lib/brandLogo'
import { PrintActionDeck } from '../components/review/PrintActionDeck'
import '../components/reference/fonts.css'
import './ReviewScreen.css'
import { isPhotoEnhanced } from '../lib/enhanceState'

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
        isSyncingMedia,
        setIsSyncingMedia,
        setMediaSyncDone,
        mediaSyncError: syncError,
        setMediaSyncError: setSyncError,
        galleryUrl,
        printScale,
    } = useAppStore()

    const defaultCopies =
        session?.paidCopies ||
        selectedCopies ||
        (selectedFrameSize === '2x6' ? 2 : 1)

    const [qrDataUrl, setQrDataUrl] = useState<string>('')
    const [printCopies, setPrintCopies] = useState<number>(defaultCopies)
    const [isPrinting, setIsPrinting] = useState<boolean>(false)
    const [printError, setPrintError] = useState<string | null>(null)
    const [compositeStripUrl, setCompositeStripUrl] = useState<string>('')
    const [isGeneratingComposite, setIsGeneratingComposite] =
        useState<boolean>(true)

    // ── Cloud Gallery & Local Session Folder ──
    const [subfolderName] = useState<string>(() => {
        const now = new Date()
        const pad = (n: number) => String(n).padStart(2, '0')
        const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
        const timeStr = `${pad(now.getHours())}h${pad(now.getMinutes())}`
        return `${SESSION_FOLDER_PREFIX}_${dateStr}_${timeStr}`
    })

    const photos: any[] = useMemo(() => {
        if (session?.photos && session.photos.length > 0) return session.photos
        return []
    }, [session?.photos])

    const isSelfboothMode = eventConfig.captureMode === 'selfbooth'

    const is2x6 = (selectedTheme?.frameSize || selectedFrameSize) === '2x6'

    // Link đích của mã QR: Customer Gallery trên Cloudflare R2 / CMS
    const cmsBaseUrl = cloudSyncService.getCmsUrl()
    const galleryIdentifier =
        session?.pinCode || session?.sessionId || subfolderName
    const webGalleryUrl = `${cmsBaseUrl}/gallery/${galleryIdentifier}`
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

    // Sinh bản ghép canvas composite chất lượng cao & Đẩy ảnh lên Cloud Gallery
    useEffect(() => {
        let isMounted = true

        async function processSessionMedia() {
            try {
                if (!photos.length || photos.some((photo) => !isPhotoEnhanced(photo))) {
                    throw new Error('Ảnh AI chưa hoàn tất. Hãy quay lại bước chụp và thử lại.')
                }
                if (isSelfboothMode) {
                    // Chế độ Selfbooth: Không cần ghép khung in ấn
                    setIsGeneratingComposite(false)

                    return
                }

                const prebuiltStrip =
                    useAppStore.getState().compositeStripUrl ||
                    session?.compositeStripUrl
                if (prebuiltStrip) {
                    setCompositeStripUrl(prebuiltStrip)
                    setIsGeneratingComposite(false)
                    return
                }

                // Sinh dải ảnh in hoàn chỉnh cho cả Photobooth và Selfbooth (fallback)
                setIsGeneratingComposite(true)
                const photoUrls = photos
                    .map((p) => p.compositedPath || p.enhancedPath || p.rawPath)
                    .filter(Boolean)
                const stripUrl = await generateStripComposite({
                    photos: photoUrls,
                    frameSize: selectedFrameSize,
                    layout: selectedLayout,
                    theme: selectedTheme,
                    stickers: placedStickers,
                    filter: selectedFilter,
                    eventName: eventConfig.eventName,
                    eventDate: eventConfig.date,
                    slotOffsets:
                        session?.slotOffsets ||
                        useAppStore.getState().slotOffsets ||
                        [],
                })

                if (!isMounted) return

                setCompositeStripUrl(stripUrl)
                setIsGeneratingComposite(false)

                // Đảm bảo dải ảnh thành phẩm & bản in ghép 4x6 luôn được lưu vào session disk
                const sId = session?.pinCode || session?.sessionId
                if (sId && stripUrl) {
                    try {
                        const pairedUrl = await preparePrintImageForDNP(
                            stripUrl,
                            printScale
                        )
                        const compositeFileName = `${FILE_PREFIX_FINAL}_${selectedFrameSize}.jpg`
                        const pairedFileName =
                            selectedFrameSize === '2x6'
                                ? `${FILE_PREFIX_FINAL}_2x6_paired_4x6.jpg`
                                : `${FILE_PREFIX_FINAL}_4x6_scaled.jpg`
                        api.storage
                            .finalizeSessionMedia({
                                sessionId: sId,
                                sessionType: isSelfboothMode
                                    ? 'selfbooth'
                                    : 'photobooth',
                                compositeDataUrl: stripUrl,
                                compositeFileName,
                                pairedPrintDataUrl: pairedUrl,
                                pairedPrintFileName: pairedFileName,
                                shots: photos.map((p, idx) => ({
                                    slotIndex: idx,
                                    id: p.id || `shot_${idx + 1}`,
                                    fileName: `${FILE_PREFIX_SHOT}_${idx + 1}.jpg`,
                                    rawPath: p.rawPath,
                                    enhancedPath: p.enhancedPath,
                                })),
                            })
                            .catch((finErr: any) =>
                                console.warn(
                                    '[ReviewScreen] Fallback finalizeSessionMedia warning:',
                                    finErr
                                )
                            )
                    } catch (finErr: any) {
                        console.warn(
                            '[ReviewScreen] preparePrintImageForDNP warning:',
                            finErr
                        )
                    }
                }

            } catch (err: any) {
                console.error(
                    'Failed to generate strip composite:',
                    err
                )
                if (isMounted) {
                    setIsGeneratingComposite(false)
                    setIsSyncingMedia(false)
                    setMediaSyncDone(false)
                    setSyncError(
                        err.message ||
                            'Lỗi xử lý dải ảnh và tải lên Cloud Gallery.'
                    )
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
    ])

    // Đánh dấu vé lượt chụp hoàn thành (COMPLETED) trên Cloud CMS
    const markTicketCompleted = useCallback(async () => {
        const pin = session?.pinCode
        const adminPin = (
            eventConfig.adminPin ||
            DEFAULT_ADMIN_PIN ||
            '8888'
        ).trim()
        if (!pin || pin === '8888' || pin === adminPin) return

        try {
            await fetch(`${cloudSyncService.getCmsUrl()}/api/kiosk/tickets`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pin_code: pin,
                    status: 'COMPLETED',
                    kiosk_id: isSelfboothMode ? 'kiosk_02' : 'kiosk_01',
                }),
            })
            console.log(
                `[ReviewScreen] Đã cập nhật vé ${pin} sang COMPLETED trên Cloud CMS`
            )
        } catch (err) {
            console.warn(
                '[ReviewScreen] Không thể cập nhật trạng thái vé COMPLETED:',
                err
            )
        }
    }, [session?.pinCode, eventConfig.adminPin, isSelfboothMode])

    // Cập nhật trạng thái COMPLETED ngay khi khách vào màn hình Review nhận ảnh
    useEffect(() => {
        markTicketCompleted()
    }, [markTicketCompleted])

    // Lưu phiên chụp vào Outbox để đồng bộ lên Cloud CMS
    const recordSessionToOutbox = useMemo(
        () => () => {
            if (!session) return
            const is4x6 = selectedFrameSize === '4x6'
            const layoutType = isSelfboothMode
                ? 'selfbooth'
                : is4x6
                  ? '4x6'
                  : '2x6'
            const kioskId = isSelfboothMode ? 'kiosk_02' : 'kiosk_01'
            const storageUrl = webGalleryUrl

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
                total_amount:
                    session.paidAmount ||
                    (isSelfboothMode ? 50000 : is4x6 ? 70000 : 50000),
                payment_method: (session.paymentMethod?.toLowerCase() === 'cash'
                    ? 'cash'
                    : 'vietqr') as 'vietqr' | 'cash',
                coupon_code: null,
                paper_consumed: isSelfboothMode ? 0 : printCopies,
                storage_url: storageUrl,
                status: 'completed',
                created_at: new Date().toISOString(),
                photos: photos.map((p) => {
                    const pth =
                        p.compositedPath || p.enhancedPath || p.rawPath || ''
                    // Chống lỗi QuotaExceededError (5MB) trong LocalStorage khi lưu DataURL base64 lớn
                    return pth.startsWith('data:')
                        ? `[photo_slot_${p.id || 'shot'}]`
                        : pth
                }),
            })
        },
        [
            session,
            selectedFrameSize,
            printCopies,
            photos,
            galleryUrl,
            subfolderName,
            isSelfboothMode,
        ]
    )

    // ── Auto Return to Idle Timer (Cố định tối thiểu 120s / 2 phút cho tiến trình ngầm) ──
    const [countdownToIdle, setCountdownToIdle] = useState<number>(() =>
        Math.max(120, eventConfig.idleTimeoutSeconds || 120)
    )

    useEffect(() => {
        const timer = setInterval(() => {
            setCountdownToIdle((prev) => {
                if (prev <= 1) {
                    // Nếu các tiến trình ngầm (đồng bộ media, nén composite) chưa hoàn tất, hoãn đếm ngược
                    if (isSyncingMedia || isGeneratingComposite) {
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
    }, [isSyncingMedia, isGeneratingComposite])

    // Dọn dẹp Object URL nhị phân khi unmount
    useEffect(() => {
        return () => {
            if (compositeStripUrl && compositeStripUrl.startsWith('blob:')) {
                try {
                    URL.revokeObjectURL(compositeStripUrl)
                } catch {}
            }
        }
    }, [compositeStripUrl])

    function handleFinish() {
        if (isSyncingMedia || isGeneratingComposite) {
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
            if (!photos.length || photos.some((photo) => !isPhotoEnhanced(photo))) {
                throw new Error('Ảnh AI chưa hoàn tất; chưa thể in ảnh final.')
            }
            let pathToPrint =
                compositeStripUrl || photos[0]?.compositedPath || ''

            if (pathToPrint) {
                pathToPrint = await preparePrintImageForDNP(
                    pathToPrint,
                    printScale
                )

                // Đảm bảo bản in ghép đôi 4x6 (cho 2x6) hoặc bản scale chuẩn luôn được lưu vào thư mục final/ để kiểm tra
                const sId = session?.pinCode || session?.sessionId
                if (sId && pathToPrint.startsWith('data:')) {
                    const printTargetFileName =
                        selectedFrameSize === '2x6'
                            ? `${FILE_PREFIX_FINAL}_2x6_paired_4x6.jpg`
                            : `${FILE_PREFIX_FINAL}_4x6_scaled.jpg`
                    const printTargetPath = `F:\\Fotolism_image\\sessions\\${sId}\\final\\${printTargetFileName}`
                    api.storage
                        .savePhoto(pathToPrint, printTargetPath)
                        .catch((err) =>
                            console.warn(
                                '[ReviewScreen] Save print copy warning:',
                                err
                            )
                        )
                }
            }

            // Số tờ vật lý cần in: Khổ 2x6 kép 1 tờ chứa 2 dải, khổ 4x6 1 tờ chứa 1 ảnh
            const physicalSheets =
                selectedFrameSize === '2x6'
                    ? Math.max(1, Math.ceil(printCopies / 2))
                    : printCopies

            const res = await api.print.send(pathToPrint, physicalSheets)
            if (res && res.success) {
                setSessionPrinted()
                setIsPrinting(false)
                setPrintError(null)
            } else {
                const errorMsg =
                    res?.error ||
                    'Máy in không phản hồi hoặc lệnh in bị từ chối.'
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
        setScreen('processing')
    }

    function handleOpenGallery() {
        if (galleryUrl) {
            window.open(galleryUrl, '_blank')
        }
    }

    return (
        <div className="review-screen-pastel" id="review-screen">
            {/* ── Fixed Brand Logo góc trên bên trái ── */}
            <img
                src={BRAND_LOGO_SRC}
                alt="fotolism"
                className="review-fixed-brand-logo"
            />

            {/* ── Top Header: Tiêu đề trung tâm ── */}
            <header className="review-header-pastel">
                <div className="review-header-center">
                    <h1 className="review-header-title">Ảnh hoàn thiện</h1>
                </div>
            </header>

            {/* Main Content */}
            {isSelfboothMode ? (
                /* ── CHẾ ĐỘ SELFBOOTH: CHỈ HIỆN DUY NHẤT QR VỚI NÚT 'QUÉT QR TẢI ẢNH' KHI ĐÃ ĐẨY XONG ẢNH ── */
                <main className="selfbooth-review-minimal">
                    {isSyncingMedia ? (
                        <div
                            className="selfbooth-minimal-card animate-pop"
                            style={{
                                padding: '44px 32px',
                                textAlign: 'center',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                            }}
                        >
                            <Loader2
                                size={54}
                                className="camera-connecting-spin"
                                strokeWidth={2.4}
                                style={{
                                    color: 'var(--brand-primary, #502A1D)',
                                }}
                            />
                            <h2
                                style={{
                                    fontFamily: 'var(--font-display)',
                                    fontSize: '1.4rem',
                                    fontWeight: 800,
                                    color: 'var(--brand-primary, #502A1D)',
                                    margin: '22px 0 8px',
                                }}
                            >
                                Đang chuẩn bị ảnh của bạn...
                            </h2>
                            <p
                                style={{
                                    fontSize: '0.92rem',
                                    color: 'var(--text-secondary, #70594F)',
                                    maxWidth: 360,
                                    margin: 0,
                                    lineHeight: 1.5,
                                }}
                            >
                                Hệ thống đang tự động tạo thư mục và đẩy toàn bộ
                                ảnh của bạn lên Cloud Gallery. Vui lòng đợi trong
                                giây lát để nhận mã QR.
                            </p>
                            <div className="selfbooth-loading-pulse-bar">
                                <div className="selfbooth-loading-pulse-fill" />
                            </div>
                        </div>
                    ) : syncError ? (
                        <div
                            className="selfbooth-minimal-card animate-pop"
                            style={{
                                padding: '36px 28px',
                                textAlign: 'center',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 14,
                            }}
                        >
                            <AlertCircle
                                size={48}
                                color="#ef4444"
                                strokeWidth={2.2}
                            />
                            <h2
                                style={{
                                    fontFamily: 'var(--font-display)',
                                    fontSize: '1.3rem',
                                    fontWeight: 800,
                                    color: '#ef4444',
                                    margin: 0,
                                }}
                            >
                                Chưa thể tải ảnh về điện thoại
                            </h2>
                            <p
                                style={{
                                    fontSize: '0.9rem',
                                    color: '#70594F',
                                    maxWidth: 380,
                                    margin: 0,
                                    lineHeight: 1.5,
                                }}
                            >
                                {syncError}
                            </p>
                            <div
                                style={{
                                    display: 'flex',
                                    gap: 12,
                                    marginTop: 8,
                                }}
                            >
                                <button
                                    className="btn-selfbooth-modal-cancel"
                                    style={{
                                        padding: '8px 24px',
                                        fontSize: '0.92rem',
                                    }}
                                    onClick={handleFinish}
                                >
                                    Kết thúc
                                </button>
                                <button
                                    className="btn-selfbooth-modal-confirm"
                                    style={{
                                        padding: '8px 24px',
                                        fontSize: '0.92rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                    }}
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
                                onClick={handleOpenGallery}
                                title="Quét QR tải ảnh"
                            >
                                <QrCode size={24} strokeWidth={2.2} />
                                <span>Quét QR tải ảnh</span>
                            </button>

                            <div className="selfbooth-qr-img-box-large">
                                {qrDataUrl ? (
                                    <img
                                        src={qrDataUrl}
                                        alt="Mã QR tải ảnh Selfbooth"
                                        className="selfbooth-qr-img-large"
                                    />
                                ) : (
                                    <div className="selfbooth-qr-loading-large">
                                        Đang tạo mã QR...
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </main>
            ) : (
                /* Main 2-Column Content CHO PHOTOBOOTH */
                <main className="review-content-pastel">
                    {/* Left: Photobooth Strip Frame */}
                    <section className="strip-frame-container review-preview-panel">
                        <div className="frame-preview-wrapper fade-in">
                            {isGeneratingComposite || !compositeStripUrl ? (
                                <div className="composite-generating-loader" role="status" aria-live="polite">
                                    <span className="loader-spinner-pink" />
                                    <span
                                        style={{
                                            fontWeight: 700,
                                            color: 'var(--color-pink-primary)',
                                        }}
                                    >
                                        Đang hoàn thiện dải ảnh in...
                                    </span>
                                </div>
                            ) : (
                                <div
                                    className={`review-final-strip-card ${
                                        selectedFrameSize === '2x6'
                                            ? 'strip-2x6-view'
                                            : 'postcard-4x6-view'
                                    }`}
                                    style={{
                                        position: 'relative',
                                        aspectRatio: is2x6
                                            ? '600 / 1800'
                                            : '1200 / 1800',
                                        maxHeight: 'calc(100vh - 215px)',
                                        borderRadius: '14px',
                                        boxShadow:
                                            '0 16px 45px rgba(0, 0, 0, 0.16)',
                                        overflow: 'hidden',
                                        background: '#FAF6F0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <img
                                        src={compositeStripUrl}
                                        alt="Dải ảnh in thành phẩm"
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'contain',
                                            display: 'block',
                                            borderRadius: '14px',
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Right: Instant QR & Print */}
                    <section className="review-delivery-deck">
                        {/* Card QR Tải Ảnh - Đồng bộ phong cách tối giản với Selfbooth */}
                        <div className="delivery-card-pastel review-qr-card animate-pop">
                            <button
                                className="btn-selfbooth-qr-top"
                                onClick={handleOpenGallery}
                                title="Quét QR tải ảnh"
                                style={{ width: '100%' }}
                            >
                                <QrCode size={22} strokeWidth={2.2} />
                                <span>Quét QR tải ảnh</span>
                            </button>

                            {isSyncingMedia ? (
                                <div
                                    style={{
                                        padding: '24px 16px',
                                        textAlign: 'center',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                    }}
                                >
                                    <Loader2
                                        size={42}
                                        className="camera-connecting-spin"
                                        strokeWidth={2.4}
                                        style={{
                                            color: 'var(--brand-primary, #502A1D)',
                                        }}
                                    />
                                    <h3
                                        style={{
                                            fontFamily: 'var(--font-display)',
                                            fontSize: '1.2rem',
                                            fontWeight: 800,
                                            color: 'var(--brand-primary, #502A1D)',
                                            margin: '16px 0 6px',
                                        }}
                                    >
                                        Đang chuẩn bị ảnh của bạn...
                                    </h3>
                                    <p
                                        style={{
                                            fontSize: '0.85rem',
                                            color: 'var(--text-secondary, #70594F)',
                                            maxWidth: 320,
                                            margin: 0,
                                            lineHeight: 1.4,
                                        }}
                                    >
                                        Ảnh và video đang được chuẩn bị.
                                        Vui lòng đợi trong giây lát để nhận mã QR.
                                    </p>
                                    <div
                                        className="selfbooth-loading-pulse-bar"
                                        style={{ width: 220, marginTop: 16 }}
                                    >
                                        <div className="selfbooth-loading-pulse-fill" />
                                    </div>
                                </div>
                            ) : syncError ? (
                                <div
                                    style={{
                                        padding: '20px 16px',
                                        textAlign: 'center',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: 10,
                                    }}
                                >
                                    <AlertCircle
                                        size={38}
                                        color="#ef4444"
                                        strokeWidth={2.2}
                                    />
                                    <h3
                                        style={{
                                            fontFamily: 'var(--font-display)',
                                            fontSize: '1.1rem',
                                            fontWeight: 800,
                                            color: '#ef4444',
                                            margin: 0,
                                        }}
                                    >
                                        Chưa thể tải ảnh về điện thoại
                                    </h3>
                                    <p
                                        style={{
                                            fontSize: '0.84rem',
                                            color: '#70594F',
                                            maxWidth: 320,
                                            margin: 0,
                                            lineHeight: 1.4,
                                        }}
                                    >
                                        {syncError}
                                    </p>
                                    <div
                                        style={{
                                            display: 'flex',
                                            gap: 10,
                                            marginTop: 4,
                                        }}
                                    >
                                        <button
                                            className="btn-selfbooth-modal-confirm"
                                            style={{
                                                padding: '8px 20px',
                                                fontSize: '0.88rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6,
                                            }}
                                            onClick={handleRetryUpload}
                                        >
                                            <RefreshCw size={15} />
                                            <span>Thử lại</span>
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: 10,
                                        padding: '4px 0',
                                    }}
                                >
                                    <div
                                        className="selfbooth-qr-img-box-large"
                                        style={{
                                            padding: 12,
                                            borderRadius: 20,
                                        }}
                                    >
                                        {qrDataUrl ? (
                                            <img
                                                src={qrDataUrl}
                                                alt="Mã QR tải ảnh Photobooth"
                                                style={{
                                                    width: 190,
                                                    height: 190,
                                                    display: 'block',
                                                    borderRadius: 10,
                                                }}
                                            />
                                        ) : (
                                            <div
                                                style={{
                                                    width: 190,
                                                    height: 190,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: '#70594F',
                                                    fontSize: '0.9rem',
                                                }}
                                            >
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
                <footer
                    className="kiosk-bottom-nav-bar review-bottom-bar-pastel animate-pop"
                    style={{ justifyContent: 'flex-end' }}
                >
                    <button
                        className={`kiosk-nav-btn btn-nav-next ${isSyncingMedia || isGeneratingComposite ? 'disabled' : ''}`}
                        id="finish-button"
                        disabled={isSyncingMedia || isGeneratingComposite}
                        onClick={handleFinish}
                        title={
                            isSyncingMedia
                                ? 'Đang hoàn tất lưu ảnh ngầm...'
                                : 'Tiếp tục'
                        }
                        aria-label="Tiếp tục"
                        style={{ margin: '0 0 0 auto' }}
                    >
                        {isSyncingMedia
                            ? 'Đang lưu ảnh ngầm...'
                            : `Tiếp tục (${countdownToIdle}s)`}
                    </button>
                </footer>
            )}
        </div>
    )
}
