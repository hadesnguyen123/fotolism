import React, { useState, useEffect } from 'react'
import {
  Cpu,
  FileText,
  Shield,
  Zap,
  Volume2,
  Camera,
  Activity,
  Cloud,
  Folder,
  Copy,
  Eye,
  EyeOff,
  Code2,
  Server,
  RefreshCw,
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { GOOGLE_APPS_SCRIPT_SAMPLE } from '../../lib/gdriveWebhookScript'
import { fotolismApi, isBrowser } from '../../lib/api'

interface AdminSystemTabProps {
  daemonStatus: { running: boolean; url: string; state?: string } | null
  isNetworkOnline: boolean
  isPingingCms: boolean
  handlePingCms: () => void
  cmsPingResult: string | null
  showScriptModal: boolean
  setShowScriptModal: (show: boolean) => void
  isCopiedToken: boolean
  handleCopyToken: () => void
  isCopiedFolderId: boolean
  handleCopyFolderId: () => void
}

export const AdminSystemTab: React.FC<AdminSystemTabProps> = ({
  daemonStatus,
  isNetworkOnline,
  isPingingCms,
  handlePingCms,
  cmsPingResult,
  showScriptModal,
  setShowScriptModal,
  isCopiedToken,
  handleCopyToken,
  isCopiedFolderId,
  handleCopyFolderId,
}) => {
  const { deviceConfig, setDeviceConfig, eventConfig, setEventConfig } =
    useAppStore()

  const [shutterSoundEnabled, setShutterSoundEnabled] = useState<boolean>(true)
  const [countdownSoundEnabled, setCountdownSoundEnabled] =
    useState<boolean>(true)
  const [showToken, setShowToken] = useState<boolean>(false)
  const [heartbeatInterval, setHeartbeatInterval] = useState<number>(30)

  // Cloudflare R2 Upload Worker State
  const [r2Concurrency, setR2Concurrency] = useState<number>(4)
  const [r2QueueStats, setR2QueueStats] = useState<{
    pending: number
    uploading: number
    uploaded: number
    failedTasks: number
  }>({ pending: 0, uploading: 0, uploaded: 0, failedTasks: 0 })
  const [isRetryingUploads, setIsRetryingUploads] = useState<boolean>(false)
  const [retryNotice, setRetryNotice] = useState<string | null>(null)

  useEffect(() => {
    async function loadR2Status() {
      try {
        const api = isBrowser ? null : fotolismApi
        if (api?.storage?.getUploadStatus) {
          const res = await api.storage.getUploadStatus()
          if (res.success && res.data) {
            setR2Concurrency(res.data.concurrency || 4)
            setR2QueueStats({
              pending: res.data.pendingTasks || 0,
              uploading: res.data.uploadingTasks || 0,
              uploaded: res.data.uploadedTasks || 0,
              failedTasks: res.data.failedTasks || 0,
            })
          }
        }
      } catch {}
    }

    loadR2Status()
    const timer = setInterval(loadR2Status, 4000)
    return () => clearInterval(timer)
  }, [])

  const handleChangeConcurrency = async (val: number) => {
    setR2Concurrency(val)
    try {
      const api = isBrowser ? null : fotolismApi
      if (api?.storage?.setConcurrency) {
        await api.storage.setConcurrency(val)
      }
    } catch {}
  }

  const handleRetryFailedUploads = async () => {
    setIsRetryingUploads(true)
    setRetryNotice(null)
    try {
      const api = isBrowser ? null : fotolismApi
      if (api?.storage?.retryFailedUploads) {
        const res = await api.storage.retryFailedUploads()
        if (res.success) {
          setRetryNotice(`Đã khôi phục ${res.data?.retriedCount || 0} ảnh vào hàng đợi tải lên.`)
        } else {
          setRetryNotice(`Lỗi: ${res.error}`)
        }
      }
    } catch (e: any) {
      setRetryNotice(`Lỗi: ${e.message}`)
    } finally {
      setIsRetryingUploads(false)
      setTimeout(() => setRetryNotice(null), 4000)
    }
  }

  const isCameraOnline = Boolean(daemonStatus?.running)

  return (
    <div className="tab-pane-content">
      {/* ── Tiêu Đề Tab Lớn (Không còn sub-tabs thừa theo đúng thiết kế ảnh 2) ── */}
      <div className="pane-header-row">
        <div className="pane-title-with-icon">
          <Cpu size={28} strokeWidth={2.4} />
          <h2 className="tab-pane-title">Hệ Thống</h2>
        </div>
      </div>

      {/* ── Card 1: </> Tiến Trình Canon EDSDK ── */}
      <div className="panel-card-touch">
        <div className="panel-card-header">
          <div className="panel-title-group">
            <span className="code-symbol-touch">&lt;/&gt;</span>
            <span className="panel-title-text">Tiến Trình Canon EDSDK</span>
            <span
              className={`pill-badge ${isCameraOnline ? 'pill-green' : 'pill-amber'}`}
            >
              <span
                className={
                  isCameraOnline ? 'badge-dot-green' : 'badge-dot-amber'
                }
              />
              {isCameraOnline ? 'Đang chạy' : 'Chưa bật'}
            </span>
          </div>

          <button
            className="btn-touch-outline"
            onClick={() => {
              alert(
                `Canon Daemon: ${isCameraOnline ? 'Hoạt động tốt tại 127.0.0.1:8899' : 'Chưa bật'}`
              )
            }}
          >
            <Zap size={18} strokeWidth={2.2} />
            <span>Kiểm Tra Endpoint</span>
          </button>
        </div>

        <div className="system-grid-4col">
          <div className="form-group-touch">
            <label className="form-label-touch">File thực thi</label>
            <div className="input-with-icon-touch">
              <FileText size={20} strokeWidth={2} />
              <input
                type="text"
                readOnly
                value="fotolism_canon_daemon.exe"
                className="form-input-touch-inner"
              />
            </div>
          </div>

          <div className="form-group-touch">
            <label className="form-label-touch">Port</label>
            <div className="input-with-icon-touch">
              <Cpu size={20} strokeWidth={2} />
              <input
                type="text"
                readOnly
                value="127.0.0.1:8899"
                className="form-input-touch-inner"
              />
            </div>
          </div>

          <div className="form-group-touch">
            <label className="form-label-touch">Kiến trúc SDK</label>
            <div className="input-with-icon-touch">
              <Shield size={20} strokeWidth={2} />
              <input
                type="text"
                readOnly
                value="Canon EDSDK 64-bit"
                className="form-input-touch-inner"
              />
            </div>
          </div>

          <div className="form-group-touch">
            <label className="form-label-touch">Hàng đợi</label>
            <select className="form-select-touch">
              <option>Single-Threaded</option>
              <option>Multi-Threaded</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Card 2: Âm Thanh & Đếm Ngược ── */}
      <div className="panel-card-touch">
        <div className="panel-card-header">
          <div className="panel-title-group">
            <Volume2 size={24} strokeWidth={2.2} />
            <span className="panel-title-text">Âm Thanh &amp; Đếm Ngược</span>
          </div>
        </div>

        <div className="system-grid-2col">
          {/* Âm thanh chụp */}
          <div className="sound-sub-box">
            <div className="switch-row-touch">
              <div className="switch-left-group">
                <Camera size={20} strokeWidth={2} />
                <span className="switch-label-touch">Âm thanh chụp</span>
              </div>
              <label className="switch-toggle-touch">
                <input
                  type="checkbox"
                  checked={shutterSoundEnabled}
                  onChange={(e) => setShutterSoundEnabled(e.target.checked)}
                />
                <span className="switch-slider-touch" />
              </label>
            </div>
            <select className="form-select-touch" style={{ width: '100%' }}>
              <option>Âm tách cơ học</option>
              <option>Âm điện tử</option>
            </select>
          </div>

          {/* Âm đếm ngược */}
          <div className="sound-sub-box">
            <div className="switch-row-touch">
              <div className="switch-left-group">
                <Activity size={20} strokeWidth={2} />
                <span className="switch-label-touch">Âm đếm ngược</span>
              </div>
              <label className="switch-toggle-touch">
                <input
                  type="checkbox"
                  checked={countdownSoundEnabled}
                  onChange={(e) => setCountdownSoundEnabled(e.target.checked)}
                />
                <span className="switch-slider-touch" />
              </label>
            </div>
            <select className="form-select-touch" style={{ width: '100%' }}>
              <option>Bật (3s / 5s)</option>
              <option>Tắt</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Card 3: Kết Nối Cloud CMS ── */}
      <div className="panel-card-touch">
        <div className="panel-card-header">
          <div className="panel-title-group">
            <Cloud size={24} strokeWidth={2.2} />
            <span className="panel-title-text">Kết Nối Cloud CMS</span>
            <span
              className={`pill-badge ${isNetworkOnline ? 'pill-green' : 'pill-amber'}`}
            >
              <span
                className={
                  isNetworkOnline ? 'badge-dot-green' : 'badge-dot-amber'
                }
              />
              {isNetworkOnline ? 'Đã kết nối' : 'Chưa kết nối'}
            </span>
          </div>

          <button
            className="btn-touch-outline"
            disabled={isPingingCms}
            onClick={handlePingCms}
          >
            <Zap size={18} strokeWidth={2.2} />
            <span>{isPingingCms ? 'Đang ping...' : 'Test Ping'}</span>
          </button>
        </div>

        {cmsPingResult && (
          <div className="shutter-result-notice">{cmsPingResult}</div>
        )}

        <div className="system-grid-2col">
          <div className="form-group-touch">
            <label className="form-label-touch">CMS Base URL</label>
            <input
              type="text"
              value={deviceConfig?.cms_url || 'http://localhost:3000'}
              onChange={(e) =>
                setDeviceConfig({
                  ...(deviceConfig || {
                    kiosk_id: 'kiosk_01',
                    device_token: '',
                    branch_id: '',
                  }),
                  cms_url: e.target.value,
                })
              }
              className="form-input-touch"
              placeholder="http://localhost:3000"
            />
          </div>

          <div className="form-group-touch">
            <label className="form-label-touch">Nhịp tim (Heartbeat)</label>
            <select
              value={heartbeatInterval}
              onChange={(e) => setHeartbeatInterval(parseInt(e.target.value, 10))}
              className="form-select-touch"
            >
              <option value={15}>15 giây</option>
              <option value={30}>30 giây (Mặc định)</option>
              <option value={60}>60 giây</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Card 4: Định Danh Thiết Bị ── */}
      <div className="panel-card-touch">
        <div className="panel-card-header">
          <div className="panel-title-group">
            <Shield size={24} strokeWidth={2.2} />
            <span className="panel-title-text">Định Danh Thiết Bị</span>
          </div>
        </div>

        <div className="system-grid-2col" style={{ marginBottom: '16px' }}>
          <div className="form-group-touch">
            <label className="form-label-touch">Tên Kiosk</label>
            <input
              type="text"
              value={deviceConfig?.kiosk_name || 'Kiosk #01'}
              onChange={(e) =>
                setDeviceConfig({
                  ...(deviceConfig || {
                    kiosk_id: 'kiosk_01',
                    device_token: '',
                    branch_id: '',
                  }),
                  kiosk_name: e.target.value,
                })
              }
              className="form-input-touch"
            />
          </div>

          <div className="form-group-touch">
            <label className="form-label-touch">Chi nhánh</label>
            <input
              type="text"
              value={deviceConfig?.branch_name || 'Chi nhánh A'}
              onChange={(e) =>
                setDeviceConfig({
                  ...(deviceConfig || {
                    kiosk_id: 'kiosk_01',
                    device_token: '',
                    branch_id: '',
                  }),
                  branch_name: e.target.value,
                })
              }
              className="form-input-touch"
            />
          </div>
        </div>

        <div className="system-grid-2col">
          <div className="form-group-touch">
            <label className="form-label-touch">Kiosk ID</label>
            <input
              type="text"
              readOnly
              value={deviceConfig?.kiosk_id || 'kiosk_01'}
              className="form-input-touch readonly"
            />
          </div>

          <div className="form-group-touch">
            <label className="form-label-touch">Device Token</label>
            <div className="token-field-touch">
              <input
                type={showToken ? 'text' : 'password'}
                readOnly
                value={deviceConfig?.device_token || '••••••••••••••••••••'}
                className="form-input-touch-inner"
              />
              <button
                type="button"
                className="btn-token-action"
                onClick={() => setShowToken(!showToken)}
                title={showToken ? 'Ẩn token' : 'Hiện token'}
              >
                {showToken ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
              <button
                type="button"
                className="btn-token-action"
                onClick={handleCopyToken}
                title="Sao chép Device Token"
              >
                <Copy size={18} />
              </button>
            </div>
            {isCopiedToken && (
              <span className="token-copied-pill">Đã sao chép token!</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Card 5: Google Drive & Trả Ảnh QR ── */}
      <div className="panel-card-touch">
        <div className="panel-card-header">
          <div className="panel-title-group">
            <Folder size={24} strokeWidth={2.2} />
            <span className="panel-title-text">
              Google Drive &amp; Trả Ảnh QR
            </span>
            <span
              className={`pill-badge ${eventConfig.gdriveAutoSync !== false ? 'pill-green' : 'pill-amber'}`}
            >
              <span
                className={
                  eventConfig.gdriveAutoSync !== false
                    ? 'badge-dot-green'
                    : 'badge-dot-amber'
                }
              />
              {eventConfig.gdriveAutoSync !== false ? 'Bật' : 'Tắt'}
            </span>
          </div>

          <button
            className="btn-touch-outline"
            onClick={() => setShowScriptModal(true)}
          >
            <Code2 size={18} />
            <span>Mã Script</span>
          </button>
        </div>

        <div className="switch-row-touch" style={{ marginBottom: '16px' }}>
          <span className="switch-label-touch">
            Tự động đẩy ảnh lên Google Drive sau khi in
          </span>
          <label className="switch-toggle-touch">
            <input
              type="checkbox"
              checked={eventConfig.gdriveAutoSync !== false}
              onChange={(e) =>
                setEventConfig({ gdriveAutoSync: e.target.checked })
              }
            />
            <span className="switch-slider-touch" />
          </label>
        </div>

        <div className="form-group-touch">
          <label className="form-label-touch">Folder ID</label>
          <div className="token-field-touch">
            <input
              type="text"
              value={eventConfig.gdriveFolderId || ''}
              onChange={(e) =>
                setEventConfig({ gdriveFolderId: e.target.value })
              }
              className="form-input-touch-inner"
              placeholder="1FcgyAe79bpnZnygxR4i4b4qM_42oB5eU"
            />
            <button
              type="button"
              className="btn-token-action"
              onClick={handleCopyFolderId}
              title="Sao chép Folder ID"
            >
              <Copy size={18} />
            </button>
          </div>
          {isCopiedFolderId && (
            <span className="token-copied-pill">Đã sao chép Folder ID!</span>
          )}
        </div>
      </div>

      {/* ── Card 6: Cloudflare R2 Storage & Upload Worker (Fotolism 3.0) ── */}
      <div className="panel-card-touch">
        <div className="panel-card-header">
          <div className="panel-title-group">
            <Server size={24} strokeWidth={2.2} />
            <span className="panel-title-text">
              Cloudflare R2 Storage (Fotolism 3.0)
            </span>
            <span className="pill-badge pill-green">
              <span className="badge-dot-green" />
              Sẵn sàng (R2 Bucket)
            </span>
          </div>

          <button
            className="btn-touch-outline"
            disabled={isRetryingUploads}
            onClick={handleRetryFailedUploads}
          >
            <RefreshCw size={18} className={isRetryingUploads ? 'animate-spin' : ''} />
            <span>{isRetryingUploads ? 'Đang thử lại...' : 'Thử lại ảnh lỗi'}</span>
          </button>
        </div>

        {retryNotice && (
          <div className="shutter-result-notice" style={{ marginBottom: '14px' }}>
            {retryNotice}
          </div>
        )}

        <div className="system-grid-2col" style={{ marginBottom: '16px' }}>
          <div className="form-group-touch">
            <label className="form-label-touch">Luồng Upload Đồng Thời (Concurrency)</label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              {[1, 2, 4, 8].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => handleChangeConcurrency(c)}
                  className={`btn-touch-outline ${r2Concurrency === c ? 'active' : ''}`}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontWeight: 'bold',
                    backgroundColor: r2Concurrency === c ? '#502A1D' : '#ffffff',
                    color: r2Concurrency === c ? '#ffffff' : '#502A1D',
                    borderColor: '#502A1D',
                    borderRadius: '10px',
                    cursor: 'pointer',
                  }}
                >
                  {c} {c === 4 ? '(Chuẩn)' : 'luồng'}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group-touch">
            <label className="form-label-touch">Hàng Đợi Upload SQLite (Outbox)</label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px',
                marginTop: '6px',
              }}
            >
              <div
                style={{
                  backgroundColor: '#f8f9fa',
                  padding: '8px',
                  borderRadius: '10px',
                  textAlign: 'center',
                  border: '1px solid #e9ecef',
                }}
              >
                <div style={{ fontSize: '10px', color: '#6c757d', fontWeight: 'bold' }}>Chờ tải</div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#333' }}>
                  {r2QueueStats.pending}
                </div>
              </div>
              <div
                style={{
                  backgroundColor: '#e7f5ff',
                  padding: '8px',
                  borderRadius: '10px',
                  textAlign: 'center',
                  border: '1px solid #d0ebff',
                }}
              >
                <div style={{ fontSize: '10px', color: '#1971c2', fontWeight: 'bold' }}>Đang tải</div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#1971c2' }}>
                  {r2QueueStats.uploading}
                </div>
              </div>
              <div
                style={{
                  backgroundColor: '#ebfbee',
                  padding: '8px',
                  borderRadius: '10px',
                  textAlign: 'center',
                  border: '1px solid #d3f9d8',
                }}
              >
                <div style={{ fontSize: '10px', color: '#2b8a3e', fontWeight: 'bold' }}>Hoàn tất</div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#2b8a3e' }}>
                  {r2QueueStats.uploaded}
                </div>
              </div>
              <div
                style={{
                  backgroundColor: r2QueueStats.failedTasks > 0 ? '#fff5f5' : '#f8f9fa',
                  padding: '8px',
                  borderRadius: '10px',
                  textAlign: 'center',
                  border: r2QueueStats.failedTasks > 0 ? '1px solid #ffc9c9' : '1px solid #e9ecef',
                }}
              >
                <div
                  style={{
                    fontSize: '10px',
                    color: r2QueueStats.failedTasks > 0 ? '#e03131' : '#6c757d',
                    fontWeight: 'bold',
                  }}
                >
                  Lỗi
                </div>
                <div
                  style={{
                    fontSize: '16px',
                    fontWeight: 'bold',
                    color: r2QueueStats.failedTasks > 0 ? '#e03131' : '#333',
                  }}
                >
                  {r2QueueStats.failedTasks}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── MODAL HIỂN THỊ MÃ GOOGLE APPS SCRIPT ── */}
      {showScriptModal && (
        <div
          className="admin-modal-backdrop"
          onClick={() => setShowScriptModal(false)}
        >
          <div
            className="admin-script-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header-touch">
              <h3 className="modal-title-touch">
                Mã Nguồn Google Apps Script (Web App)
              </h3>
              <button
                className="btn-modal-close"
                onClick={() => setShowScriptModal(false)}
              >
                ✕
              </button>
            </div>
            <p className="modal-desc-touch">
              Sao chép đoạn mã bên dưới và triển khai (Deploy) làm Web App trên
              Google Apps Script để tự động nhận ảnh và trả link QR:
            </p>
            <div className="code-snippet-box">
              <pre>{GOOGLE_APPS_SCRIPT_SAMPLE}</pre>
            </div>
            <div className="modal-footer-touch">
              <button
                className="btn-touch-primary"
                onClick={() => {
                  navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_SAMPLE)
                  alert('Đã sao chép mã script vào bộ nhớ tạm!')
                }}
              >
                <Copy size={18} />
                <span>Sao Chép Mã Script</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default AdminSystemTab
