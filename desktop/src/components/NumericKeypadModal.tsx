import React, { useState, useEffect, useCallback } from 'react'
import { X, KeyRound, RotateCcw, Delete, Loader2, Check } from 'lucide-react'
import './NumericKeypadModal.css'

export interface NumericKeypadModalProps {
  /** Trạng thái hiển thị modal */
  isOpen: boolean
  /** Tiêu đề modal (Mặc định: 'Mã lượt chụp') */
  title?: string
  /** Phụ đề mô tả dưới tiêu đề (tùy chọn) */
  subtitle?: string
  /** Icon tiêu đề tùy biến (Mặc định: KeyRound) */
  icon?: React.ReactNode
  /** Placeholder hiển thị khi chưa nhập số (Mặc định: 'NHẬP MÃ SỐ...') */
  placeholder?: string
  /** Nội dung nút xác nhận (Mặc định: 'Mở khóa buồng chụp') */
  submitText?: string
  /** Icon trên nút xác nhận (Mặc định: KeyRound) */
  submitIcon?: React.ReactNode
  /** Độ dài tối đa của mã số (Mặc định: 10) */
  maxLength?: number
  /** Có ẩn ký tự thành chấm tròn • hay không (cho mã PIN bảo mật) */
  mask?: boolean
  /** Trạng thái đang xác thực/kiểm tra */
  isLoading?: boolean
  /** Text hiển thị khi đang tải */
  loadingText?: string
  /** Thông báo lỗi hiển thị */
  errorMessage?: string | null
  /** Thông báo thành công hiển thị */
  successMessage?: string | null
  /** Giá trị ban đầu (tùy chọn) */
  initialValue?: string
  /** Callback khi bấm đóng modal */
  onClose: () => void
  /** Callback khi submit mã số */
  onSubmit: (code: string) => void
}

