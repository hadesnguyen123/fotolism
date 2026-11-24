/**
 * @file ProcessingScreen.tsx
 * Màn hình chờ kết xuất và đồng bộ ảnh sau phiên chụp:
 * kiểm soát thanh tiến trình ghép khung ảnh, tải lên Cloudflare R2 qua Outbox Worker và tạo mã QR nhận ảnh.
 * Phụ thuộc: react, store/appStore, lib/canvasCompositor, lib/pinUtils, services/cloudSyncService.
 */

import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import {
    generateStripComposite,
    preparePrintImageForDNP,
} from '../lib/canvasCompositor'
import { buildPhotoUrlCandidates } from '../lib/photoboothSlotIntegrity'
import { fotolismApi, isBrowser as isBrowserEnv, mockApi } from '../lib/api'
import { cloudSyncService } from '../services/cloudSyncService'
import {
    DEFAULT_PRINT_SCALE,
    FILE_PREFIX_FINAL,
    FILE_PREFIX_SELF,
    FILE_PREFIX_SHOT,
    UPLOAD_STALL_TIMEOUT_MS,
} from '../lib/constants'
import { BRAND_LOGO_SRC } from '../lib/brandLogo'
import QRCode from 'qrcode'
import { BouncingStarLoadingModal } from '../components/BouncingStarLoadingModal'
import './ProcessingScreen.css'
import {
    buildGalleryUrl,
    extractRawPin,
    formatLocalSessionFolder,
    isTestSessionPin,
} from '../lib/pinUtils'

