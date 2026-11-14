import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import {
    generateStripComposite,
    preparePrintImageForDNP,
} from '../lib/canvasCompositor'
import { fotolismApi, mockApi } from '../lib/api'
import { cloudSyncService } from '../services/cloudSyncService'
import {
    DEFAULT_PRINT_SCALE,
    FILE_PREFIX_FINAL,
    FILE_PREFIX_SHOT,
} from '../lib/constants'
import QRCode from 'qrcode'
import {
    Loader2,
    CheckCircle2,
    AlertCircle,
    RefreshCw,
    ArrowRight,
} from 'lucide-react'
import { BRAND_LOGO_SRC } from '../lib/brandLogo'
import './ProcessingScreen.css'
import { isPhotoEnhanced } from '../lib/enhanceState'

export default function ProcessingScreen() {
    const {
        session,
        setCompositeStripUrl,
        setGalleryUrl,
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

    const isBrowser =
        typeof window !== 'undefined' && !(window as any).electronAPI
    const isSelfbooth = eventConfig.captureMode === 'selfbooth'
    const isStarted = useRef(false)

    async function processMediaAndUpload() {
        try {
            setErrorMessage(null)
            useAppStore.getState().setIsSyncingMedia(true)
            useAppStore.getState().setMediaSyncError(null)

            const photos = session?.photos || []
            if (photos.some((photo) => !isPhotoEnhanced(photo))) {
                throw new Error('Ảnh AI chưa hoàn tất. Hãy quay lại bước chụp để xử lý lại trước khi tạo final.')
            }
            let stripUrl: string | null = null

            let pairedPrintUrl: string | null = null
            const currentPrintScale =
                useAppStore.getState().printScale || DEFAULT_PRINT_SCALE

            if (isSelfbooth) {
                // Selfbooth: Không ghép khung in ấn, chuẩn bị kho ảnh chụp tự do
                setCompositeDone(true)
            } else {
                // Photobooth: Ghép Khung Ảnh Thành Phẩm (Composite Strip)
                const photoUrls = photos
                    .map((p) => p.compositedPath || p.enhancedPath || p.rawPath)
                    .filter(Boolean)
                console.log(
                    '[ProcessingScreen] Generating final composite strip with',
                    photoUrls.length,
                    'photos...'
                )
                const effectiveOffsets =
                    session?.slotOffsets ||
                    useAppStore.getState().slotOffsets ||
                    []
                stripUrl = await generateStripComposite({
                    photos: photoUrls,
                    frameSize: selectedFrameSize,
                    layout: selectedLayout,
                    theme: selectedTheme,
                    stickers: placedStickers,
                    filter: selectedFilter,
                    eventName: eventConfig.eventName,
                    eventDate: eventConfig.date,
                    slotOffsets: effectiveOffsets,
                })

                if (stripUrl) {
                    setCompositeStripUrl(stripUrl)
                    setCompositeDone(true)

                    // Sinh bản in ghép 4x6 (cho khổ 2x6 kép) hoặc bản in scale chuẩn (cho khổ 4x6) với printScale (mặc định 95.5%)
                    try {
                        pairedPrintUrl = await preparePrintImageForDNP(
                            stripUrl,
                            currentPrintScale
                        )
                    } catch (pairErr) {
                        console.warn(
                            '[ProcessingScreen] preparePrintImageForDNP warning:',
                            pairErr
                        )
                    }
                } else {
                    throw new Error('Không thể tạo dải ảnh thành phẩm.')
                }
            }

            // ── BƯỚC 2: TỔ CHỨC LƯU ẢNH SESSION (RAW & FINAL) VÀ KÍCH HOẠT ĐẨY LÊN CLOUDFLARE R2 ──
            const api = isBrowser ? mockApi : fotolismApi
            const sessionId =
                session?.pinCode || session?.sessionId || `ses_${Date.now()}`
            const cmsUrl = cloudSyncService.getCmsUrl()
            const finalCompositeFileName = `${FILE_PREFIX_FINAL}_${selectedFrameSize}.jpg`
            const pairedPrintFileName =
                selectedFrameSize === '2x6'
                    ? `${FILE_PREFIX_FINAL}_2x6_paired_4x6.jpg`
                    : `${FILE_PREFIX_FINAL}_4x6_scaled.jpg`
            const galleryTargetUrl = `${cmsUrl}/gallery/${sessionId}`

            const sourcePhotos =
                session?.selfboothLibrary &&
                session.selfboothLibrary.length > 0
                    ? session.selfboothLibrary
                    : photos

            const mediaShots = sourcePhotos.map((p, idx) => ({
                slotIndex: idx,
                id: p.id || `shot_${idx + 1}`,
                fileName: `${FILE_PREFIX_SHOT}_${idx + 1}.jpg`,
                rawPath: p.rawPath,
                enhancedPath: p.enhancedPath,
                rawPhotoUrl: p.rawPath,
                enhancedPhotoUrl: p.enhancedPath,
            }))

            try {
                console.log(
                    '[ProcessingScreen] Finalizing session media into sessions/{sessionId}/raw & final...'
                )
                const finalized = await api.storage.finalizeSessionMedia({
                    sessionId,
                    customerName: session?.customerName || undefined,
                    sessionType: isSelfbooth ? 'selfbooth' : 'photobooth',
                    cmsUrl,
                    compositeDataUrl: stripUrl || '',
                    compositeFileName: finalCompositeFileName,
                    pairedPrintDataUrl: pairedPrintUrl || undefined,
                    pairedPrintFileName,
                    shots: mediaShots,
                })
                if (!finalized.success) throw new Error(finalized.error || 'Không thể lưu ảnh phiên chụp')
            } catch (finalizeErr) {
                throw finalizeErr
            }

            // ── BƯỚC 3: ĐỒNG BỘ SESSION METADATA LÊN CLOUD CMS & SUPABASE NGAY LẬP TỨC ──
            const layoutType = isSelfbooth
                ? 'selfbooth'
                : selectedFrameSize === '4x6'
                  ? '4x6'
                  : '2x6'
            const kioskId =
                cloudSyncService.getKioskId() ||
                (isSelfbooth ? 'kiosk_02' : 'kiosk_01')

            cloudSyncService.queueSession({
                id: sessionId,
                session_code: `JB${Date.now().toString().slice(-6)}`,
                pin_code: session?.pinCode || null,
                customer_name: session?.customerName || null,
                customer_phone: session?.customerPhone || null,
                kiosk_id: kioskId,
                branch_id: 'branch_01',
                layout_type: layoutType,
                copies: isSelfbooth ? 0 : 2,
                total_amount:
                    session?.paidAmount ||
                    (isSelfbooth
                        ? 50000
                        : selectedFrameSize === '4x6'
                          ? 70000
                          : 50000),
                payment_method: (session?.paymentMethod?.toLowerCase() ===
                'cash'
                    ? 'cash'
                    : 'vietqr') as 'vietqr' | 'cash',
                coupon_code: null,
                paper_consumed: isSelfbooth ? 0 : 2,
                storage_url: galleryTargetUrl,
                status: 'completed',
                created_at: new Date().toISOString(),
                photos: sourcePhotos.map(
                    (p) =>
                        p.enhancedPath ||
                        p.compositedPath ||
                        p.rawPath ||
                        ''
                ),
            })

            // Cập nhật URL thư mục Cloud đồng nhất với QR Code
            setGalleryUrl(galleryTargetUrl)
            useAppStore.getState().setStorageUrl(galleryTargetUrl)
            // Enqueue is durable locally, but is not a Cloud acknowledgement.
            if (!isBrowser) {
                const deadline = Date.now() + 60000
                while (true) {
                    const status = await api.storage.getUploadStatus(sessionId)
                    if (!status.success || !status.data) throw new Error(status.error || 'Không đọc được trạng thái upload')
                    if (status.data.failedTasks > 0) throw new Error('Upload chưa thành công. Ảnh đã lưu tại máy; hãy thử lại khi có mạng.')
                    if (status.data.pendingTasks === 0 && status.data.uploadingTasks === 0 && status.data.activeStreams === 0) break
                    if (Date.now() >= deadline) throw new Error('Cloud chưa xác nhận xong. Ảnh vẫn được giữ trong hàng đợi tại máy.')
                    await new Promise((resolve) => setTimeout(resolve, 500))
                }
            }
            useAppStore.getState().setMediaSyncDone(true)
            useAppStore.getState().setIsSyncingMedia(false)
            setUploadDone(true)

            // ── BƯỚC 5: Tạo Mã QR Tải Ảnh đồng nhất với link Storage ──
            const qrTarget = galleryTargetUrl
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
            useAppStore.getState().setMediaSyncError(err.message || 'Lỗi xử lý ảnh.')
        } finally {
            setIsRetrying(false)
            useAppStore.getState().setIsSyncingMedia(false)
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
            <img
                src={BRAND_LOGO_SRC}
                alt="fotolism"
                className="processing-fixed-brand"
            />

            <div className="processing-card animate-pop">
                <div className="processing-icon-orbit">
                    <Loader2
                        className="processing-spinner"
                        size={60}
                        strokeWidth={2.5}
                    />
                </div>

                <h1 className="processing-title">Đang Xử Lý Bộ Ảnh</h1>
                <p className="processing-desc">
                    Vui lòng đợi giây lát, hệ thống đang tải ảnh và chuẩn bị mã
                    tải về...
                </p>

                <div className="processing-steps-list">
                    <div
                        className={`proc-step-item ${compositeDone ? 'done' : 'active'}`}
                    >
                        <div className="proc-step-indicator">
                            {compositeDone ? (
                                <CheckCircle2 size={20} color="#16A34A" />
                            ) : (
                                <Loader2 size={18} className="step-spin" />
                            )}
                        </div>
                        <span className="proc-step-text">
                            {isSelfbooth
                                ? 'Chuẩn bị kho ảnh Selfbooth'
                                : 'Ghép khung & bộ lọc màu thành phẩm'}
                        </span>
                    </div>

                    <div
                        className={`proc-step-item ${uploadDone ? 'done' : compositeDone ? 'active' : 'pending'}`}
                    >
                        <div className="proc-step-indicator">
                            {uploadDone ? (
                                <CheckCircle2 size={20} color="#16A34A" />
                            ) : compositeDone ? (
                                <Loader2 size={18} className="step-spin" />
                            ) : (
                                <div className="proc-step-dot" />
                            )}
                        </div>
                        <span className="proc-step-text">
                            Tải ảnh lên Cloud & Cloud Gallery
                        </span>
                    </div>

                    <div
                        className={`proc-step-item ${qrDone ? 'done' : uploadDone ? 'active' : 'pending'}`}
                    >
                        <div className="proc-step-indicator">
                            {qrDone ? (
                                <CheckCircle2 size={20} color="#16A34A" />
                            ) : uploadDone ? (
                                <Loader2 size={18} className="step-spin" />
                            ) : (
                                <div className="proc-step-dot" />
                            )}
                        </div>
                        <span className="proc-step-text">
                            Tạo mã QR tải ảnh về điện thoại
                        </span>
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
                            <RefreshCw
                                size={18}
                                className={isRetrying ? 'step-spin' : ''}
                            />
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
