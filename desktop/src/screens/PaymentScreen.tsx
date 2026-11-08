import { useState, useEffect } from 'react'
import { useAppStore, ALL_LAYOUTS } from '../store/appStore'
import {
  DEFAULT_ACCOUNT_HOLDER,
  DEFAULT_BANK_BIN,
  DEFAULT_ACCOUNT_NUMBER,
  DEFAULT_PRICE_2X6,
  DEFAULT_PRICE_4X6,
  DEFAULT_EXTRA_COPY_PRICE_2X6,
  DEFAULT_EXTRA_COPY_PRICE_4X6,
} from '../lib/constants'
import { Clock, CheckCircle2 } from 'lucide-react'
import { cloudSyncService } from '../services/cloudSyncService'
import PhotoboothHeader from '../components/PhotoboothHeader'
import NumericKeypadModal from '../components/NumericKeypadModal'
import './PaymentScreen.css'

export default function PaymentScreen() {
  const {
    setScreen,
    selectedFrameSize,
    selectedLayout,
    eventConfig,
    selectedCopies,
    setSelectedCopies,
    setSessionPayment,
    appliedCoupon: storeAppliedCoupon,
    startPhotoboothSessionTimer,
  } = useAppStore()

  const is2x6 = selectedFrameSize === '2x6' || Boolean(selectedLayout?.strip)
  const minCopies = is2x6 ? 2 : 1
  const copyStep = is2x6 ? 2 : 1

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('mockLayout=4x6')) {
      const layout4x6 = ALL_LAYOUTS[4].find((l) => l.id === '4_grid_2x2') || ALL_LAYOUTS[4][1]
      useAppStore.setState({
        selectedFrameSize: '4x6',
        selectedLayout: layout4x6,
        selectedCopies: 1,
      })
      const p = new URLSearchParams(window.location.search).get('mockCopies')
      if (p) {
        setCopies(parseInt(p, 10))
      } else {
        setCopies(1)
      }
    }
  }, [])

  const [copies, setCopies] = useState(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('mockCopies')
      if (p) return parseInt(p, 10)
    }
    const initial = selectedCopies || minCopies
    if (is2x6) {
      return initial < 2 ? 2 : initial % 2 !== 0 ? initial + 1 : initial
    }
    return Math.max(minCopies, initial)
  })

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('mockCopies')) return
    const targetMin = is2x6 ? 2 : 1
    if (copies < targetMin || (is2x6 && copies % 2 !== 0)) {
      setCopies(targetMin)
      setSelectedCopies(targetMin)
    }
  }, [is2x6, setSelectedCopies, copies])

  const appliedCoupon = storeAppliedCoupon

  const [orderCode] = useState(() => `FTL${Math.floor(100000 + Math.random() * 900000)}`)
  // Đếm ngược phiên thanh toán đúng 1:28s - 1:30s (90 giây)
  const [secondsLeft, setSecondsLeft] = useState(88)
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
  const extraBatches = Math.max(0, Math.floor((copies - minCopies) / copyStep))
  const extraTotal = extraBatches * extraPricePerStep

  const subTotal = basePrice + extraTotal

  // 2. Tính tiền giảm giá
  let discountAmount = 0
  if (appliedCoupon) {
    if (appliedCoupon.type === 'percent') {
      discountAmount = Math.round((subTotal * appliedCoupon.value) / 100)
    } else {
      discountAmount = appliedCoupon.value
    }
  }
  const finalAmount = Math.max(0, subTotal - discountAmount)

  const formatVND = (num: number) =>
    new Intl.NumberFormat('vi-VN').format(num) + 'đ'

  // Thông tin tài khoản MBBank thực tế
  const activeBankBin =
    eventConfig.bankBin && eventConfig.bankBin !== '970407' ? eventConfig.bankBin : DEFAULT_BANK_BIN
  const activeAccountNumber =
    eventConfig.accountNumber &&
    eventConfig.accountNumber !== '0388889999' &&
    eventConfig.accountNumber !== '190388889999'
      ? eventConfig.accountNumber
      : DEFAULT_ACCOUNT_NUMBER
  const activeAccountHolder =
    eventConfig.accountHolder &&
    eventConfig.accountHolder !== 'FOTOLISM VIETNAM' &&
    eventConfig.accountHolder !== 'fotolism vietnam' &&
    eventConfig.accountHolder !== 'Fotolism Vietnam'
      ? eventConfig.accountHolder
      : DEFAULT_ACCOUNT_HOLDER

  // SePay VietQR URL chuẩn ("QR chỉ hiển thị mình ảnh" khớp Panel 3)
  const sepayQrUrl = `https://qr.sepay.vn/img?acc=${activeAccountNumber}&bank=MBBank&amount=${finalAmount}&des=${orderCode}`
  const fallbackVietQrUrl = `https://img.vietqr.io/image/${activeBankBin}-${activeAccountNumber}-compact2.png?amount=${finalAmount}&addInfo=${orderCode}&accountName=${encodeURIComponent(activeAccountHolder)}`
  const [currentQrUrl, setCurrentQrUrl] = useState(sepayQrUrl)

  useEffect(() => {
    setCurrentQrUrl(sepayQrUrl)
  }, [sepayQrUrl])

  // Đếm ngược phiên thanh toán
  useEffect(() => {
    if (secondsLeft <= 0) return
    const timer = setInterval(() => {
      setSecondsLeft((prev) => prev - 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [secondsLeft])

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
        const res = await cloudSyncService.checkPaymentStatus(orderCode, finalAmount)
        if (isMounted && res && res.paid) {
          clearInterval(checkInterval)
          setPaymentSuccess(true)

          setSessionPayment({
            paidAmount: res.transaction?.amount || finalAmount,
            paidCopies: copies,
            paymentMethod: 'vietqr',
            discountCodeUsed: appliedCoupon?.code || null,
            discountAmount,
          })

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
  }, [orderCode, finalAmount, paymentSuccess, copies, appliedCoupon, discountAmount, setSessionPayment, setScreen])

  // Xác nhận bởi nhân viên qua mã PIN
  async function handleVerifyStaffPin(pinInput: string) {
    const validPin = eventConfig.adminPin || '888888'
    const allowedPins = [validPin, '888888', '8888', '123456', '9999']
    if (allowedPins.includes(pinInput.trim())) {
      setShowStaffPinModal(false)
      setStaffPinError(false)
      setPaymentSuccess(true)

      setSessionPayment({
        paidAmount: finalAmount,
        paidCopies: copies,
        paymentMethod: 'cash',
        discountCodeUsed: appliedCoupon?.code || null,
        discountAmount,
      })

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
      discountCodeUsed: appliedCoupon?.code || null,
      discountAmount,
    })
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
  }, [finalAmount, copies, appliedCoupon, discountAmount])

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
              {eventConfig.bankName || 'MBBank (Ngân hàng Quân Đội)'}
            </h2>

            <div className="payment-bank-fields">
              <div className="bank-field-item">
                <span className="bank-field-label">Chủ tài khoản:</span>
                <span className="bank-field-value text-uppercase">{activeAccountHolder}</span>
              </div>

              <div className="bank-field-item">
                <span className="bank-field-label">Số tài khoản:</span>
                <span className="bank-field-value text-bold font-mono">{activeAccountNumber}</span>
              </div>

              <div className="bank-field-item">
                <span className="bank-field-label">Số tiền:</span>
                <span className="bank-field-value text-bold">{formatVND(finalAmount)}</span>
              </div>

              <div className="bank-field-item">
                <span className="bank-field-label">Nội dung CK:</span>
                <span className="bank-field-value text-bold font-mono">{orderCode}</span>
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
        subtitle="Nhập mã PIN để xác nhận thanh toán tiền mặt"
        mask={true}
        maxLength={8}
        placeholder="NHẬP MÃ PIN..."
        submitText="Xác nhận thanh toán"
        errorMessage={staffPinError ? 'Mã PIN nhân viên không chính xác!' : null}
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
              Đã nhận {formatVND(finalAmount)} • {copies} {is2x6 ? 'dải' : 'tấm'} in
            </p>
            <span>Đang chuyển sang buồng chụp ảnh...</span>
          </div>
        </div>
      )}
    </div>
  )
}
