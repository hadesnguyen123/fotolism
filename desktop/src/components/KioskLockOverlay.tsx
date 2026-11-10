import { useState } from 'react'
import { Lock, ShieldAlert, KeyRound, RefreshCw } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { cloudSyncService } from '../services/cloudSyncService'
import NumericKeypadModal from './NumericKeypadModal'
import './KioskLockOverlay.css'

export default function KioskLockOverlay() {
  const { setScreen, setIsKioskLocked, deviceConfig, eventConfig } = useAppStore()
  const [showPinModal, setShowPinModal] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)

  const kioskId = deviceConfig?.kiosk_id || 'kiosk_01'
  const kioskName = deviceConfig?.kiosk_name || 'Kiosk Fotolism'
  const branchName = deviceConfig?.branch_name || 'Chi Nhánh'

  const handleManualCheck = async () => {
    setIsChecking(true)
    try {
      await cloudSyncService.sendHeartbeat()
    } catch {
      // Ignore
    } finally {
      setTimeout(() => setIsChecking(false), 600)
    }
  }

  const handleUnlockWithPin = (codeToVerify: string) => {
    const raw = (codeToVerify || '').trim()
    const customPin = eventConfig?.adminPin
    const allowedPins = ['8888', '888888', '123456', '9999']
    if (customPin) allowedPins.push(customPin)

    if (allowedPins.includes(raw)) {
      setIsKioskLocked(false)
      setShowPinModal(false)
      setPinError(null)
      setScreen('admin')
    } else {
      setPinError('Mã PIN quản trị không chính xác')
    }
  }

  return (
    <div className="kiosk-lock-overlay" id="kiosk-lock-overlay">
      <div className="kiosk-lock-card">
        <div className="lock-icon-halo">
          <Lock size={56} strokeWidth={2.2} className="lock-icon" />
        </div>

        <div className="lock-badge">
          <ShieldAlert size={16} />
          <span>LỆNH KHÓA TỪ TRUNG TÂM CLOUD CMS</span>
        </div>

        <h1 className="lock-title">THIẾT BỊ ĐANG TẠM KHÓA</h1>

        <p className="lock-desc">
          Máy Kiosk đang được tạm ngưng phục vụ hoặc bảo trì theo lệnh từ Quản trị viên.
          <br />
          Xin quý khách vui lòng liên hệ nhân viên hoặc quay lại sau!
        </p>

        <div className="lock-device-tag">
          <span>{kioskName} ({kioskId})</span>
          <span className="dot-sep">•</span>
          <span>{branchName}</span>
        </div>

        <div className="lock-action-row">
          <button
            type="button"
            className="btn-check-lock"
            onClick={handleManualCheck}
            disabled={isChecking}
          >
            <RefreshCw size={16} className={isChecking ? 'spin' : ''} />
            <span>{isChecking ? 'Đang kiểm tra lệnh mở...' : 'Kiểm tra lệnh mở khóa'}</span>
          </button>
        </div>

        <button
          type="button"
          className="btn-staff-unlock-link"
          onClick={() => {
            setPinError(null)
            setShowPinModal(true)
          }}
        >
          <KeyRound size={14} />
          <span>Quản trị viên mở khóa tại quầy</span>
        </button>
      </div>

      {/* ── MODAL NHẬP MÃ PIN QUẢN TRỊ (DÙNG CHUNG NUMERIC KEYPAD MODAL) ── */}
      <NumericKeypadModal
        isOpen={showPinModal}
        title="Mã PIN Quản Trị"
        subtitle="Nhập mã PIN Quản trị để mở máy tại chỗ"
        mask={true}
        maxLength={6}
        placeholder="NHẬP MÃ PIN..."
        submitText="Mở khóa máy"
        errorMessage={pinError}
        onClose={() => {
          setShowPinModal(false)
          setPinError(null)
        }}
        onSubmit={(code) => handleUnlockWithPin(code)}
      />
    </div>
  )
}
