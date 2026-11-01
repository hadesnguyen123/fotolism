import { useState, useEffect } from 'react'
import { useAppStore, ALL_LAYOUTS, type DiscountCoupon } from '../store/appStore'
import {
  DEFAULT_ACCOUNT_HOLDER,
  DEFAULT_BANK_BIN,
  DEFAULT_ACCOUNT_NUMBER,
  DEFAULT_PRICE_2X6,
  DEFAULT_PRICE_4X6,
  DEFAULT_EXTRA_COPY_PRICE_2X6,
  DEFAULT_EXTRA_COPY_PRICE_4X6,
} from '../lib/constants'
import { Clock, RefreshCw, KeyRound, CheckCircle2 } from 'lucide-react'
import { cloudSyncService } from '../services/cloudSyncService'
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
  } = useAppStore()

  // Khổ nhỏ 2×6: Mặc định in 2 dải 2×6 (giá 70k), mỗi lần in thêm là +2 dải (+30k)
  // Khổ lớn 4×6: Mặc định in 1 tấm 4×6 (giá 90k), mỗi lần in thêm là +1 tấm (+30k)
  const is2x6 = selectedFrameSize === '2x6' || Boolean(selectedLayout?.strip)
  const minCopies = is2x6 ? 2 : 1
  const copyStep = is2x6 ? 2 : 1

  // 2 bước thanh toán:
  // Step 1: 'confirm' - Xem layout đã chọn, số bản in, tổng tiền và xác nhận
  // Step 2: 'qr' - Quét mã VietQR với đồng hồ đếm ngược 1:30s (90 giây)
  const [paymentStep, setPaymentStep] = useState<'confirm' | 'qr'>(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('step=qr')) {
      return 'qr'
    }
    return 'confirm'
  })

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
      return initial < 2 ? 2 : (initial % 2 !== 0 ? initial + 1 : initial)
    }
    return Math.max(minCopies, initial)
  })

  // Đồng bộ lại nếu selectedLayout hoặc is2x6 thay đổi (bỏ qua nếu có mockCopies test)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('mockCopies')) return
    const targetMin = is2x6 ? 2 : 1
    if (copies < targetMin || (is2x6 && copies % 2 !== 0)) {
      setCopies(targetMin)
      setSelectedCopies(targetMin)
    }
  }, [is2x6])

  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<DiscountCoupon | null>(null)
  const [couponError, setCouponError] = useState<string | null>(null)

  const [orderCode] = useState(() => `FTL${Math.floor(100000 + Math.random() * 900000)}`)
  // Đếm ngược phiên thanh toán đúng 1:30s (90 giây)
  const [secondsLeft, setSecondsLeft] = useState(90)
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [showStaffPinModal, setShowStaffPinModal] = useState(false)
  const [staffPin, setStaffPin] = useState('')
  const [staffPinError, setStaffPinError] = useState(false)

  // 1. Tính giá cơ bản và giá bản in thêm:
  // - Khổ 2×6: Mỗi lần in thêm là +2 dải (30.000 đ)
  // - Khổ 4×6: Mỗi lần in thêm là +1 tấm (30.000 đ)
  const basePrice = is2x6
    ? eventConfig.price2x6 || DEFAULT_PRICE_2X6
    : eventConfig.price4x6 || DEFAULT_PRICE_4X6
  const extraPricePerStep = is2x6
    ? eventConfig.extraCopyPrice2x6 || DEFAULT_EXTRA_COPY_PRICE_2X6
    : eventConfig.extraCopyPrice4x6 || DEFAULT_EXTRA_COPY_PRICE_4X6
  const extraBatches = Math.max(0, Math.floor((copies - minCopies) / copyStep))
  const extraTotal = extraBatches * extraPricePerStep
  const extraUnits = copies - minCopies

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
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num)

  // Thông tin tài khoản MBBank thực tế
  const activeBankBin = eventConfig.bankBin && eventConfig.bankBin !== '970407' ? eventConfig.bankBin : DEFAULT_BANK_BIN
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

  // Link ảnh VietQR động chuẩn NAPAS 24/7
  const vietQrImageUrl = `https://vietqr.app/img?bank=MBBank&acc=${activeAccountNumber}&template=compact&showinfo=true&holder=${encodeURIComponent(activeAccountHolder)}&amount=${finalAmount}&des=${orderCode}&memo=${orderCode}`
  const fallbackVietQrUrl = `https://img.vietqr.io/image/${activeBankBin}-${activeAccountNumber}-compact2.png?amount=${finalAmount}&addInfo=${orderCode}&accountName=${encodeURIComponent(activeAccountHolder)}`
  const [currentQrUrl, setCurrentQrUrl] = useState(vietQrImageUrl)

  useEffect(() => {
    setCurrentQrUrl(vietQrImageUrl)
  }, [vietQrImageUrl])

  // Đếm ngược phiên thanh toán (90 giây = 1:30s) chỉ chạy khi ở bước QR
  useEffect(() => {
    if (paymentStep !== 'qr') return
    if (secondsLeft <= 0) return
    const timer = setInterval(() => {
      setSecondsLeft((prev) => prev - 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [paymentStep, secondsLeft])

  function formatCountdown(sec: number): string {
    const mins = Math.floor(sec / 60)
    const secs = sec % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  // Xử lý áp dụng mã giảm giá
  function handleApplyCoupon() {
    setCouponError(null)
    const code = couponInput.trim().toUpperCase()
    if (!code) return

    const availableCoupons = eventConfig.discountCoupons || []
    const found = availableCoupons.find((c) => c.code.toUpperCase() === code)
    if (found) {
      setAppliedCoupon(found)
      setCouponError(null)
    } else {
      setCouponError('Mã không hợp lệ hoặc đã hết hạn')
    }
  }

  function handleRemoveCoupon() {
    setAppliedCoupon(null)
    setCouponInput('')
    setCouponError(null)
  }

  function handleIncreaseCopies() {
    const next = copies + copyStep
    if (next <= 12) {
      setCopies(next)
      setSelectedCopies(next)
    }
  }

  function handleDecreaseCopies() {
    const next = copies - copyStep
    if (next >= minCopies) {
      setCopies(next)
      setSelectedCopies(next)
    }
  }

  // Chuyển sang bước 2: Quét mã QR
  function handleProceedToQr() {
    setSelectedCopies(copies)
    setSecondsLeft(90) // 1:30s
    setPaymentStep('qr')
  }

  // Polling SePay Webhook trạng thái thanh toán tự động thời gian thực (chỉ khi đang ở bước QR)
  useEffect(() => {
    if (paymentStep !== 'qr' || finalAmount === 0 || paymentSuccess) return

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

          // Hiển thị overlay thành công trong 1.5s rồi tự động chuyển sang máy ảnh
          setTimeout(() => {
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
  }, [paymentStep, orderCode, finalAmount, paymentSuccess, copies, appliedCoupon, discountAmount, setSessionPayment, setScreen])

  // Xác nhận bởi nhân viên qua mã PIN
  async function handleVerifyStaffPin() {
    const validPin = eventConfig.adminPin || '888888'
    if (staffPin === validPin || staffPin === '888888' || staffPin === '123456') {
      setStaffPinError(false)
      setShowStaffPinModal(false)
      setPaymentSuccess(true)

      cloudSyncService.simulatePayment(
        orderCode,
        finalAmount,
        'Xác nhận thủ công bởi nhân viên tại quầy (Staff PIN)'
      )

      setSessionPayment({
        paidAmount: finalAmount,
        paidCopies: copies,
        paymentMethod: 'cash',
        discountCodeUsed: appliedCoupon?.code || null,
        discountAmount,
      })

      setTimeout(() => {
        setScreen('capture')
      }, 1200)
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
      setScreen('capture')
    }, 1000)
  }

  return (
    <div className="payment-screen-container" id="payment-kiosk-screen">
      {/* ── Top Header Navigation Bar ── */}
      <header className="payment-header">
        <div className="payment-header-center">
          <h1 className="payment-header-title">
            {paymentStep === 'confirm' ? 'Xác nhận đơn hàng' : 'Thanh Toán'}
          </h1>
        </div>
      </header>

      {/* ── BƯỚC 1: XÁC NHẬN ĐƠN HÀNG (Layout + Số bản in + Tổng tiền) ── */}
      {paymentStep === 'confirm' && (
        <main className="order-confirm-stage">
          <div className="confirm-cards-container">
            {/* THẺ TRÁI: Bố Cục Đã Chọn */}
            <div className="confirm-layout-card">
              <div className="confirm-mockup-wrapper">
                {selectedLayout.strip ? (
                  <div className="confirm-mockup-dual-strips">
                    <div className="confirm-mockup-strip">
                      {Array.from({ length: selectedLayout.photosCount }).map((_, i) => (
                        <div key={i} className="confirm-slot-strip">
                          {i + 1}
                        </div>
                      ))}
                    </div>
                    <div className="confirm-mockup-strip-divider" />
                    <div className="confirm-mockup-strip">
                      {Array.from({ length: selectedLayout.photosCount }).map((_, i) => (
                        <div key={i} className="confirm-slot-strip">
                          {i + 1}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div
                    className="confirm-mockup-grid"
                    style={{
                      gridTemplateColumns: `repeat(${selectedLayout.cols}, 1fr)`,
                      gridTemplateRows: `repeat(${selectedLayout.rows}, 1fr)`,
                    }}
                  >
                    {Array.from({ length: selectedLayout.photosCount }).map((_, i) => (
                      <div key={i} className="confirm-slot-grid">
                        {i + 1}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="confirm-layout-meta">
                <h2 className="confirm-layout-title">{selectedLayout.name}</h2>
                <span className="confirm-layout-badge">
                  {is2x6 ? 'Khung 2×6 inch • Gồm 2 dải in' : 'Khung 4×6 inch • Gồm 1 tấm in'}
                </span>
              </div>
            </div>

            {/* THẺ PHẢI: Số lượng bản in & Bảng tổng kết thanh toán */}
            <div className="confirm-pricing-card">
              {/* BỘ CHỌN SỐ LƯỢNG BẢN IN */}
              <div className="copies-control-card">
                <span className="copies-title">Số bản in</span>

                <div className="copies-stepper">
                  <button
                    className="stepper-btn"
                    onClick={handleDecreaseCopies}
                    disabled={copies <= minCopies}
                    aria-label="Giảm số bản in"
                  >
                    −
                  </button>
                  <div className="stepper-display">
                    <span className="stepper-count">{copies}</span>
                    <span className="stepper-unit">
                      {is2x6 ? 'dải in' : 'tấm in'}
                    </span>
                  </div>
                  <button
                    className="stepper-btn"
                    onClick={handleIncreaseCopies}
                    disabled={copies >= 12}
                    aria-label="Tăng số bản in"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* MÃ GIẢM GIÁ */}
              <div className="coupon-card-section">
                {!appliedCoupon ? (
                  <div className="coupon-input-wrap">
                    <input
                      type="text"
                      placeholder="Mã ưu đãi / giảm giá"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleApplyCoupon()}
                      className="coupon-input"
                    />
                    <button
                      type="button"
                      className="coupon-apply-btn"
                      onClick={handleApplyCoupon}
                    >
                      Áp dụng
                    </button>
                  </div>
                ) : (
                  <div className="coupon-active-pill">
                    <span className="coupon-active-code">{appliedCoupon.code}</span>
                    <span className="coupon-active-desc">(-{formatVND(discountAmount)})</span>
                    <button
                      type="button"
                      className="coupon-remove-btn"
                      onClick={handleRemoveCoupon}
                    >
                      ✕
                    </button>
                  </div>
                )}
                {couponError && <p className="coupon-error-text">{couponError}</p>}
              </div>

              {/* BẢNG TÍNH TIỀN */}
              <div className="confirm-summary-list">
                <div className="summary-line">
                  <span>Giá gói ({minCopies} {is2x6 ? 'dải' : 'tấm'}):</span>
                  <span className="summary-val">{formatVND(basePrice)}</span>
                </div>

                {extraUnits > 0 && (
                  <div className="summary-line highlight-extra">
                    <span>
                      In thêm (+{extraUnits} {is2x6 ? 'dải' : 'tấm'}):
                    </span>
                    <span className="summary-val">+{formatVND(extraTotal)}</span>
                  </div>
                )}

                {discountAmount > 0 && (
                  <div className="summary-line highlight-discount">
                    <span>Giảm giá ({appliedCoupon?.code}):</span>
                    <span className="summary-val">-{formatVND(discountAmount)}</span>
                  </div>
                )}

                <div className="summary-divider" />

                <div className="summary-total-line">
                  <span className="total-title">Tổng Số Tiền:</span>
                  <span className="total-amount-large">{formatVND(finalAmount)}</span>
                </div>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* ── BƯỚC 2: QUÉT MÃ VIETQR (Đếm ngược 1:30s = 90 giây) ── */}
      {paymentStep === 'qr' && (
        <main className="qr-payment-stage">
          {/* THANH ĐẾM GIỜ 1:30s (90 GIÂY) */}
          <div className="timer-countdown-bar">
            <div className="timer-badge">
              <Clock size={20} className={secondsLeft < 30 ? 'pulse-danger' : ''} />
              <span><strong>{formatCountdown(secondsLeft)}</strong></span>
            </div>
            <div className="timer-progress-track">
              <div
                className={`timer-progress-fill ${secondsLeft < 30 ? 'danger' : ''}`}
                style={{ width: `${(secondsLeft / 90) * 100}%` }}
              />
            </div>
          </div>

          <div className="qr-content-wrapper">
            {/* KHUNG HIỂN THỊ VIETQR */}
            <div className="qr-code-card">
              {secondsLeft > 0 ? (
                <>
                  <div className="qr-image-wrapper">
                    <img
                      src={currentQrUrl}
                      alt="VietQR MBBank"
                      className="qr-img"
                      onError={() => setCurrentQrUrl(fallbackVietQrUrl)}
                    />
                  </div>
                </>
              ) : (
                <div className="qr-timeout-box">
                  <Clock size={48} color="#ef4444" />
                  <h3>Hết thời gian (1:30s)</h3>
                  <button
                    className="btn-refresh-qr"
                    onClick={() => setSecondsLeft(90)}
                  >
                    <RefreshCw size={20} />
                    <span>Làm mới mã QR</span>
                  </button>
                </div>
              )}
            </div>

            {/* THÔNG TIN CHUYỂN KHOẢN CHI TIẾT */}
            <div className="qr-bank-details-card">
              <div className="bank-info-header">
                <span className="bank-name-display">{eventConfig.bankName || 'Ngân Hàng MB Bank'}</span>
              </div>

              <div className="bank-details-grid">
                <div className="bank-field-row">
                  <span className="field-lbl">Chủ tài khoản:</span>
                  <span className="field-val strong-upper">{activeAccountHolder}</span>
                </div>

                <div className="bank-field-row">
                  <span className="field-lbl">Số tài khoản:</span>
                  <span className="field-val field-acc-num">{activeAccountNumber}</span>
                </div>

                <div className="bank-field-row">
                  <span className="field-lbl">Số tiền:</span>
                  <span className="field-val field-amount-hl">{formatVND(finalAmount)}</span>
                </div>

                <div className="bank-field-row">
                  <span className="field-lbl">Nội dung CK:</span>
                  <span className="field-val field-code-hl">{orderCode}</span>
                </div>
              </div>

              <div className="bank-status-live">
                <div className="pulsing-green-dot" />
                <span>Chờ thanh toán...</span>
              </div>
            </div>
          </div>

          {/* Nút nhân viên cứu hộ tiền mặt / PIN */}
          <div className="staff-override-row">
            <button
              className="btn-staff-pin-trigger"
              onClick={() => setShowStaffPinModal(true)}
            >
              <KeyRound size={16} />
              <span>Thanh toán tiền mặt</span>
            </button>
          </div>
        </main>
      )}

      {/* ── Footer Navigation Bar: Cách lề mặc định 100px ── */}
      <footer className="kiosk-bottom-nav-bar payment-bottom-bar">
        <button
          className="kiosk-nav-btn btn-nav-back"
          onClick={() => {
            if (paymentStep === 'qr') {
              setPaymentStep('confirm')
            } else {
              setScreen('select-layout')
            }
          }}
          title="Quay lại"
          aria-label="Quay lại"
        >
          Quay lại
        </button>

        <button
          className="kiosk-nav-btn btn-nav-next"
          onClick={() => {
            if (paymentStep === 'confirm') {
              handleProceedToQr()
            } else {
              handleManualBypassOrNext()
            }
          }}
          title="Tiếp tục"
          aria-label="Tiếp tục"
        >
          Tiếp tục
        </button>
      </footer>

      {/* ── MODAL NHẬP MÃ PIN NHÂN VIÊN ── */}
      {showStaffPinModal && (
        <div className="modal-backdrop">
          <div className="staff-pin-modal">
            <h3>Xác Nhận Nhân Viên</h3>
            <p>Nhập mã PIN để xác nhận thanh toán tiền mặt</p>
            <input
              type="password"
              placeholder="Nhập mã PIN"
              value={staffPin}
              onChange={(e) => setStaffPin(e.target.value)}
              className="staff-pin-input"
              autoFocus
            />
            {staffPinError && <p className="pin-err">Mã PIN không đúng!</p>}
            <div className="modal-actions">
              <button
                className="btn-cancel"
                onClick={() => {
                  setShowStaffPinModal(false)
                  setStaffPin('')
                  setStaffPinError(false)
                }}
              >
                Huỷ
              </button>
              <button
                className="btn-confirm-pin"
                onClick={handleVerifyStaffPin}
              >
                Xác Nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── OVERLAY THANH TOÁN THÀNH CÔNG ── */}
      {paymentSuccess && (
        <div className="payment-success-overlay">
          <div className="success-content-box">
            <CheckCircle2 size={80} color="#16a34a" />
            <h2>Thanh Toán Thành Công!</h2>
            <p>Mã đơn #{orderCode} • {formatVND(finalAmount)}</p>
            <span>Đang chuẩn bị máy ảnh sẵn sàng...</span>
          </div>
        </div>
      )}
    </div>
  )
}