export default function NumericKeypadModal({
  isOpen,
  title = 'Mã lượt chụp',
  subtitle,
  icon,
  placeholder = 'NHẬP MÃ SỐ...',
  submitText = 'Mở khóa buồng chụp',
  submitIcon,
  maxLength = 10,
  mask = false,
  isLoading = false,
  loadingText = 'Đang kiểm tra...',
  errorMessage = null,
  successMessage = null,
  initialValue = '',
  onClose,
  onSubmit,
}: NumericKeypadModalProps) {
  const [value, setValue] = useState<string>(initialValue)

  // Reset giá trị khi modal mở lên
  useEffect(() => {
    if (isOpen) {
      setValue(initialValue)
    }
  }, [isOpen, initialValue])

  // Nhập 1 chữ số
  const handleDigit = useCallback(
    (digit: string) => {
      if (isLoading || successMessage) return
      setValue((prev) => (prev.length < maxLength ? prev + digit : prev))
    },
    [isLoading, successMessage, maxLength]
  )

  // Xóa 1 chữ số cuối
  const handleDelete = useCallback(() => {
    if (isLoading || successMessage) return
    setValue((prev) => prev.slice(0, -1))
  }, [isLoading, successMessage])

  // Xóa toàn bộ
  const handleClear = useCallback(() => {
    if (isLoading || successMessage) return
    setValue('')
  }, [isLoading, successMessage])

  // Submit giá trị
  const handleSubmit = useCallback(() => {
    if (isLoading || successMessage || !value.trim()) return
    onSubmit(value.trim())
  }, [isLoading, successMessage, value, onSubmit])

  // Lắng nghe bàn phím vật lý khi modal đang mở
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (!isLoading) onClose()
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSubmit()
        return
      }
      if (e.key === 'Backspace') {
        e.preventDefault()
        handleDelete()
        return
      }
      if (e.key === 'Delete' || e.key.toLowerCase() === 'c') {
        e.preventDefault()
        handleClear()
        return
      }
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault()
        handleDigit(e.key)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isLoading, onClose, handleSubmit, handleDelete, handleClear, handleDigit])

  if (!isOpen) return null

  // Chữ số hiển thị (rõ số hoặc ẩn dấu •)
  const displayText = mask && value ? '•'.repeat(value.length) : value

  return (
    <div
      className="numeric-modal-overlay"
      onClick={() => {
        if (!isLoading) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="numeric-modal-container animate-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="numeric-modal-header">
          <div className="numeric-modal-title-box">
            {icon !== undefined ? icon : <KeyRound size={26} className="numeric-title-icon" />}
            <div className="numeric-modal-title-group">
              <h3 className="numeric-modal-title">{title}</h3>
              {subtitle && <p className="numeric-modal-subtitle">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            className="numeric-modal-close-btn"
            onClick={() => {
              if (!isLoading) onClose()
            }}
            disabled={isLoading}
            title="Đóng"
            aria-label="Đóng"
          >
            <X size={20} />
          </button>
        </div>

        {/* Ô hiển thị mã số */}
        <div className="numeric-display-card">
          <div className={`numeric-display-text ${value ? 'has-code' : 'placeholder'}`}>
            {displayText || placeholder}
          </div>
          {value && !isLoading && !successMessage && (
            <button
              type="button"
              className="numeric-clear-btn"
              onClick={handleClear}
              title="Xóa hết"
              aria-label="Xóa hết"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Thông báo trạng thái: Đang kiểm tra / Lỗi / Thành công */}
        {isLoading && (
          <div className="numeric-status-banner loading">
            <Loader2 size={18} className="numeric-spin" />
            <span>{loadingText}</span>
          </div>
        )}
        {successMessage && (
          <div className="numeric-status-banner success animate-fade-in">
            <Check size={18} />
            <span>{successMessage}</span>
          </div>
        )}
        {errorMessage && !isLoading && !successMessage && (
          <div className="numeric-status-banner error animate-fade-in">
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Bàn phím số Numpad 3 x 4 cảm ứng */}
        <div className="numeric-numpad-grid">
          {/* Hàng 1: 1, 2, 3 */}
          <div className="numeric-numpad-row">
            {['1', '2', '3'].map((d) => (
              <button
                key={d}
                type="button"
                className="numeric-numpad-btn"
                onClick={() => handleDigit(d)}
                disabled={isLoading}
              >
                {d}
              </button>
            ))}
          </div>

          {/* Hàng 2: 4, 5, 6 */}
          <div className="numeric-numpad-row">
            {['4', '5', '6'].map((d) => (
              <button
                key={d}
                type="button"
                className="numeric-numpad-btn"
                onClick={() => handleDigit(d)}
                disabled={isLoading}
              >
                {d}
              </button>
            ))}
          </div>

          {/* Hàng 3: 7, 8, 9 */}
          <div className="numeric-numpad-row">
            {['7', '8', '9'].map((d) => (
              <button
                key={d}
                type="button"
                className="numeric-numpad-btn"
                onClick={() => handleDigit(d)}
                disabled={isLoading}
              >
                {d}
              </button>
            ))}
          </div>

          {/* Hàng 4: [↺ Xóa tất cả], [0], [⌫ Xóa 1 số] */}
          <div className="numeric-numpad-row">
            <button
              type="button"
              className="numeric-numpad-btn numeric-numpad-action"
              onClick={handleClear}
              disabled={isLoading || !value}
              title="Xóa toàn bộ"
              aria-label="Xóa toàn bộ"
            >
              <RotateCcw size={22} strokeWidth={2.2} />
            </button>

            <button
              type="button"
              className="numeric-numpad-btn"
              onClick={() => handleDigit('0')}
              disabled={isLoading}
            >
              0
            </button>

            <button
              type="button"
              className="numeric-numpad-btn numeric-numpad-backspace"
              onClick={handleDelete}
              disabled={isLoading || !value}
              title="Xóa 1 số"
              aria-label="Xóa 1 số"
            >
              <Delete size={24} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        {/* Nút hành động Submit */}
        <div className="numeric-modal-actions">
          <button
            type="button"
            className="numeric-submit-btn"
            disabled={value.trim().length === 0 || isLoading || Boolean(successMessage)}
            onClick={handleSubmit}
          >
            {isLoading ? (
              <>
                <Loader2 size={20} className="numeric-spin" />
                <span>Đang xử lý...</span>
              </>
            ) : (
              <>
                {submitIcon !== undefined ? (
                  submitIcon
                ) : (
                  <KeyRound size={20} />
                )}
                <span>{submitText}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

