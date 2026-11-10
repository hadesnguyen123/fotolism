import { useState, useEffect } from 'react'
import { useAppStore, type CaptureMode } from '../store/appStore'
import { DEFAULT_ADMIN_PIN } from '../lib/constants'
import { Settings, Check } from 'lucide-react'
import NumericKeypadModal from '../components/NumericKeypadModal'
import { BRAND_LOGO_SRC } from '../lib/brandLogo'
import { cloudSyncService } from '../services/cloudSyncService'
import './IdleScreen.css'

export default function IdleScreen() {
  const { setScreen, startNewSession, clearSession, eventConfig, setCaptureMode, setCustomerInfo } = useAppStore()

  // Reset toàn bộ phiên cũ khi trở về màn hình chính
  useEffect(() => {
    clearSession()
  }, [clearSession])

  // Chế độ chụp đang được lựa chọn (mặc định là photobooth)
  const [selectedMode, setSelectedMode] = useState<CaptureMode>('photobooth')

  // Trạng thái Modal Nhập Mã Mở Khóa Máy
  const [showPinModal, setShowPinModal] = useState(false)
  const [pendingMode, setPendingMode] = useState<CaptureMode>('photobooth')
  const [isVerifying, setIsVerifying] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)
  const [welcomeGuest, setWelcomeGuest] = useState<string | null>(null)

  function handleSelectMode(mode: CaptureMode) {
    setSelectedMode(mode)
    handleOpenUnlockModal(mode)
  }

  function handleOpenUnlockModal(mode: CaptureMode = selectedMode) {
    setPendingMode(mode)
    setPinError(null)
    setWelcomeGuest(null)
    setShowPinModal(true)
  }

  // ── XÁC THỰC MÃ MỞ KHÓA MÁY (2 LỚP: MÃ PIN MÁY BACKUP + MÃ VÉ CMS) ──
  async function handleVerifyUnlock(codeToVerify: string) {
    const rawCode = (codeToVerify || '').trim()
    if (!rawCode) {
      setPinError('Vui lòng nhập mã lượt chụp hoặc mã PIN máy')
      return
    }

    setIsVerifying(true)
    setPinError(null)

    // ── ƯU TIÊN 0: MÃ TEST 1234 TỰ ĐỘNG VÀO NGAY LẬP TỨC ──
    if (rawCode === '1234') {
      setWelcomeGuest('Mã test 1234: Mở buồng chụp thành công!')
      setTimeout(() => {
        setShowPinModal(false)
        setCaptureMode(pendingMode)
        startNewSession()
        setCustomerInfo({
          customerName: 'Khách Test 1234',
          customerPhone: null,
          pinCode: '1234',
        })
        if (pendingMode === 'selfbooth') {
          setScreen('selfbooth-setup')
        } else {
          setScreen('select-layout')
        }
      }, 300)
      return
    }

    // ── ƯU TIÊN 1: BACKUP VỚI MÃ PIN CỦA MÁY (OFFLINE / KHẨN CẤP / NHÂN VIÊN) ──
    const machineAdminPin = (eventConfig.adminPin || DEFAULT_ADMIN_PIN || '8888').trim()
    if (rawCode === machineAdminPin || rawCode === '8888') {
      setWelcomeGuest('Đã mở khóa bằng mã PIN của máy!')
      setTimeout(() => {
        setShowPinModal(false)
        setCaptureMode(pendingMode)
        startNewSession()
        setCustomerInfo({
          customerName: 'Khách mở khóa (PIN máy)',
          customerPhone: null,
          pinCode: rawCode,
        })
        if (pendingMode === 'selfbooth') {
          setScreen('selfbooth-setup')
        } else {
          setScreen('select-layout')
        }
      }, 700)
      return
    }

    // ── ƯU TIÊN 2: XÁC THỰC MÃ VÉ ĐƯỢC CẤP TỪ CLOUD CMS ──
    try {
      const cmsUrl = cloudSyncService.getCmsUrl()
      const res = await fetch(`${cmsUrl}/api/kiosk/tickets?pin=${encodeURIComponent(rawCode)}`, {
        headers: { 'Content-Type': 'application/json' },
      })
      const json = await res.json()

      if (json.success && json.ticket) {
        const ticket = json.ticket

        if (ticket.status === 'COMPLETED' || ticket.status === 'CANCELLED') {
          setPinError('Mã vé này đã được sử dụng hoặc đã hoàn thành.')
          setIsVerifying(false)
          return
        }

        setWelcomeGuest(`Xin chào ${ticket.customer_name || 'Khách Hàng'}!`)

        // Tự động phân luồng theo gói dịch vụ đã đăng ký tại quầy CMS (nếu có)
        const effectiveMode: CaptureMode =
          ticket.service_type === 'selfbooth' ? 'selfbooth' :
          ticket.service_type === 'photobooth' ? 'photobooth' :
          pendingMode

        // Cập nhật trạng thái vé thành IN_BOOTH trên CMS để đánh dấu đang chụp
        fetch(`${cmsUrl}/api/kiosk/tickets`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pin_code: rawCode,
            status: 'IN_BOOTH',
            kiosk_id: effectiveMode === 'selfbooth' ? 'kiosk_02' : 'kiosk_01',
          }),
        })
          .then((r) => r.json())
          .then((d) => console.log('[IdleScreen] Cập nhật vé IN_BOOTH thành công:', d))
          .catch((err) => console.warn('[IdleScreen] Lỗi cập nhật vé IN_BOOTH:', err))

        setTimeout(() => {
          setShowPinModal(false)
          setCaptureMode(effectiveMode)
          startNewSession()
          setCustomerInfo({
            customerName: ticket.customer_name || 'Khách Hàng CMS',
            customerPhone: ticket.customer_phone || null,
            pinCode: rawCode,
          })

          if (effectiveMode === 'selfbooth') {
            setScreen('selfbooth-setup')
          } else {
            setScreen('select-layout')
          }
        }, 900)
      } else {
        setPinError(json.error || 'Mã không đúng hoặc chưa được cấp từ hệ thống thu ngân.')
        setIsVerifying(false)
      }
    } catch {
      // Khi mất kết nối tới CMS
      setPinError('Không thể kết nối CMS. Vui lòng nhập mã PIN máy của nhân viên để mở khóa.')
      setIsVerifying(false)
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
          <img
            src={eventConfig.eventLogo || BRAND_LOGO_SRC}
            alt="Fotolism"
            className="idle-logo-img"
          />
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

      {/* ── Footer Navigation Bar: 1 nút "Bắt đầu" ở góc dưới bên phải ── */}
      <footer className="kiosk-bottom-nav-bar idle-bottom-nav-bar">
        <div style={{ width: 1 }} />
        <button
          className="kiosk-nav-btn btn-nav-next"
          id="btn-idle-start"
          onClick={() => handleOpenUnlockModal(selectedMode)}
          title="Bắt đầu"
          aria-label="Bắt đầu"
        >
          Bắt đầu
        </button>
      </footer>

      {/* ── MODAL NHẬP MÃ SỐ MỞ KHÓA MÁY (DÙNG CHUNG NUMERIC KEYPAD MODAL) ── */}
      <NumericKeypadModal
        isOpen={showPinModal}
        title="Mã lượt chụp"
        placeholder="NHẬP MÃ SỐ..."
        submitText="Mở khóa buồng chụp"
        isLoading={isVerifying}
        loadingText="Đang kiểm tra mã..."
        errorMessage={pinError}
        successMessage={welcomeGuest}
        onClose={() => {
          if (!isVerifying) setShowPinModal(false)
        }}
        onSubmit={(code) => handleVerifyUnlock(code)}
      />
    </div>
  )
}