export default function ProcessingScreen() {
    const session = useAppStore((s) => s.session)
    const setCompositeStripUrl = useAppStore((s) => s.setCompositeStripUrl)
    const setGalleryUrl = useAppStore((s) => s.setGalleryUrl)
    const selectedFrameSize = useAppStore((s) => s.selectedFrameSize)
    const selectedLayout = useAppStore((s) => s.selectedLayout)
    const selectedTheme = useAppStore((s) => s.selectedTheme)
    const selectedFilter = useAppStore((s) => s.selectedFilter)
    const placedStickers = useAppStore((s) => s.placedStickers)
    const eventConfig = useAppStore((s) => s.eventConfig)
    const setScreen = useAppStore((s) => s.setScreen)

    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [isRetrying, setIsRetrying] = useState(false)

    const isBrowser = isBrowserEnv
    const isSelfbooth = eventConfig.captureMode === 'selfbooth'
    const isStarted = useRef(false)
    const isMountedRef = useRef(true)
    const hasNavigatedRef = useRef(false)
    const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    async function processMediaAndUpload() {
        try {
            setErrorMessage(null)
            useAppStore.getState().setIsSyncingMedia(true)
            useAppStore.getState().setMediaSyncError(null)

            const photos = session?.photos || []
            let stripUrl: string | null = null

            let pairedPrintUrl: string | null = null
            const currentPrintScale =
                useAppStore.getState().printScale || DEFAULT_PRINT_SCALE

            if (!isSelfbooth) {
                // Photobooth: Ghép Khung Ảnh Thành Phẩm 1 lần từ ảnh `enhancedPath` (`natural`) và WebGL2/Canvas filter
                // Kèm danh sách ứng viên dự phòng (`enhancedPath -> compositedPath -> rawPath`) tránh mất ảnh tại bước kết xuất cuối
                const photoCandidates = photos
                    .map((p) =>
                        buildPhotoUrlCandidates({
                            compositedPath: p.enhancedPath,
                            enhancedPath: p.compositedPath,
                            rawPath: p.rawPath,
                        })
                    )
                    .filter((cands) => cands.length > 0)
                console.log(
                    '[ProcessingScreen] Generating final composite strip with',
                    photoCandidates.length,
                    'photos (filter=' + (selectedFilter?.id || 'normal') + ')...'
                )
                const effectiveOffsets =
                    session?.slotOffsets ||
                    useAppStore.getState().slotOffsets ||
                    []
                stripUrl = await generateStripComposite({
                    photos: photoCandidates,
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
            const sessionId = formatLocalSessionFolder(
                session?.pinCode || session?.sessionId
            )
            const rawPin = extractRawPin(session?.pinCode || sessionId)
            const cmsUrl = cloudSyncService.getCmsUrl()
            const finalCompositeFileName = `${FILE_PREFIX_FINAL}_${selectedFrameSize}.jpg`
            const pairedPrintFileName =
                selectedFrameSize === '2x6'
                    ? `${FILE_PREFIX_FINAL}_2x6_paired_4x6.jpg`
                    : `${FILE_PREFIX_FINAL}_4x6_scaled.jpg`
            const galleryTargetUrl = buildGalleryUrl(rawPin)

            const sourcePhotos =
                session?.selfboothLibrary &&
                session.selfboothLibrary.length > 0
                    ? session.selfboothLibrary
                    : photos

            const mediaShots = sourcePhotos.map((p, idx) => ({
                slotIndex: idx,
                id: p.id || `shot_${idx + 1}`,
                fileName: `${isSelfbooth ? FILE_PREFIX_SELF : FILE_PREFIX_SHOT}_${idx + 1}.jpg`,
                rawPath: p.rawPath,
                enhancedPath: p.enhancedPath,
                rawPhotoUrl: p.rawPath,
                enhancedPhotoUrl: p.enhancedPath,
            }))

            const isTestSession =
                !isSelfbooth && isTestSessionPin(session?.pinCode || sessionId)

            try {
                console.log(
                    '[ProcessingScreen] Finalizing session media into sessions/{sessionId}/raw & final...'
                )
                const finalized = await api.storage.finalizeSessionMedia({
                    sessionId,
                    customerName: session?.customerName || undefined,
                    sessionType: isSelfbooth ? 'selfbooth' : 'photobooth',
                    cmsUrl,
                    skipCloudUpload: isTestSession,
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

            // ── BƯỚC 3: ĐỒNG BỘ SESSION METADATA LÊN CLOUD CMS & SUPABASE (Bỏ qua với mã test 1234) ──
            if (!isTestSession) {
                const layoutType = isSelfbooth
                    ? 'selfbooth'
                    : selectedFrameSize === '4x6'
                      ? '4x6'
                      : '2x6'
                const deviceConfig = cloudSyncService.getDeviceConfig()
                const kioskId = cloudSyncService.getKioskId()
                const branchId = deviceConfig?.branch_id || undefined

                if (!kioskId) {
                    console.error(
                        '[ProcessingScreen] Thiếu cấu hình Kiosk ID (device_config) khi đồng bộ phiên chụp',
                        { sessionId }
                    )
                }

                const paidCopies =
                    session?.paidCopies && session.paidCopies > 0
                        ? session.paidCopies
                        : isSelfbooth
                          ? 0
                          : 1

                cloudSyncService.queueSession({
                    id: sessionId,
                    session_code: `JB${Date.now().toString().slice(-6)}`,
                    pin_code: rawPin || null,
                    customer_name: session?.customerName || null,
                    customer_phone: session?.customerPhone || null,
                    kiosk_id: kioskId,
                    branch_id: branchId,
                    layout_type: layoutType,
                    copies: isSelfbooth ? 0 : paidCopies,
                    total_amount: session?.paidAmount ?? 0,
                    payment_method: (session?.paymentMethod?.toLowerCase() ===
                    'cash'
                        ? 'cash'
                        : 'vietqr') as 'vietqr' | 'cash',
                    coupon_code: null,
                    paper_consumed: isSelfbooth ? 0 : paidCopies,
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

                // Chờ đồng bộ bản ghi session lên Cloud CMS/Supabase để quét QR mở Gallery không bị 404
                const syncWaitDeadline = Date.now() + 5000
                while (cloudSyncService.getStatus().isSyncing && Date.now() < syncWaitDeadline) {
                    await new Promise((resolve) => setTimeout(resolve, 150))
                }
                const syncRes = await cloudSyncService.syncPendingSessions()
                if (!syncRes.success && syncRes.message !== 'Tất cả phiên chụp đã được đồng bộ') {
                    console.error('[ProcessingScreen] Session sync error:', syncRes.message, {
                        sessionId,
                        kioskId,
                    })
                }

                // Cập nhật URL thư mục Cloud đồng nhất với QR Code
                setGalleryUrl(galleryTargetUrl)
                useAppStore.getState().setStorageUrl(galleryTargetUrl)
                // Bắt buộc chờ toàn bộ ảnh trong phiên tải lên hoàn tất 100% mới chuyển sang ReviewScreen
                if (!isBrowser) {
                    const STALL_TIMEOUT_MS = UPLOAD_STALL_TIMEOUT_MS
                    let lastUploadedCount = -1
                    let lastProgressAt = Date.now()
                    while (true) {
                        const status = await api.storage.getUploadStatus(sessionId)
                        if (!status.success || !status.data) {
                            throw new Error(
                                status.error || 'Không đọc được trạng thái upload'
                            )
                        }
                        const {
                            pendingTasks,
                            uploadingTasks,
                            failedTasks,
                            uploadedTasks,
                            totalTasks,
                        } = status.data
                        const effectiveTotal =
                            totalTasks ??
                            pendingTasks +
                                uploadingTasks +
                                uploadedTasks +
                                failedTasks

                        if (uploadedTasks > lastUploadedCount) {
                            lastUploadedCount = uploadedTasks
                            lastProgressAt = Date.now()
                        }

                        if (failedTasks > 0) {
                            throw new Error(
                                'Tải ảnh lên chưa hoàn tất. Vui lòng bấm Thử lại.'
                            )
                        }
                        if (
                            effectiveTotal > 0 &&
                            pendingTasks === 0 &&
                            uploadingTasks === 0 &&
                            uploadedTasks >= effectiveTotal
                        ) {
                            break
                        }
                        if (
                            uploadingTasks === 0 &&
                            Date.now() - lastProgressAt >= STALL_TIMEOUT_MS
                        ) {
                            throw new Error(
                                'Tải ảnh lên Cloud bị gián đoạn. Vui lòng kiểm tra mạng và bấm Thử lại.'
                            )
                        }
                        if (Date.now() - lastProgressAt >= STALL_TIMEOUT_MS * 2) {
                            throw new Error(
                                'Tải ảnh lên quá chậm. Vui lòng bấm Thử lại.'
                            )
                        }
                        await new Promise((resolve) => setTimeout(resolve, 500))
                    }
                }
            } else {
                console.log('[ProcessingScreen] Mã test 1234: đã xử lý & lưu ảnh vào session_1234, không đẩy lên Cloud.')
                setGalleryUrl(galleryTargetUrl)
            }
            useAppStore.getState().setMediaSyncDone(true)
            useAppStore.getState().setIsSyncingMedia(false)

            // ── BƯỚC 5: Tạo Mã QR Tải Ảnh đồng nhất với link Storage ──
            const qrTarget = galleryTargetUrl
            try {
                await QRCode.toDataURL(qrTarget, {
                    margin: 1,
                    width: 260,
                    color: { dark: '#2d2426', light: '#ffffff' },
                })
            } catch (qrErr) {
                console.warn('[ProcessingScreen] QR generation warning:', qrErr)
            }

            // ── BƯỚC 4: Chuyển Sang Màn Hình Review Cuối Cùng ──
            // Selfbooth: chờ thêm 15s sau khi đã đẩy lên R2 và sẵn sàng QR để đảm bảo đồng bộ Cloud hoàn toàn
            const transitionDelayMs = isSelfbooth ? 15000 : 600
            if (isMountedRef.current && !hasNavigatedRef.current) {
                hasNavigatedRef.current = true
                if (navTimerRef.current) clearTimeout(navTimerRef.current)
                navTimerRef.current = setTimeout(() => {
                    if (isMountedRef.current) {
                        setScreen('review')
                    }
                }, transitionDelayMs)
            }
        } catch (err: any) {
            console.error('[ProcessingScreen] Process failed:', err)
            if (isMountedRef.current) {
                setErrorMessage(err.message || 'Lỗi xử lý ảnh. Vui lòng thử lại.')
            }
            useAppStore.getState().setMediaSyncError(err.message || 'Lỗi xử lý ảnh.')
        } finally {
            if (isMountedRef.current) {
                setIsRetrying(false)
            }
            useAppStore.getState().setIsSyncingMedia(false)
        }
    }

    useEffect(() => {
        isMountedRef.current = true
        if (!isStarted.current) {
            isStarted.current = true
            processMediaAndUpload()
        }
        return () => {
            isMountedRef.current = false
            if (navTimerRef.current) {
                clearTimeout(navTimerRef.current)
                navTimerRef.current = null
            }
        }
    }, [])

    async function handleRetry() {
        setIsRetrying(true)
        if (!isBrowser) {
            try {
                await fotolismApi.storage.retryFailedUploads()
            } catch {}
        }
        await processMediaAndUpload()
    }

    return (
        <div className="processing-screen-container animate-fade-in">
            <img
                src={BRAND_LOGO_SRC}
                alt="fotolism"
                className="processing-fixed-brand"
            />

            <BouncingStarLoadingModal
                inline
                message="Đang hoàn thiện ảnh cho bạn nè"
                errorMessage={errorMessage}
                onRetry={handleRetry}
                retryDisabled={isRetrying}
            />
        </div>
    )
}
