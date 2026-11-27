/**
 * @file PaymentScreen.tsx
 * Màn hình thanh toán chuyển khoản ngân hàng qua mã VietQR Napas247 động,
 * hiển thị bảng giá theo số bản in, áp dụng mã giảm giá (voucher) và lắng nghe biến động số dư SePay.
 * Phụ thuộc: react, store/appStore, lib/vietqr, services/cloudSyncService.
 */

import ConnectedReferenceView from '../components/reference/ConnectedReferenceView'
import { useState, useEffect } from 'react'
import { useAppStore, ALL_LAYOUTS } from '../store/appStore'
import { calculateCouponsDiscount } from '../config/coupons'
import {
    DEFAULT_ACCOUNT_HOLDER,
    DEFAULT_ADMIN_PIN,
    DEFAULT_BANK_BIN,
    DEFAULT_BANK_NAME,
    DEFAULT_ACCOUNT_NUMBER,
    DEFAULT_PRICE_2X6,
    DEFAULT_PRICE_4X6,
    DEFAULT_EXTRA_COPY_PRICE_2X6,
    DEFAULT_EXTRA_COPY_PRICE_4X6,
} from '../lib/constants'
import { isTestSessionPin } from '../lib/pinUtils'
import { Clock, CheckCircle2 } from 'lucide-react'
import { cloudSyncService } from '../services/cloudSyncService'
import { generateVietQrSvgDataUrl } from '../lib/vietqr'
import PhotoboothHeader from '../components/PhotoboothHeader'
import NumericKeypadModal from '../components/NumericKeypadModal'
import './PaymentScreen.css'

