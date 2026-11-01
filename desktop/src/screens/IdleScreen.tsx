import { useState, useEffect } from 'react'
import { useAppStore, type CaptureMode } from '../store/appStore'
import {
  BRAND_NAME,
} from '../lib/constants'
import { Settings, ArrowRight, Delete, X, Sparkles, UserCheck, Check } from 'lucide-react'
import './IdleScreen.css'

export default function IdleScreen() {
  const { setScreen, startNewSession, clearSession, eventConfig, setCaptureMode, setCustomerInfo } = useAppStore()

  // Luôn đảm bảo khi quay về màn hình chính, toàn bộ trạng thái phiên chụp cũ được reset về ban đầu
  useEffect(() => {
    clearSession()
  }, [clearSession])

  // Chế độ chụp đang được lựa chọn (mặc định là photobooth)
  const [selectedMode, setSelectedMode] = useState<CaptureMode>('photobooth')

  // Trạng thái Modal Nhập Mã PIN
  const [showPinModal, setShowPinModal] = useState(false)
  const [pendingMode, setPendingMode] = useState<CaptureMode>('photobooth')
  const [pinDigits, setPinDigits] = useState<string>('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)
  const [welcomeGuest, setWelcomeGuest] = useState<string | null>(null)

  function handleSelectMode(mode: CaptureMode) {
    if (selectedMode === mode) {
      // Chạm lại vào thẻ đang chọn -> Bắt đầu ngay
      handleProceed(mode)
    } else {
      setSelectedMode(mode)
    }
  }

  function handleProceed(mode: CaptureMode = selectedMode) {
    setPendingMode(mode)
    setPinDigits('')
    setPinError(null)
    setWelcomeGuest(null)
    if (mode === 'selfbooth') {
      handleStartSelfboothNow()
    } else {
      // Bấm Photobooth vào thẳng bước chọn bố cục kèm giá
      setCaptureMode('photobooth')
      startNewSession()
      setCustomerInfo({
        customerName: 'Khách Photobooth',
        customerPhone: null,
        pinCode: null,
      })
      setScreen('select-layout')
    }
  }

  // Khách bấm Bắt đầu chụp Selfbooth -> chuyển sang bước chọn màu & thời gian
  function handleStartSelfboothNow() {
    setCaptureMode('selfbooth')
    startNewSession()
    setCustomerInfo({
      customerName: 'Khách Selfbooth',
      customerPhone: null,
      pinCode: null,
    })
    setScreen('selfbooth-setup')
  }

  // Khách vãng lai bấm "Chụp ngay không cần PIN"
  function handleContinueAsWalkIn() {
    setShowPinModal(false)
    setCaptureMode(pendingMode)
    startNewSession()
    setCustomerInfo({
      customerName: 'Khách Vãng Lai',
      customerPhone: null,
      pinCode: null,
    })

    if (pendingMode === 'selfbooth') {
      setScreen('selfbooth-setup')
    } else {
      setScreen('select-layout')
    }
  }

  // Bấm số trên bàn phím ảo
  function handleKeyPress(digit: string) {
    if (pinDigits.length >= 4 || isVerifying || welcomeGuest) return
    const newDigits = pinDigits + digit
    setPinDigits(newDigits)
    setPinError(null)

    if (newDigits.length === 4) {
      verifyPin(newDigits)
    }
  }

  function handleDelete() {
    if (pinDigits.length > 0 && !isVerifying && !welcomeGuest) {
      setPinDigits(pinDigits.slice(0, -1))
      setPinError(null)
    }
  }

  // Xác thực mã PIN với Cloud CMS
  async function verifyPin(pin: string) {
    setIsVerifying(true)
    setPinError(null)

    try {
      const res = await fetch(`http://localhost:3000/api/kiosk/tickets?pin=${pin}`, {
        headers: { 'Content-Type': 'application/json' },
      })
      const json = await res.json()

      if (json.success && json.ticket) {
        const ticket = json.ticket
        setWelcomeGuest(ticket.customer_name)

        // Cập nhật trạng thái vé thành IN_BOOTH
        fetch('http://localhost:3000/api/kiosk/tickets', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pin_code: pin,
            status: 'IN_BOOTH',
            kiosk_id: 'kiosk_01',
          }),
        }).catch(() => {})

        setTimeout(() => {
          setShowPinModal(false)
          setCaptureMode(pendingMode)
          startNewSession()
          setCustomerInfo({
            customerName: ticket.customer_name,
            customerPhone: ticket.customer_phone,
            pinCode: pin,
          })

          if (pendingMode === 'selfbooth') {
            setScreen('capture')
          } else {
            setScreen('select-size')
          }
        }, 1200)
      } else {
        setPinError(json.error || 'Mã PIN không đúng hoặc đã chụp xong')
        setIsVerifying(false)
      }
    } catch {
      // Khi offline / không kết nối được CMS: cho phép vào luôn
      setWelcomeGuest('Khách Hàng fotolism')
      setTimeout(() => {
        handleContinueAsWalkIn()
      }, 1000)
    }
  }

  return (
    <div className="idle-screen" id="idle-screen">
      {/* Top Header */}
      <header className="idle-header">
        <div className="idle-header-spacer" />
        <button
          className="idle-admin-btn"
          id="idle-admin-btn"
          onClick={(e) => {
            e.stopPropagation()
            setScreen('admin')
          }}
          title="Cài đặt hệ thống"
          aria-label="Cài đặt hệ thống"
        >
          <Settings size={24} strokeWidth={1.8} />
        </button>
      </header>

      {/* Main Focus: Editorial Brand + Dual Experience Selection */}
      <main className="idle-main">
        {/* Brand Presentation */}
        <div className="idle-brand">
          {eventConfig.eventLogo ? (
            <img src={eventConfig.eventLogo} alt="Event Logo" className="idle-logo-img" />
          ) : (
            <h1 className="idle-brand-title">{BRAND_NAME}</h1>
          )}
        </div>

        {/* ── Selection Cards ── */}
        <div className="idle-modes" role="group" aria-label="Lựa chọn chế độ chụp">
          {/* Card 1: PHOTOBOOTH */}
          <div
            className={`idle-mode-card card-photobooth ${selectedMode === 'photobooth' ? 'selected' : ''}`}
            id="mode-photobooth-card"
            role="button"
            tabIndex={0}
            aria-label="Chọn Photobooth"
            aria-pressed={selectedMode === 'photobooth'}
            onClick={() => handleSelectMode('photobooth')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleSelectMode('photobooth')
              }
            }}
          >
            {selectedMode === 'photobooth' && (
              <div className="mode-check-badge">
                <Check size={20} strokeWidth={3.5} />
              </div>
            )}

            <div className="mode-card-visual" aria-hidden="true">
              <svg width="130" height="130" viewBox="0 0 130 130" fill="none" className="visual-svg">
                <g transform="rotate(-6 52 65)">
                  <rect x="24" y="10" width="48" height="110" rx="8" fill="#F4ECE4" stroke="#D8C7B8" strokeWidth="1.5" />
                  <rect x="29" y="16" width="38" height="26" rx="4" fill="#E8DDD3" />
                  <rect x="29" y="46" width="38" height="26" rx="4" fill="#E8DDD3" />
                  <rect x="29" y="76" width="38" height="26" rx="4" fill="#E8DDD3" />
                  <circle cx="48" cy="111" r="2.5" fill="#C8B2A4" />
                </g>
                <g transform="rotate(4 75 65)">
                  <rect x="52" y="10" width="50" height="110" rx="8" fill="#FFFFFF" stroke="#502A1D" strokeWidth="2" />
                  <rect x="57" y="16" width="40" height="26" rx="4" fill="#F7F2EB" />
                  <rect x="57" y="46" width="40" height="26" rx="4" fill="#FAF6F1" />
                  <rect x="57" y="76" width="40" height="26" rx="4" fill="#F7F2EB" />
                  <circle cx="77" cy="56" r="4.5" fill="#D8C7B8" />
                  <path d="M70 67 C70 62 84 62 84 67" fill="#D8C7B8" />
                  <rect x="67" y="109" width="20" height="3" rx="1.5" fill="#502A1D" opacity="0.6" />
                </g>
              </svg>
            </div>

            <div className="mode-card-info">
              <h2 className="mode-card-title">PHOTOBOOTH</h2>
            </div>
          </div>

          {/* Card 2: SELFBOOTH */}
          <div
            className={`idle-mode-card card-selfbooth ${selectedMode === 'selfbooth' ? 'selected' : ''}`}
            id="mode-selfbooth-card"
            role="button"
            tabIndex={0}
            aria-label="Chọn Selfbooth"
            aria-pressed={selectedMode === 'selfbooth'}
            onClick={() => handleSelectMode('selfbooth')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleSelectMode('selfbooth')
              }
            }}
          >
            {selectedMode === 'selfbooth' && (
              <div className="mode-check-badge">
                <Check size={20} strokeWidth={3.5} />
              </div>
            )}

            <div className="mode-card-visual" aria-hidden="true">
              <svg width="130" height="130" viewBox="0 0 130 130" fill="none" className="visual-svg">
                <circle cx="58" cy="65" r="46" stroke="#C8B2A4" strokeWidth="2" strokeDasharray="3 4" opacity="0.7" />
                <circle cx="58" cy="65" r="38" fill="#FBF8F4" stroke="#502A1D" strokeWidth="2" />
                <circle cx="58" cy="65" r="26" fill="#F0E6DC" stroke="#78452F" strokeWidth="1.5" />
                <circle cx="58" cy="65" r="14" fill="#502A1D" />
                <circle cx="54" cy="61" r="4" fill="#FFFFFF" opacity="0.75" />
                <g transform="translate(14, 0)">
                  <rect x="76" y="38" width="28" height="54" rx="14" fill="#502A1D" stroke="#FAF6F1" strokeWidth="2" />
                  <circle cx="90" cy="53" r="6" fill="#FFFFFF" />
                  <path d="M107 46 A14 14 0 0 1 107 68" stroke="#A66A43" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M112 40 A22 22 0 0 1 112 74" stroke="#A66A43" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
                </g>
              </svg>
            </div>

            <div className="mode-card-info">
              <h2 className="mode-card-title">SELFBOOTH</h2>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer Navigation Bar: Chỉ duy nhất 1 nút "Bắt đầu" ở góc dưới bên phải, cách lề 100px ── */}
      <footer className="kiosk-bottom-nav-bar idle-bottom-nav-bar">
        <div style={{ width: 1 }} />
        <button
          className="kiosk-nav-btn btn-nav-next"
          id="btn-idle-start"
          onClick={() => handleProceed(selectedMode)}
          title="Bắt đầu"
          aria-label="Bắt đầu"
        >
          Bắt đầu
        </button>
      </footer>

      {/* ── MODAL NHẬP MÃ PIN 4 SỐ (Tạm thời disable) ── */}
      {false && showPinModal && (
        <div className="pin-modal-overlay">
          <div className="pin-modal-container">
            {/* Header Modal */}
            <div className="pin-modal-header">
              <div className="pin-modal-title-box">
                <Sparkles size={20} className="text-[#502A1D]" />
                <h3 className="pin-modal-title">NHẬP MÃ PIN ĐẶT CHỖ</h3>
              </div>
              <button
                className="pin-modal-close-btn"
                onClick={() => setShowPinModal(false)}
                title="Đóng"
              >
                <X size={20} />
              </button>
            </div>

            <p className="pin-modal-desc">
              Nhập mã PIN 4 chữ số thu ngân đã cấp khi bạn đăng ký tại quầy
            </p>

            {/* PIN Display Boxes */}
            <div className="pin-digits-display">
              {[0, 1, 2, 3].map((idx) => {
                const char = pinDigits[idx]
                return (
                  <div
                    key={idx}
                    className={`pin-digit-box ${char ? 'filled' : ''} ${
                      pinDigits.length === idx ? 'active' : ''
                    }`}
                  >
                    {char || ''}
                  </div>
                )
              })}
            </div>

            {/* Thông báo trạng thái */}
            {isVerifying && (
              <p className="pin-status-text verifying">Đang xác thực mã PIN...</p>
            )}
            {welcomeGuest && (
              <p className="pin-status-text welcome">
                <UserCheck size={16} /> Xin chào bạn {welcomeGuest}!
              </p>
            )}
            {pinError && (
              <p className="pin-status-text error">{pinError}</p>
            )}

            {/* Virtual Numpad */}
            <div className="pin-numpad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  className="pin-numpad-btn"
                  onClick={() => handleKeyPress(digit)}
                >
                  {digit}
                </button>
              ))}
              <button
                className="pin-numpad-btn pin-numpad-action"
                onClick={handleDelete}
                title="Xóa"
              >
                <Delete size={22} />
              </button>
              <button
                className="pin-numpad-btn"
                onClick={() => handleKeyPress('0')}
              >
                0
              </button>
              <button
                className="pin-numpad-btn pin-numpad-action-enter"
                onClick={() => {
                  if (pinDigits.length === 4) verifyPin(pinDigits)
                }}
              >
                <ArrowRight size={22} />
              </button>
            </div>

            {/* Nút Khách Vãng Lai */}
            <div className="pin-modal-footer">
              <button
                className="pin-walkin-btn"
                onClick={handleContinueAsWalkIn}
              >
                Khách Vãng Lai / Chưa Có Mã PIN
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
