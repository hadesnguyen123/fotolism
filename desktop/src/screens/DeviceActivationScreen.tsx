import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import { cloudSyncService } from '../services/cloudSyncService'
import { KeyRound, ShieldCheck, Server, AlertCircle, RefreshCw, CheckCircle2, ArrowRight } from 'lucide-react'
import './DeviceActivationScreen.css'

export default function DeviceActivationScreen() {
  const { setScreen, setDeviceConfig } = useAppStore()

  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [activeIdx, setActiveIdx] = useState<number>(0)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successInfo, setSuccessInfo] = useState<{
    kioskName: string
    branchName: string
  } | null>(null)

  const [cmsUrl, setCmsUrl] = useState<string>(() => cloudSyncService.getCmsUrl())
  const [showServerSetting, setShowServerSetting] = useState<boolean>(false)

  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Auto-focus ô nhập đầu tiên khi tải màn hình
  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  const fullCode = digits.join('')

  // Xử lý nhập số từ bàn phím vật lý
  const handleDigitChange = (index: number, val: string) => {
    setErrorMessage(null)
    const cleaned = val.replace(/\D/g, '')

    if (!cleaned) {
      const next = [...digits]
      next[index] = ''
      setDigits(next)
      return
    }

    // Nếu paste chuỗi nhiều ký tự
    if (cleaned.length > 1) {
      const next = [...digits]
      for (let i = 0; i < 6; i++) {
        next[i] = cleaned[i] || ''
      }
      setDigits(next)
      const targetIdx = Math.min(cleaned.length, 5)
      setActiveIdx(targetIdx)
      inputRefs.current[targetIdx]?.focus()
      return
    }

    const next = [...digits]
    next[index] = cleaned[cleaned.length - 1]
    setDigits(next)

    // Tự động nhảy sang ô tiếp theo
    if (index < 5) {
      setActiveIdx(index + 1)
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      setActiveIdx(index - 1)
      inputRefs.current[index - 1]?.focus()
    } else if (e.key === 'Enter' && fullCode.length === 6) {
      handleActivate()
    }
  }

  // Xử lý nhập số từ Bàn Phím Số Cảm Ứng (Touch Numpad trên màn hình)
  const handleNumpadPress = (char: string) => {
    setErrorMessage(null)
    if (char === 'clear') {
      setDigits(['', '', '', '', '', ''])
      setActiveIdx(0)
      inputRefs.current[0]?.focus()
      return
    }

    if (char === 'backspace') {
      const next = [...digits]
      if (digits[activeIdx]) {
        next[activeIdx] = ''
        setDigits(next)
      } else if (activeIdx > 0) {
        next[activeIdx - 1] = ''
        setDigits(next)
        setActiveIdx(activeIdx - 1)
        inputRefs.current[activeIdx - 1]?.focus()
      }
      return
    }

    // Nhập số 0-9
    const emptyIdx = digits.findIndex((d) => d === '')
    const targetIdx = emptyIdx === -1 ? 5 : emptyIdx
    const next = [...digits]
    next[targetIdx] = char
    setDigits(next)

    if (targetIdx < 5) {
      setActiveIdx(targetIdx + 1)
      inputRefs.current[targetIdx + 1]?.focus()
    }
  }

  // Gửi mã kích hoạt lên Cloud CMS
  const handleActivate = async (codeToUse?: string) => {
    const code = (codeToUse || fullCode).trim()
    if (code.length < 6) {
      setErrorMessage('Vui lòng nhập đủ 6 chữ số mã kích hoạt')
      return
    }

    setIsLoading(true)
    setErrorMessage(null)

    try {
      const result = await cloudSyncService.activateDevice(code, cmsUrl)
      if (result.success && result.data) {
        setSuccessInfo({
          kioskName: result.data.kiosk_name || result.data.kiosk_id,
          branchName: result.data.branch_name || 'Chi Nhánh fotolism',
        })
        setDeviceConfig(result.data)

        // Sau 1.4s chuyển vào màn hình chờ chính
        setTimeout(() => {
          setScreen('idle')
        }, 1400)
      } else {
        setErrorMessage(result.error || 'Mã kích hoạt không đúng hoặc đã hết hạn')
        setIsLoading(false)
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể kết nối đến máy chủ Cloud CMS')
      setIsLoading(false)
    }
  }

  // Nạp nhanh mã mẫu kiểm thử (Kiosk 01 hoặc Kiosk 02)
  const handleQuickDemoCode = (sampleCode: string) => {
    setDigits(sampleCode.split(''))
    setActiveIdx(5)
    handleActivate(sampleCode)
  }

  return (
    <div className="activation-screen-container" id="device-activation-screen">
      <div className="activation-ambient-glow" />

      <main className="activation-card-wrapper animate-fade-in">
        {/* Brand Header */}
        <header className="activation-brand-header">
          <div className="activation-badge">
            <span className="badge-dot" />
            <span>THIẾT BỊ MỚI — CHỜ KÍCH HOẠT</span>
          </div>

          <h1 className="activation-title">KÍCH HOẠT KIOSK</h1>
        </header>

        {successInfo ? (
          /* Trạng thái Kích Hoạt Thành Công */
          <div className="activation-success-state animate-pop">
            <div className="success-icon-wrap">
              <CheckCircle2 size={54} strokeWidth={2.5} className="success-check-icon" />
            </div>
            <h2 className="success-headline">KÍCH HOẠT THÀNH CÔNG!</h2>
            <div className="success-kiosk-badge">
              <span className="success-kiosk-name">{successInfo.kioskName}</span>
              <span className="success-branch-name">{successInfo.branchName}</span>
            </div>
            <p className="success-redirect-note">
              Đang khởi tạo phiên làm việc và chuyển đến màn hình chụp...
            </p>
          </div>
        ) : (
          /* Form Nhập Mã Kích Hoạt 6 Số */
          <div className="activation-form-stage">
            {/* 6 Ô Nhập Số (PIN Boxes) */}
            <div className="pin-input-boxes">
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    inputRefs.current[index] = el
                  }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  disabled={isLoading}
                  onFocus={() => setActiveIdx(index)}
                  onChange={(e) => handleDigitChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  className={`pin-digit-box ${activeIdx === index ? 'focused' : ''} ${digit ? 'filled' : ''}`}
                  aria-label={`Số thứ ${index + 1}`}
                />
              ))}
            </div>

            {/* Thông báo lỗi nếu có */}
            {errorMessage && (
              <div className="activation-error-banner animate-shake">
                <AlertCircle size={18} className="error-icon" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Bàn Phím Số Cảm Ứng (Touch Numpad cho màn Kiosk) */}
            <div className="touch-numpad-grid">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  type="button"
                  className="numpad-key"
                  disabled={isLoading}
                  onClick={() => handleNumpadPress(num)}
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                className="numpad-key action-key"
                disabled={isLoading}
                onClick={() => handleNumpadPress('clear')}
                title="Xóa tất cả"
              >
                C
              </button>
              <button
                type="button"
                className="numpad-key"
                disabled={isLoading}
                onClick={() => handleNumpadPress('0')}
              >
                0
              </button>
              <button
                type="button"
                className="numpad-key action-key"
                disabled={isLoading}
                onClick={() => handleNumpadPress('backspace')}
                title="Xóa lùi"
              >
                ⌫
              </button>
            </div>

            {/* Nút Kích Hoạt */}
            <button
              type="button"
              className={`activation-submit-btn ${isLoading ? 'loading' : ''}`}
              disabled={isLoading || fullCode.length < 6}
              onClick={() => handleActivate()}
            >
              {isLoading ? (
                <>
                  <RefreshCw size={20} className="spin-icon" />
                  <span>ĐANG XÁC THỰC VỚI CLOUD CMS...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={20} />
                  <span>XÁC NHẬN KÍCH HOẠT THIẾT BỊ</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>

            {/* Nút Bỏ Qua Mã Kích Hoạt (Dành cho Dev & Test theo yêu cầu) */}
            <div className="activation-bypass-action" style={{ marginTop: '12px', textAlign: 'center' }}>
              <button
                type="button"
                className="bypass-activation-btn"
                style={{
                  background: 'rgba(255, 107, 107, 0.12)',
                  border: '1px solid rgba(255, 107, 107, 0.4)',
                  color: '#ff6b6b',
                  borderRadius: '12px',
                  padding: '10px 20px',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease',
                }}
                disabled={isLoading}
                onClick={() => handleQuickDemoCode('888888')}
              >
                <span>Bỏ qua kích hoạt</span>
              </button>
            </div>

            {/* Gợi ý test nhanh */}
            <div className="quick-demo-chips">
              <span className="chips-label">Mã mẫu:</span>
              <div className="chips-row">
                <button
                  type="button"
                  className="demo-chip-btn default-dev-chip"
                  style={{ borderColor: '#ff6b6b', color: '#ff6b6b', fontWeight: 700 }}
                  onClick={() => handleQuickDemoCode('888888')}
                >
                  <KeyRound size={13} />
                  <span>888888</span>
                </button>
                <button
                  type="button"
                  className="demo-chip-btn"
                  onClick={() => handleQuickDemoCode('849201')}
                >
                  <KeyRound size={13} />
                  <span>849201</span>
                </button>
                <button
                  type="button"
                  className="demo-chip-btn"
                  onClick={() => handleQuickDemoCode('123456')}
                >
                  <KeyRound size={13} />
                  <span>123456</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer cấu hình địa chỉ Server CMS */}
        <footer className="activation-card-footer">
          <button
            type="button"
            className="server-setting-toggle"
            onClick={() => setShowServerSetting((prev) => !prev)}
          >
            <Server size={14} />
            <span>Địa chỉ Cloud CMS: <b>{cmsUrl}</b></span>
          </button>

          {showServerSetting && (
            <div className="server-config-popover animate-pop">
              <label className="server-label">Nhập địa chỉ máy chủ Cloud CMS:</label>
              <div className="server-input-row">
                <input
                  type="text"
                  value={cmsUrl}
                  onChange={(e) => setCmsUrl(e.target.value)}
                  placeholder="http://localhost:3000"
                  className="server-input"
                />
                <button
                  type="button"
                  className="server-save-btn"
                  onClick={() => {
                    cloudSyncService.setCmsUrl(cmsUrl)
                    setShowServerSetting(false)
                  }}
                >
                  Lưu
                </button>
              </div>
            </div>
          )}
        </footer>
      </main>
    </div>
  )
}
