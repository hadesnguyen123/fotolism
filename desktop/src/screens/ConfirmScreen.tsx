import { useState, useEffect } from 'react'
import { useAppStore, type DiscountCoupon } from '../store/appStore'
import {
  DEFAULT_PRICE_2X6,
  DEFAULT_PRICE_4X6,
  DEFAULT_EXTRA_COPY_PRICE_2X6,
  DEFAULT_EXTRA_COPY_PRICE_4X6,
} from '../lib/constants'
import { Printer, Tag, Camera } from 'lucide-react'
import PhotoboothHeader from '../components/PhotoboothHeader'
import './ConfirmScreen.css'

export default function ConfirmScreen() {
  const {
    setScreen,
    selectedFrameSize,
    selectedLayout,
    eventConfig,
    selectedCopies,
    setSelectedCopies,
    appliedCoupon: storeAppliedCoupon,
    setAppliedCoupon: setStoreAppliedCoupon,
  } = useAppStore()

  const is2x6 = selectedFrameSize === '2x6' || Boolean(selectedLayout?.strip)
  const minCopies = is2x6 ? 2 : 1
  const copyStep = is2x6 ? 2 : 1

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

  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<DiscountCoupon | null>(storeAppliedCoupon)
  const [couponError, setCouponError] = useState<string | null>(null)
  const [showKeyboard, setShowKeyboard] = useState<boolean>(false)

  useEffect(() => {
    const targetMin = is2x6 ? 2 : 1
    if (copies < targetMin || (is2x6 && copies % 2 !== 0)) {
      setCopies(targetMin)
      setSelectedCopies(targetMin)
    }
  }, [is2x6, setSelectedCopies])

  const basePrice = is2x6
    ? eventConfig.price2x6 || DEFAULT_PRICE_2X6
    : eventConfig.price4x6 || DEFAULT_PRICE_4X6
  const extraPricePerStep = is2x6
    ? eventConfig.extraCopyPrice2x6 || DEFAULT_EXTRA_COPY_PRICE_2X6
    : eventConfig.extraCopyPrice4x6 || DEFAULT_EXTRA_COPY_PRICE_4X6
  const extraBatches = Math.max(0, Math.floor((copies - minCopies) / copyStep))
  const extraTotal = extraBatches * extraPricePerStep

  const subTotal = basePrice + extraTotal

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

  function handleVirtualKeyPress(char: string) {
    setCouponError(null)
    if (couponInput.length >= 20) return
    setCouponInput((prev) => (prev + char).toUpperCase())
  }

  function handleVirtualBackspace() {
    setCouponError(null)
    setCouponInput((prev) => prev.slice(0, -1))
  }

  function handleVirtualClear() {
    setCouponError(null)
    setCouponInput('')
  }

  function handleApplyCoupon(customCode?: string) {
    setCouponError(null)
    const codeToTest = (customCode !== undefined ? customCode : couponInput).trim().toUpperCase()
    if (!codeToTest) {
      setCouponError('Vui lòng nhập mã ưu đãi')
      return
    }

    const availableCoupons = eventConfig.discountCoupons || []
    const found = availableCoupons.find((c) => c.code.toUpperCase() === codeToTest)
    if (found) {
      setAppliedCoupon(found)
      setStoreAppliedCoupon(found)
      setCouponError(null)
      setShowKeyboard(false)
    } else {
      setCouponError('Mã không hợp lệ hoặc đã hết hạn')
    }
  }

  useEffect(() => {
    if (!showKeyboard) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowKeyboard(false)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (couponInput.trim()) {
          handleApplyCoupon(couponInput)
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        handleVirtualBackspace()
      } else if (/^[a-zA-Z0-9]$/.test(e.key)) {
        e.preventDefault()
        handleVirtualKeyPress(e.key.toUpperCase())
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showKeyboard, couponInput, eventConfig.discountCoupons])

  function handleRemoveCoupon() {
    setAppliedCoupon(null)
    setStoreAppliedCoupon(null)
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

  function handleProceed() {
    setSelectedCopies(copies)
    setStoreAppliedCoupon(appliedCoupon)
    if (eventConfig.paymentRequiredForPhotobooth) {
      setScreen('payment')
    } else {
      setScreen('capture')
    }
  }

  return (
    <div className="confirm-screen-container" id="confirm-screen">
      {/* ── Fixed Top Header: fotolism + 4 Bước (2. Confirm active) ── */}
      <PhotoboothHeader currentStep={2} />

      {/* ── Nội dung Bước 2: Xem lại layout + Chọn số lượng in + Tổng thanh toán ── */}
      <main className="confirm-stage-main">
        <div className="confirm-cards-container">
          {/* THẺ TRÁI: Layout đã chọn (Preview dải ảnh + Thông tin bên cạnh) */}
          <div className="confirm-layout-card">
            {/* Cột 1 (50%): Hiển thị layout */}
            <div className="confirm-layout-preview-col">
              <div className={`confirm-frame-wrapper ${is2x6 ? 'ratio-2x6' : 'ratio-4x6'}`}>
              {/* Tấm Nghiêng Màu Nhạt Phía Sau */}
              <div className="confirm-sheet-back">
                <div
                  className="confirm-slots-grid"
                  style={{
                    gridTemplateColumns: `repeat(${selectedLayout.cols}, 1fr)`,
                    gridTemplateRows: `repeat(${selectedLayout.rows}, 1fr)`,
                  }}
                >
                  {Array.from({ length: selectedLayout.photosCount }).map((_, i) => (
                    <div key={i} className="confirm-slot-back" />
                  ))}
                </div>
                <div className="confirm-footer-back">
                  <span className="confirm-brand-text">fotolism</span>
                </div>
              </div>

              {/* Tấm Chính Phía Trước (Khung Ngoài In Thật Màu Nâu + Ô Trắng Rỗng) */}
              <div className="confirm-sheet-front">
                <div
                  className="confirm-slots-grid"
                  style={{
                    gridTemplateColumns: `repeat(${selectedLayout.cols}, 1fr)`,
                    gridTemplateRows: `repeat(${selectedLayout.rows}, 1fr)`,
                  }}
                >
                  {Array.from({ length: selectedLayout.photosCount }).map((_, i) => (
                    <div key={i} className="confirm-slot-front" />
                  ))}
                </div>
                <div className="confirm-footer-front">
                  <span className="confirm-brand-text">fotolism</span>
                </div>
              </div>
              </div>
            </div>

            {/* Cột 2 (50%): Thông tin chữ mô tả layout */}
            <div className="confirm-layout-meta">
              <span className="confirm-meta-sub">Layout đã chọn</span>
              <h2 className="confirm-meta-title">{is2x6 ? 'Khổ 2 × 6 inch' : 'Khổ 4 × 6 inch'}</h2>
              <div className="confirm-meta-feature">
                <Camera size={20} strokeWidth={2.2} />
                <span>{selectedLayout.photosCount} ảnh / tấm</span>
              </div>
              <div className="confirm-meta-feature">
                <Tag size={20} strokeWidth={2.2} />
                <span>{formatVND(basePrice)} / tấm</span>
              </div>
            </div>
          </div>

          {/* THẺ PHẢI: Số bản in & Mã giảm giá & Tổng thanh toán */}
          <div className="confirm-pricing-card">
            {/* Hàng 1: Số bản in */}
            <div className="confirm-pricing-row">
              <div className="confirm-row-label">
                <Printer size={22} strokeWidth={2.2} />
                <span>Số bản in</span>
              </div>
              <div className="confirm-stepper-box">
                <button
                  className="confirm-step-btn"
                  onClick={handleDecreaseCopies}
                  disabled={copies <= minCopies}
                  aria-label="Giảm số bản in"
                >
                  −
                </button>
                <div className="confirm-step-value">
                  <span className="step-num">{copies}</span>
                  <span className="step-unit">{is2x6 ? 'dải in' : 'tấm in'}</span>
                </div>
                <button
                  className="confirm-step-btn"
                  onClick={handleIncreaseCopies}
                  disabled={copies >= 12}
                  aria-label="Tăng số bản in"
                >
                  +
                </button>
              </div>
            </div>

            {/* Hàng 2: Mã ưu đãi / giảm giá */}
            <div className="confirm-coupon-row">
              {!appliedCoupon ? (
                <div className="confirm-coupon-input-group">
                  <div
                    className="confirm-coupon-input-box"
                    onClick={() => {
                      setCouponError(null)
                      setShowKeyboard(true)
                    }}
                    role="button"
                    tabIndex={0}
                    title="Chạm để mở bàn phím nhập mã"
                  >
                    <Tag size={18} strokeWidth={2.2} color="#8C756B" />
                    <input
                      type="text"
                      placeholder="Mã ưu đãi / giảm giá"
                      value={couponInput}
                      readOnly
                      onClick={() => {
                        setCouponError(null)
                        setShowKeyboard(true)
                      }}
                      className="confirm-coupon-input"
                    />
                  </div>
                  <button
                    type="button"
                    className="confirm-coupon-btn"
                    onClick={() => {
                      if (!couponInput.trim()) {
                        setCouponError(null)
                        setShowKeyboard(true)
                      } else {
                        handleApplyCoupon()
                      }
                    }}
                  >
                    Áp dụng
                  </button>
                </div>
              ) : (
                <div className="confirm-coupon-applied">
                  <span className="applied-code">{appliedCoupon.code}</span>
                  <span className="applied-discount">(-{formatVND(discountAmount)})</span>
                  <button
                    type="button"
                    className="applied-remove-btn"
                    onClick={handleRemoveCoupon}
                  >
                    ✕
                  </button>
                </div>
              )}
              {couponError && <p className="confirm-coupon-err">{couponError}</p>}
            </div>

            {/* Hàng 3: Tổng thanh toán */}
            <div className="confirm-total-row">
              <span className="confirm-total-label">Tổng thanh toán</span>
              <span className="confirm-total-amount">{formatVND(finalAmount)}</span>
            </div>
          </div>
        </div>
      </main>

      {/* ── Fixed Footer Navigation: Khóa cứng vị trí đồng bộ với Step 1 & Step 3 ── */}
      <footer className="kiosk-fixed-bottom-bar">
        <button
          className="kiosk-nav-btn btn-nav-back"
          onClick={() => setScreen('select-layout')}
          title="Quay lại"
          aria-label="Quay lại"
        >
          <span>Quay lại</span>
        </button>

        <div className="kiosk-footer-center" />

        <button
          className="kiosk-nav-btn btn-nav-next"
          onClick={handleProceed}
          title="Tiếp tục"
          aria-label="Tiếp tục"
        >
          <span>Tiếp tục</span>
        </button>
      </footer>

      {/* ── BÀN PHÍM CẢM ỨNG ẢO NHẬP MÃ (CHỮ SỐ VÀ CHỮ CÁI CHO KHÁCH) ── */}
      {showKeyboard && (
        <div className="confirm-keyboard-overlay animate-fade-in" onClick={() => setShowKeyboard(false)}>
          <div className="confirm-keyboard-modal animate-pop" onClick={(e) => e.stopPropagation()}>
            {/* Header Modal */}
            <div className="confirm-keyboard-header">
              <div className="confirm-keyboard-title-box">
                <Tag size={24} color="#502A1D" strokeWidth={2.4} />
                <h3 className="confirm-keyboard-title">Nhập mã ưu đãi</h3>
              </div>
              <button
                type="button"
                className="confirm-keyboard-close-btn"
                onClick={() => setShowKeyboard(false)}
                title="Đóng bàn phím"
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>

            {/* Ô hiển thị mã đang nhập */}
            <div className="confirm-keyboard-display-box">
              <span className={`confirm-keyboard-display-text ${couponInput ? 'has-text' : 'placeholder'}`}>
                {couponInput || 'Chạm các phím bên dưới để nhập mã'}
              </span>
              {couponInput && (
                <button
                  type="button"
                  className="confirm-keyboard-clear-btn"
                  onClick={handleVirtualClear}
                  title="Xóa trắng mã"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Thông báo lỗi nếu mã sai */}
            {couponError && (
              <div className="confirm-keyboard-err-msg animate-fade-in">
                {couponError}
              </div>
            )}

            {/* Bàn phím ảo gồm số và chữ cái */}
            <div className="confirm-virtual-keyboard">
              {/* Hàng 1: Số 1 2 3 4 5 6 7 8 9 0 */}
              <div className="vk-row vk-numbers-row">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((num) => (
                  <button
                    key={num}
                    type="button"
                    className="vk-key vk-number-key"
                    onClick={() => handleVirtualKeyPress(num)}
                  >
                    {num}
                  </button>
                ))}
              </div>

              {/* Hàng 2: Chữ Q W E R T Y U I O P */}
              <div className="vk-row">
                {['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'].map((char) => (
                  <button
                    key={char}
                    type="button"
                    className="vk-key vk-letter-key"
                    onClick={() => handleVirtualKeyPress(char)}
                  >
                    {char}
                  </button>
                ))}
              </div>

              {/* Hàng 3: Chữ A S D F G H J K L */}
              <div className="vk-row">
                {['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'].map((char) => (
                  <button
                    key={char}
                    type="button"
                    className="vk-key vk-letter-key"
                    onClick={() => handleVirtualKeyPress(char)}
                  >
                    {char}
                  </button>
                ))}
              </div>

              {/* Hàng 4: Chữ Z X C V B N M + Phím xóa lùi Backspace */}
              <div className="vk-row">
                {['Z', 'X', 'C', 'V', 'B', 'N', 'M'].map((char) => (
                  <button
                    key={char}
                    type="button"
                    className="vk-key vk-letter-key"
                    onClick={() => handleVirtualKeyPress(char)}
                  >
                    {char}
                  </button>
                ))}
                <button
                  type="button"
                  className="vk-key vk-backspace-key"
                  onClick={handleVirtualBackspace}
                  title="Xóa 1 ký tự"
                >
                  ⌫
                </button>
              </div>

              {/* Hàng 5: Hành động */}
              <div className="vk-row vk-bottom-actions">
                <button
                  type="button"
                  className="vk-action-btn btn-vk-cancel"
                  onClick={() => setShowKeyboard(false)}
                >
                  Đóng
                </button>
                <button
                  type="button"
                  className="vk-action-btn btn-vk-clear"
                  onClick={handleVirtualClear}
                  disabled={!couponInput}
                >
                  Xóa hết
                </button>
                <button
                  type="button"
                  className="vk-action-btn btn-vk-apply"
                  disabled={!couponInput.trim()}
                  onClick={() => handleApplyCoupon(couponInput)}
                >
                  Áp dụng mã
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