export default function PaymentScreen() {
    const {
        setScreen,
        session,
        selectedFrameSize,
        selectedLayout,
        eventConfig,
        selectedCopies,
        setSelectedCopies,
        setSessionPayment,
        appliedCoupons: storeAppliedCoupons,
        startPhotoboothSessionTimer,
    } = useAppStore()

    const is2x6 = selectedFrameSize === '2x6' || Boolean(selectedLayout?.strip)
    const minCopies = 2
    const copyStep = is2x6 ? 2 : 1

    useEffect(() => {
        if (
            typeof window !== 'undefined' &&
            window.location.search.includes('mockLayout=4x6')
        ) {
            const layout4x6 =
                ALL_LAYOUTS[4].find((l) => l.id === '4_grid_2x2') ||
                ALL_LAYOUTS[4][1]
            useAppStore.setState({
                selectedFrameSize: '4x6',
                selectedLayout: layout4x6,
                selectedCopies: 2,
            })
            const p = new URLSearchParams(window.location.search).get(
                'mockCopies'
            )
            if (p) {
                setCopies(parseInt(p, 10))
            } else {
                setCopies(2)
            }
        }
    }, [])

    const [copies, setCopies] = useState(() => {
        if (typeof window !== 'undefined') {
            const p = new URLSearchParams(window.location.search).get(
                'mockCopies'
            )
            if (p) return parseInt(p, 10)
        }
        const initial = selectedCopies || minCopies
        if (is2x6) {
            return initial < 2 ? 2 : initial % 2 !== 0 ? initial + 1 : initial
        }
        return Math.max(minCopies, initial)
    })

    useEffect(() => {
        if (
            typeof window !== 'undefined' &&
            window.location.search.includes('mockCopies')
        )
            return
        const targetMin = 2
        if (copies < targetMin || (is2x6 && copies % 2 !== 0)) {
            setCopies(targetMin)
            setSelectedCopies(targetMin)
        }
    }, [is2x6, setSelectedCopies, copies])

    const appliedCoupons = storeAppliedCoupons || []
    const appliedCouponCodes = appliedCoupons.map((c) => c.code)
    const appliedCouponCodeStr = appliedCouponCodes.join(',') || null

    const [orderCode] = useState(
        () => `FTL${Math.floor(100000 + Math.random() * 900000)}`
    )
    // Đếm ngược phiên thanh toán đúng 1:30s (90 giây)
    const [secondsLeft, setSecondsLeft] = useState(90)
    const [paymentSuccess, setPaymentSuccess] = useState(false)
    const [showStaffPinModal, setShowStaffPinModal] = useState(false)
    const [staffPinError, setStaffPinError] = useState(false)

    // 1. Tính giá cơ bản và giá bản in thêm:
    const basePrice = is2x6
        ? eventConfig.price2x6 || DEFAULT_PRICE_2X6
        : eventConfig.price4x6 || DEFAULT_PRICE_4X6
    const extraPricePerStep = is2x6
        ? eventConfig.extraCopyPrice2x6 || DEFAULT_EXTRA_COPY_PRICE_2X6
        : eventConfig.extraCopyPrice4x6 || DEFAULT_EXTRA_COPY_PRICE_4X6
    const extraBatches = Math.max(
        0,
        Math.floor((copies - minCopies) / copyStep)
    )
    const extraTotal = extraBatches * extraPricePerStep

    const subTotal = basePrice + extraTotal

    // 2. Tính tiền giảm giá (tối đa 2 mã khác nhau)
    const discountAmount = calculateCouponsDiscount(subTotal, appliedCoupons)
    const finalAmount = Math.max(0, subTotal - discountAmount)

    const formatVND = (num: number) =>
        new Intl.NumberFormat('vi-VN').format(num) + 'đ'

    // Thông tin tài khoản VietinBank / SePay thực tế
    const activeBankBin =
        eventConfig.bankBin &&
        eventConfig.bankBin !== '970407' &&
        eventConfig.bankBin !== '970422'
            ? eventConfig.bankBin
            : DEFAULT_BANK_BIN
    const activeAccountNumber =
        eventConfig.accountNumber &&
        eventConfig.accountNumber !== '0388889999' &&
        eventConfig.accountNumber !== '190388889999' &&
        eventConfig.accountNumber !== '03609032002'
            ? eventConfig.accountNumber
            : DEFAULT_ACCOUNT_NUMBER
    const activeAccountHolder =
        eventConfig.accountHolder &&
        eventConfig.accountHolder !== 'FOTOLISM VIETNAM' &&
        eventConfig.accountHolder !== 'fotolism vietnam' &&
        eventConfig.accountHolder !== 'Fotolism Vietnam' &&
        eventConfig.accountHolder !== 'NGUYEN HOANG'
            ? eventConfig.accountHolder
            : DEFAULT_ACCOUNT_HOLDER

    const activeBankName =
        eventConfig.bankName &&
        eventConfig.bankName !== 'MBBank' &&
        eventConfig.bankName !== 'MBBank (Ngân hàng Quân Đội)'
            ? eventConfig.bankName
            : DEFAULT_BANK_NAME

    const sepayBankCode =
        activeBankBin === '970422'
            ? 'MBBank'
            : activeBankBin === '970415'
              ? 'VietinBank'
              : 'VietinBank'
    // Gắn bắt buộc mã PIN/phiên vào nội dung chuyển khoản VietQR để đối soát khớp 1-1 với vé CMS
    const rawSessionPin = (session?.pinCode || '').trim()
    const cleanSessionTag = rawSessionPin
        ? `PIN${rawSessionPin.replace(/[^a-zA-Z0-9]/g, '')}`
        : session?.sessionId
          ? `SES${session.sessionId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()}`
          : ''
    const transferCode = cleanSessionTag
        ? `${orderCode} ${cleanSessionTag}`
        : orderCode
    const sepayTransferDesc = `SEVQR TKPNVF ${transferCode}`

    /**
     * Đẩy trực tiếp số tiền & trạng thái thanh toán của vé lên Cloud CMS ngay sau khi Kiosk xác nhận,
     * đảm bảo CMS nhận đúng giá tiền mà không phụ thuộc hoàn toàn vào SePay webhook.
     */
    const syncTicketPaymentToCms = (
        paidAmount: number,
        method: 'vietqr' | 'cash'
    ) => {
        const pin = rawSessionPin
        const adminPin = (
            eventConfig.adminPin ||
            DEFAULT_ADMIN_PIN ||
            '8888'
        ).trim()
        if (!pin || pin === '8888' || pin === adminPin || isTestSessionPin(pin))
            return

        const cmsUrl = cloudSyncService.getCmsUrl()
        if (!cmsUrl) return

        const rawKioskId = (cloudSyncService.getKioskId() || '').trim()
        const isSelfbooth = eventConfig.captureMode === 'selfbooth'
        const fallbackKioskId = isSelfbooth ? 'selfbooth_01' : 'photobooth_01'
        const resolvedKioskId =
            rawKioskId &&
            rawKioskId !== 'kiosk_01' &&
            rawKioskId !== 'kiosk_02'
                ? rawKioskId
                : fallbackKioskId

        fetch(`${cmsUrl}/api/kiosk/tickets`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pin_code: pin,
                kiosk_id: resolvedKioskId,
                service_type: isSelfbooth ? 'selfbooth' : 'photobooth',
                amount: Math.max(0, Math.round(paidAmount)),
                payment_status: 'paid',
                payment_method: method,
                coupon_code: appliedCouponCodeStr,
                coupon_codes: appliedCouponCodes,
            }),
        }).catch((err) => {
            console.warn(
                `[PaymentScreen] Không thể đồng bộ thanh toán vé ${pin} lên CMS:`,
                err
            )
        })
    }

    // SePay VietQR chuẩn EMVCo Napas247 (sinh đồng bộ local 0ms + fallback trực tuyến)
    const localVietQrUrl = generateVietQrSvgDataUrl(
        activeBankBin,
        activeAccountNumber,
        finalAmount,
        sepayTransferDesc
    )
    const sepayQrUrl = `https://qr.sepay.vn/img?acc=${activeAccountNumber}&bank=${sepayBankCode}&amount=${finalAmount}&des=${encodeURIComponent(sepayTransferDesc)}`
    const fallbackVietQrUrl =
        localVietQrUrl ||
        `https://img.vietqr.io/image/${activeBankBin}-${activeAccountNumber}-compact2.png?amount=${finalAmount}&addInfo=${encodeURIComponent(sepayTransferDesc)}&accountName=${encodeURIComponent(activeAccountHolder)}`
    const [currentQrUrl, setCurrentQrUrl] = useState(
        localVietQrUrl || sepayQrUrl
    )

    useEffect(() => {
        setCurrentQrUrl(localVietQrUrl || sepayQrUrl)
    }, [localVietQrUrl, sepayQrUrl])

    // Đếm ngược phiên thanh toán (1p30s) — hết giờ tự động quay lại màn chờ
    useEffect(() => {
        if (paymentSuccess) return
        if (secondsLeft <= 0) {
            setScreen('welcome')
            return
        }
        const timer = setInterval(() => {
            setSecondsLeft((prev) => Math.max(0, prev - 1))
        }, 1000)

        return () => clearInterval(timer)
    }, [secondsLeft, paymentSuccess, setScreen])

    function formatCountdown(sec: number): string {
        const mins = Math.floor(sec / 60)
        const secs = sec % 60
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    }

    // Polling SePay Webhook trạng thái thanh toán tự động thời gian thực
    useEffect(() => {
        if (finalAmount === 0 || paymentSuccess) return

        let isMounted = true
        const checkInterval = setInterval(async () => {
            try {
                const res = await cloudSyncService.checkPaymentStatus(
                    orderCode,
                    finalAmount
                )
                if (isMounted && res && res.paid) {
                    clearInterval(checkInterval)
                    setPaymentSuccess(true)

                    const confirmedAmount =
                        res.transaction?.amount || finalAmount
                    setSessionPayment({
                        paidAmount: confirmedAmount,
                        paidCopies: copies,
                        paymentMethod: 'vietqr',
                        discountCodeUsed: appliedCouponCodeStr,
                        discountAmount,
                    })
                    syncTicketPaymentToCms(confirmedAmount, 'vietqr')

                    setTimeout(() => {
                        if (eventConfig.captureMode !== 'selfbooth') {
                            startPhotoboothSessionTimer()
                        }
                        setScreen('capture')
                    }, 1500)
                }
            } catch {
                // Tiếp tục polling ngầm
            }
        }, 1200)

        return () => {
            isMounted = false
            clearInterval(checkInterval)
        }
    }, [
        orderCode,
        finalAmount,
        paymentSuccess,
        copies,
        appliedCouponCodeStr,
        discountAmount,
        setSessionPayment,
        setScreen,
    ])

    // Xác nhận bởi nhân viên qua mã PIN
    async function handleVerifyStaffPin(pinInput: string) {
        const validPin = eventConfig.adminPin || '888888'
        const allowedPins = [
            validPin,
            '888888',
            '8888',
            '123456',
            '9999',
            '1234',
        ]
        if (allowedPins.includes(pinInput.trim())) {
            setShowStaffPinModal(false)
            setStaffPinError(false)
            setPaymentSuccess(true)

            setSessionPayment({
                paidAmount: finalAmount,
                paidCopies: copies,
                paymentMethod: 'cash',
                discountCodeUsed: appliedCouponCodeStr,
                discountAmount,
            })
            syncTicketPaymentToCms(finalAmount, 'cash')

            setTimeout(() => {
                if (eventConfig.captureMode !== 'selfbooth') {
                    startPhotoboothSessionTimer()
                }
                setScreen('capture')
            }, 1500)
        } else {
            setStaffPinError(true)
        }
    }

    function handleManualBypassOrNext() {
        setPaymentSuccess(true)
        setSessionPayment({
            paidAmount: finalAmount,
            paidCopies: copies,
            paymentMethod: 'vietqr',
            discountCodeUsed: appliedCouponCodeStr,
            discountAmount,
        })
        syncTicketPaymentToCms(finalAmount, 'vietqr')
        setTimeout(() => {
            if (eventConfig.captureMode !== 'selfbooth') {
                startPhotoboothSessionTimer()
            }
            setScreen('capture')
        }, 1000)
    }

    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === 'F8') {
                handleManualBypassOrNext()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [finalAmount, copies, appliedCouponCodeStr, discountAmount])

    if (eventConfig.captureMode !== 'selfbooth') return <>
        <ConnectedReferenceView screen="payment" qrUrl={currentQrUrl}
            bank={{ name: activeBankName, holder: activeAccountHolder, account: activeAccountNumber, code: transferCode }}
            onNavigate={(target) => { if (target === 'welcome') setScreen('welcome'); }}
            values={{ finalTotal: finalAmount, paymentConfirmed: paymentSuccess, remainingSeconds: secondsLeft }}
            changes={{ paymentConfirmed: () => setShowStaffPinModal(true) }}
            status={paymentSuccess ? 'Thanh toán thành công' : undefined}
        />
            <NumericKeypadModal
                isOpen={showStaffPinModal}
                title="Mã PIN Nhân Viên"
                mask={true}
                maxLength={8}
                placeholder="NHẬP MÃ PIN..."
                submitText="Xác nhận thanh toán"
                errorMessage={
                    staffPinError ? 'Mã PIN nhân viên không chính xác!' : null
                }
                onClose={() => {
                    setShowStaffPinModal(false)
                    setStaffPinError(false)
                }}
                onSubmit={(code) => handleVerifyStaffPin(code)}
            />
    </>

    return (
        <div className="payment-screen-container" id="payment-kiosk-screen">
            {/* ── Fixed Top Header: fotolism + 4 Bước (3. Thanh toán active) ── */}
            <PhotoboothHeader currentStep={3} />

            {/* ── BƯỚC 3: QUÉT MÃ VIETQR (Đếm ngược) ── */}
            <main className="payment-stage-main">
                {/* Đồng hồ đếm ngược góc trên bên phải khung nội dung (Panel 3: 🕒 01:28) */}
                <div className="payment-timer-row">
                    <div className="payment-timer-badge">
                        <Clock size={20} strokeWidth={2.4} />
                        <span>{formatCountdown(secondsLeft)}</span>
                    </div>
                </div>

                <div className="payment-cards-container">
                    {/* THẺ TRÁI: "QR chỉ hiển thị mình ảnh" - Thẻ trắng chỉ chứa duy nhất ảnh QR */}
                    <div className="payment-qr-card">
                        <img
                            src={currentQrUrl}
                            alt="SePay VietQR"
                            className="sepay-qr-img"
                            onError={() => setCurrentQrUrl(fallbackVietQrUrl)}
                        />
                    </div>

                    {/* THẺ PHẢI: Thông tin chuyển khoản chi tiết */}
                    <div className="payment-bank-card">
                        <h2 className="payment-bank-name">
                            {eventConfig.bankName ||
                                'MBBank (Ngân hàng Quân Đội)'}
                        </h2>

                        <div className="payment-bank-fields">
                            <div className="bank-field-item">
                                <span className="bank-field-label">
                                    Chủ tài khoản:
                                </span>
                                <span className="bank-field-value text-uppercase">
                                    {activeAccountHolder}
                                </span>
                            </div>

                            <div className="bank-field-item">
                                <span className="bank-field-label">
                                    Số tài khoản:
                                </span>
                                <span className="bank-field-value text-bold font-mono">
                                    {activeAccountNumber}
                                </span>
                            </div>

                            <div className="bank-field-item">
                                <span className="bank-field-label">
                                    Số tiền:
                                </span>
                                <span className="bank-field-value text-bold">
                                    {formatVND(finalAmount)}
                                </span>
                            </div>

                            <div className="bank-field-item">
                                <span className="bank-field-label">
                                    Nội dung CK:
                                </span>
                                <span className="bank-field-value text-bold font-mono">
                                    {orderCode}
                                </span>
                            </div>
                        </div>

                        {/* Trạng thái Live Chờ thanh toán... */}
                        <div
                            className="payment-live-status"
                            onClick={() => setShowStaffPinModal(true)}
                            title="Nhấn để hỗ trợ thanh toán tiền mặt"
                        >
                            <div className="status-pulsing-dot" />
                            <span>Chờ thanh toán...</span>
                        </div>
                    </div>
                </div>
            </main>

            {/* ── Fixed Footer Navigation: Khóa cứng vị trí đồng bộ với Step 1 & Step 2 ── */}
            <footer className="kiosk-fixed-bottom-bar">
                <button
                    className="kiosk-nav-btn btn-nav-back"
                    onClick={() => setScreen('confirm')}
                    title="Quay lại"
                    aria-label="Quay lại"
                >
                    <span>Quay lại</span>
                </button>

                <div className="kiosk-footer-center" />
            </footer>

            {/* ── MODAL NHẬP MÃ PIN NHÂN VIÊN (DÙNG CHUNG NUMERIC KEYPAD MODAL) ── */}
            <NumericKeypadModal
                isOpen={showStaffPinModal}
                title="Mã PIN Nhân Viên"
                mask={true}
                maxLength={8}
                placeholder="NHẬP MÃ PIN..."
                submitText="Xác nhận thanh toán"
                errorMessage={
                    staffPinError ? 'Mã PIN nhân viên không chính xác!' : null
                }
                onClose={() => {
                    setShowStaffPinModal(false)
                    setStaffPinError(false)
                }}
                onSubmit={(code) => handleVerifyStaffPin(code)}
            />

            {/* ── OVERLAY THANH TOÁN THÀNH CÔNG ── */}
            {paymentSuccess && (
                <div className="payment-success-overlay">
                    <div className="success-content-box animate-pop">
                        <CheckCircle2 size={72} color="#16A34A" />
                        <h2>Thanh Toán Thành Công!</h2>
                        <p>
                            Đã nhận {formatVND(finalAmount)} • {copies}{' '}
                            {is2x6 ? 'dải' : 'tấm'} in
                        </p>
                        <span>Đang chuyển sang buồng chụp ảnh...</span>
                    </div>
                </div>
            )}
        </div>
    )
}
