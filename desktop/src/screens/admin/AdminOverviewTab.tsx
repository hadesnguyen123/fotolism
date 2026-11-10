import React from 'react'
import { Camera, Printer, Wifi, Cloud, CheckCircle2, Zap } from 'lucide-react'
import { type CloudSyncStatus } from '../../services/cloudSyncService'
import { useAppStore } from '../../store/appStore'

interface AdminOverviewTabProps {
  daemonStatus: { running: boolean; url: string; state?: string } | null
  printersList: Array<{ name: string; isDefault: boolean }>
  syncStatus: CloudSyncStatus
  isNetworkOnline: boolean
  isCmsOnline: boolean
  kioskStatus?: 'READY' | 'MAINTENANCE' | 'IN_SESSION'
  isDiagnosticRunning: boolean
  runDiagnostic: () => void
  diagnosticFeedback?: string | null
}

export const AdminOverviewTab: React.FC<AdminOverviewTabProps> = ({
  daemonStatus,
  printersList,
  syncStatus,
  isNetworkOnline,
  isCmsOnline,
  isDiagnosticRunning,
  runDiagnostic,
  diagnosticFeedback,
}) => {
  const { eventConfig, setEventConfig, isKioskLocked } = useAppStore()

  const isCameraOnline = Boolean(daemonStatus?.running)
  const isPrinterOnline = printersList.length > 0
  const defaultPrinterName = printersList[0]?.name || 'Chưa phát hiện máy in'

  return (
    <div className="tab-pane-content">
      {/* ── Tiêu đề & Chế độ hoạt động (Kiểm soát từ Cloud CMS) ── */}
      <div className="pane-header-row">
        <div>
          <h2 className="tab-pane-title">Bảng Điều Khiển Tổng Quan</h2>
          <p className="tab-pane-desc">
            Giám sát sức khỏe phần cứng, kết nối mạng và hàng đợi đồng bộ
          </p>
        </div>

        <div className="status-mode-selector-wrap">
          <label className="mode-selector-label">Chế độ hoạt động:</label>
          <div className={`mode-display-pill ${isKioskLocked ? 'mode-locked' : 'mode-active'}`}>
            <span className={isKioskLocked ? 'badge-dot-amber' : 'badge-dot-green'} />
            <span className="mode-status-text">
              {isKioskLocked ? 'Tạm ngưng / Tắt máy' : 'Bật máy • Sẵn sàng đón khách'}
            </span>
            <span className="mode-source-badge">Lệnh CMS</span>
          </div>
        </div>
      </div>

      {/* ── 4 Thẻ Trạng Thái Phần Cứng & Kết Nối (Icon & Chữ lớn Touch-First) ── */}
      <div className="status-cards-4col-grid">
        {/* Card 1: Máy ảnh */}
        <div className="status-device-card">
          <div className="card-top-indicator">
            <div className="device-avatar-box">
              <Camera size={26} strokeWidth={2.2} />
            </div>
            <span
              className={`pill-badge ${isCameraOnline ? 'pill-green' : 'pill-amber'}`}
            >
              <span
                className={
                  isCameraOnline ? 'badge-dot-green' : 'badge-dot-amber'
                }
              />
              {isCameraOnline ? 'LIVE' : 'CHƯA KẾT NỐI'}
            </span>
          </div>
          <div className="card-body-info">
            <span className="card-device-label">MÁY ẢNH CHÍNH</span>
            <h3 className="card-device-name">Canon EOS R100</h3>
            <span className="card-device-sub">
              {isCameraOnline
                ? 'Native EDSDK 64-bit • Cáp USB 3.0'
                : 'Cần cắm cáp USB hoặc bật nguồn máy ảnh'}
            </span>
          </div>
        </div>

        {/* Card 2: Máy in */}
        <div className="status-device-card">
          <div className="card-top-indicator">
            <div className="device-avatar-box">
              <Printer size={26} strokeWidth={2.2} />
            </div>
            <span
              className={`pill-badge ${isPrinterOnline ? 'pill-green' : 'pill-amber'}`}
            >
              <span
                className={
                  isPrinterOnline ? 'badge-dot-green' : 'badge-dot-amber'
                }
              />
              {isPrinterOnline ? 'SẴN SÀNG' : 'CHƯA KẾT NỐI'}
            </span>
          </div>
          <div className="card-body-info">
            <span className="card-device-label">MÁY IN NHIỆT DYE-SUB</span>
            <h3 className="card-device-name">
              {defaultPrinterName.includes('RX1')
                ? 'DNP DS-RX1HS'
                : defaultPrinterName}
            </h3>
            <span className="card-device-sub">
              {isPrinterOnline
                ? 'Cuộn giấy: ~640 dải ảnh • Khổ 2×6 & 4×6'
                : 'Chưa nhận diện driver máy in trên Windows'}
            </span>
          </div>
        </div>

        {/* Card 3: Đường truyền mạng (Xác minh WiFi / LAN thực tế) */}
        <div className="status-device-card">
          <div className="card-top-indicator">
            <div className="device-avatar-box">
              <Wifi size={26} strokeWidth={2.2} />
            </div>
            <span
              className={`pill-badge ${isNetworkOnline ? 'pill-green' : 'pill-amber'}`}
            >
              <span
                className={
                  isNetworkOnline ? 'badge-dot-green' : 'badge-dot-amber'
                }
              />
              {isNetworkOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
          <div className="card-body-info">
            <span className="card-device-label">ĐƯỜNG TRUYỀN MẠNG</span>
            <h3 className="card-device-name">
              {isNetworkOnline ? 'Internet Ổn Định' : 'Mất Mạng (Offline)'}
            </h3>
            <span className="card-device-sub">
              {isNetworkOnline
                ? 'WiFi / LAN Đã Kết Nối'
                : 'Chế độ Offline: Vẫn chụp, lưu & in ảnh bình thường'}
            </span>
          </div>
        </div>

        {/* Card 4: Kết nối Cloud CMS */}
        <div className="status-device-card">
          <div className="card-top-indicator">
            <div className="device-avatar-box">
              <Cloud size={26} strokeWidth={2.2} />
            </div>
            <span
              className={`pill-badge ${isCmsOnline ? 'pill-green' : 'pill-amber'}`}
            >
              <span
                className={
                  isCmsOnline ? 'badge-dot-green' : 'badge-dot-amber'
                }
              />
              {isCmsOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
          <div className="card-body-info">
            <span className="card-device-label">KẾT NỐI CLOUD CMS</span>
            <h3 className="card-device-name">
              {isCmsOnline
                ? (syncStatus.lastHeartbeat ? `Heartbeat: ${syncStatus.lastHeartbeat}` : 'Đã Kết Nối CMS')
                : 'Chưa Kết Nối CMS'}
            </h3>
            <span className="card-device-sub">
              {isCmsOnline
                ? `Hàng đợi Outbox: ${syncStatus.pendingCount} phiên chờ sync`
                : `Hàng đợi Outbox: ${syncStatus.pendingCount} phiên (Sẽ tự sync khi có mạng)`}
            </span>
          </div>
        </div>
      </div>

      {/* ── Banner Trạng Thái Toàn Diện & Nút Chẩn Đoán Lại (Tinh gọn, không in text rác) ── */}
      <div className="system-health-banner">
        <div className="health-banner-left">
          <div className="health-check-icon">
            <CheckCircle2 size={24} strokeWidth={2.5} />
          </div>
          <div className="health-banner-text">
            <h4 className="health-banner-title">
              {isCameraOnline && isPrinterOnline && isNetworkOnline
                ? 'Hệ Thống Đang Vận Hành Ổn Định'
                : 'Đang Theo Dõi Trạng Thái Thiết Bị'}
            </h4>
            <p className="health-banner-sub">
              {diagnosticFeedback ||
                'Không phát hiện kẹt hàng đợi in. Các phiên chụp đang được lưu trữ an toàn.'}
            </p>
          </div>
        </div>

        <button
          className="btn-diagnose-trigger"
          onClick={runDiagnostic}
          disabled={isDiagnosticRunning}
        >
          <Zap size={18} strokeWidth={2.2} />
          <span>{isDiagnosticRunning ? 'Đang kiểm tra...' : 'Chẩn Đoán Lại'}</span>
        </button>
      </div>

      {/* ── Cấu Hình Nhanh: Điểm Đặt & Chế Độ Chụp ── */}
      <div className="quick-config-card">
        <div className="quick-config-grid">
          <div className="form-group-touch">
            <label className="form-label-touch">Tên Sự Kiện / Điểm Đặt</label>
            <input
              type="text"
              value={eventConfig.eventName || 'fotolism photobooth'}
              onChange={(e) => setEventConfig({ eventName: e.target.value })}
              className="form-input-touch"
              placeholder="Nhập tên sự kiện hoặc địa điểm kiosk"
            />
          </div>

          <div className="form-group-touch">
            <label className="form-label-touch">Chế Độ Chụp Mặc Định</label>
            <select
              value={eventConfig.captureMode || 'photobooth'}
              onChange={(e) =>
                setEventConfig({
                  captureMode: e.target.value as 'photobooth' | 'selfbooth',
                })
              }
              className="form-select-touch"
            >
              <option value="photobooth">
                Photobooth Cổ Điển (4 ô / Có xóa &amp; chụp lại)
              </option>
              <option value="selfbooth">
                Selfbooth Tự Do (5 phút chụp tự do)
              </option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
export default AdminOverviewTab
