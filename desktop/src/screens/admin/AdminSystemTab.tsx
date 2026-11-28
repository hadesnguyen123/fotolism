import React, { useState, useEffect } from 'react'
import {
    Cpu,
    Shield,
    Zap,
    Volume2,
    Camera,
    Activity,
    Cloud,
    Copy,
    Eye,
    EyeOff,
    Server,
    RefreshCw,
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { fotolismApi, isBrowser } from '../../lib/api'
import {
    DEFAULT_STAFF_PAYMENT_PIN,
    ENV_CMS_URL,
} from '../../lib/constants'

interface AdminSystemTabProps {
    isNetworkOnline: boolean
    isPingingCms: boolean
    handlePingCms: () => void
    cmsPingResult: string | null
    isCopiedToken: boolean
    handleCopyToken: () => void
}

export const AdminSystemTab: React.FC<AdminSystemTabProps> = ({
    isNetworkOnline,
    isPingingCms,
    handlePingCms,
    cmsPingResult,
    isCopiedToken,
    handleCopyToken,
}) => {
    const { deviceConfig, setDeviceConfig, eventConfig, setEventConfig } =
        useAppStore()

    const [shutterSoundEnabled, setShutterSoundEnabled] =
        useState<boolean>(true)
    const [countdownSoundEnabled, setCountdownSoundEnabled] =
        useState<boolean>(true)
    const [showToken, setShowToken] = useState<boolean>(false)
    const [showStaffPin, setShowStaffPin] = useState<boolean>(false)
    const [staffPinInput, setStaffPinInput] = useState<string>(
        () => eventConfig.staffPaymentPin || DEFAULT_STAFF_PAYMENT_PIN
    )
    const [staffPinSavedNotice, setStaffPinSavedNotice] = useState<
        string | null
    >(null)
    const [heartbeatInterval, setHeartbeatInterval] = useState<number>(30)

    const handleSaveStaffPaymentPin = () => {
        const cleaned = staffPinInput.replace(/\D/g, '').slice(0, 8)
        if (cleaned.length < 4) {
            setStaffPinSavedNotice('Mã PIN phải gồm từ 4 đến 8 chữ số.')
            return
        }
        setStaffPinInput(cleaned)
        setEventConfig({ staffPaymentPin: cleaned })
        setStaffPinSavedNotice('Đã lưu mã PIN nhân viên thành công.')
        setTimeout(() => setStaffPinSavedNotice(null), 3000)
    }

    // Cloudflare R2 Upload Worker State
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

    const handleRetryFailedUploads = async () => {
        setIsRetryingUploads(true)
        setRetryNotice(null)
        try {
            const api = isBrowser ? null : fotolismApi
            if (api?.storage?.retryFailedUploads) {
                const res = await api.storage.retryFailedUploads()
                if (res.success) {
                    setRetryNotice(
                        `Đã khôi phục ${res.data?.retriedCount || 0} ảnh vào hàng đợi tải lên.`
                    )
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

    return (
        <div className="tab-pane-content">
            {/* ── Tiêu Đề Tab Lớn (Không còn sub-tabs thừa theo đúng thiết kế ảnh 2) ── */}
            <div className="pane-header-row">
                <div className="pane-title-with-icon">
                    <Cpu size={28} strokeWidth={2.4} />
                    <h2 className="tab-pane-title">Hệ Thống</h2>
                </div>
            </div>

            {/* ── Card 1b: Mã PIN Nhân Viên Xác Nhận Thanh Toán ── */}
            <div className="panel-card-touch">
                <div className="panel-card-header">
                    <div className="panel-title-group">
                        <Shield size={24} strokeWidth={2.2} />
                        <span className="panel-title-text">
                            Mã PIN Nhân Viên (Màn Thanh Toán)
                        </span>
                    </div>
                </div>

                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '12px',
                    }}
                >
                    <div
                        style={{
                            position: 'relative',
                            flex: '1 1 240px',
                            maxWidth: '340px',
                        }}
                    >
                        <input
                            type={showStaffPin ? 'text' : 'password'}
                            inputMode="numeric"
                            maxLength={8}
                            value={staffPinInput}
                            onChange={(e) =>
                                setStaffPinInput(
                                    e.target.value.replace(/\D/g, '').slice(0, 8)
                                )
                            }
                            placeholder={DEFAULT_STAFF_PAYMENT_PIN}
                            className="form-select-touch"
                            style={{
                                width: '100%',
                                paddingRight: '44px',
                                letterSpacing: showStaffPin ? '2px' : '4px',
                                fontWeight: 700,
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => setShowStaffPin((v) => !v)}
                            aria-label={showStaffPin ? 'Ẩn mã PIN' : 'Hiện mã PIN'}
                            style={{
                                position: 'absolute',
                                right: '10px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: '#6b4f45',
                                display: 'flex',
                                alignItems: 'center',
                            }}
                        >
                            {showStaffPin ? (
                                <EyeOff size={18} />
                            ) : (
                                <Eye size={18} />
                            )}
                        </button>
                    </div>
                    <button
                        type="button"
                        className="btn-touch-primary"
                        onClick={handleSaveStaffPaymentPin}
                        style={{ minWidth: '140px' }}
                    >
                        Lưu mã PIN
                    </button>
                    <button
                        type="button"
                        className="btn-touch-outline"
                        onClick={() => {
                            setStaffPinInput(DEFAULT_STAFF_PAYMENT_PIN)
                            setEventConfig({
                                staffPaymentPin: DEFAULT_STAFF_PAYMENT_PIN,
                            })
                            setStaffPinSavedNotice(
                                `Đã khôi phục mặc định (${DEFAULT_STAFF_PAYMENT_PIN}).`
                            )
                            setTimeout(() => setStaffPinSavedNotice(null), 3000)
                        }}
                    >
                        Mặc định ({DEFAULT_STAFF_PAYMENT_PIN})
                    </button>
                </div>
                {staffPinSavedNotice && (
                    <p
                        style={{
                            marginTop: '10px',
                            fontSize: '13px',
                            fontWeight: 600,
                            color: staffPinSavedNotice.includes('phải')
                                ? '#d9480f'
                                : '#2b8a3e',
                        }}
                    >
                        {staffPinSavedNotice}
                    </p>
                )}
            </div>

            {/* ── Card 2: Âm Thanh & Đếm Ngược ── */}
            <div className="panel-card-touch">
                <div className="panel-card-header">
                    <div className="panel-title-group">
                        <Volume2 size={24} strokeWidth={2.2} />
                        <span className="panel-title-text">
                            Âm Thanh &amp; Đếm Ngược
                        </span>
                    </div>
                </div>

                <div className="system-grid-2col">
                    {/* Âm thanh chụp */}
                    <div className="sound-sub-box">
                        <div className="switch-row-touch">
                            <div className="switch-left-group">
                                <Camera size={20} strokeWidth={2} />
                                <span className="switch-label-touch">
                                    Âm thanh chụp
                                </span>
                            </div>
                            <label className="switch-toggle-touch">
                                <input
                                    type="checkbox"
                                    checked={shutterSoundEnabled}
                                    onChange={(e) =>
                                        setShutterSoundEnabled(e.target.checked)
                                    }
                                />
                                <span className="switch-slider-touch" />
                            </label>
                        </div>
                        <select
                            className="form-select-touch"
                            style={{ width: '100%' }}
                        >
                            <option>Âm tách cơ học</option>
                            <option>Âm điện tử</option>
                        </select>
                    </div>

                    {/* Âm đếm ngược */}
                    <div className="sound-sub-box">
                        <div className="switch-row-touch">
                            <div className="switch-left-group">
                                <Activity size={20} strokeWidth={2} />
                                <span className="switch-label-touch">
                                    Âm đếm ngược
                                </span>
                            </div>
                            <label className="switch-toggle-touch">
                                <input
                                    type="checkbox"
                                    checked={countdownSoundEnabled}
                                    onChange={(e) =>
                                        setCountdownSoundEnabled(
                                            e.target.checked
                                        )
                                    }
                                />
                                <span className="switch-slider-touch" />
                            </label>
                        </div>
                        <select
                            className="form-select-touch"
                            style={{ width: '100%' }}
                        >
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
                        <span className="panel-title-text">
                            Kết Nối Cloud CMS
                        </span>
                        <span
                            className={`pill-badge ${isNetworkOnline ? 'pill-green' : 'pill-amber'}`}
                        >
                            <span
                                className={
                                    isNetworkOnline
                                        ? 'badge-dot-green'
                                        : 'badge-dot-amber'
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
                        <span>
                            {isPingingCms ? 'Đang ping...' : 'Test Ping'}
                        </span>
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
                            value={deviceConfig?.cms_url || ENV_CMS_URL || ''}
                            onChange={(e) =>
                                setDeviceConfig({
                                    ...(deviceConfig || {
                                        kiosk_id: '',
                                        device_token: '',
                                        branch_id: '',
                                    }),
                                    cms_url: e.target.value,
                                })
                            }
                            className="form-input-touch"
                            placeholder="Chưa cấu hình URL Cloud CMS (.env)"
                        />
                    </div>

                    <div className="form-group-touch">
                        <label className="form-label-touch">
                            Nhịp tim (Heartbeat)
                        </label>
                        <select
                            value={heartbeatInterval}
                            onChange={(e) =>
                                setHeartbeatInterval(
                                    parseInt(e.target.value, 10)
                                )
                            }
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
                        <span className="panel-title-text">
                            Định Danh Thiết Bị
                        </span>
                    </div>
                </div>

                <div
                    className="system-grid-2col"
                    style={{ marginBottom: '16px' }}
                >
                    <div className="form-group-touch">
                        <label className="form-label-touch">Tên Kiosk</label>
                        <input
                            type="text"
                            value={deviceConfig?.kiosk_name || ''}
                            placeholder="Chưa gán tên Kiosk"
                            onChange={(e) =>
                                setDeviceConfig({
                                    ...(deviceConfig || {
                                        kiosk_id: '',
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
                            value={deviceConfig?.branch_name || ''}
                            placeholder="Chưa gán chi nhánh"
                            onChange={(e) =>
                                setDeviceConfig({
                                    ...(deviceConfig || {
                                        kiosk_id: '',
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
                            value={deviceConfig?.kiosk_id || 'Chưa kích hoạt'}
                            className="form-input-touch readonly"
                        />
                    </div>

                    <div className="form-group-touch">
                        <label className="form-label-touch">Device Token</label>
                        <div className="token-field-touch">
                            <input
                                type={showToken ? 'text' : 'password'}
                                readOnly
                                value={
                                    deviceConfig?.device_token ||
                                    '••••••••••••••••••••'
                                }
                                className="form-input-touch-inner"
                            />
                            <button
                                type="button"
                                className="btn-token-action"
                                onClick={() => setShowToken(!showToken)}
                                title={showToken ? 'Ẩn token' : 'Hiện token'}
                            >
                                {showToken ? (
                                    <EyeOff size={18} />
                                ) : (
                                    <Eye size={18} />
                                )}
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
                            <span className="token-copied-pill">
                                Đã sao chép token!
                            </span>
                        )}
                    </div>
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
                        <RefreshCw
                            size={18}
                            className={isRetryingUploads ? 'animate-spin' : ''}
                        />
                        <span>
                            {isRetryingUploads
                                ? 'Đang thử lại...'
                                : 'Thử lại ảnh lỗi'}
                        </span>
                    </button>
                </div>

                {retryNotice && (
                    <div
                        className="shutter-result-notice"
                        style={{ marginBottom: '14px' }}
                    >
                        {retryNotice}
                    </div>
                )}

                <div style={{ marginBottom: '16px' }}>
                    <div className="form-group-touch">
                        <label className="form-label-touch">
                            Hàng Đợi Upload SQLite (Outbox)
                        </label>
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
                                <div
                                    style={{
                                        fontSize: '10px',
                                        color: '#6c757d',
                                        fontWeight: 'bold',
                                    }}
                                >
                                    Chờ tải
                                </div>
                                <div
                                    style={{
                                        fontSize: '16px',
                                        fontWeight: 'bold',
                                        color: '#333',
                                    }}
                                >
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
                                <div
                                    style={{
                                        fontSize: '10px',
                                        color: '#1971c2',
                                        fontWeight: 'bold',
                                    }}
                                >
                                    Đang tải
                                </div>
                                <div
                                    style={{
                                        fontSize: '16px',
                                        fontWeight: 'bold',
                                        color: '#1971c2',
                                    }}
                                >
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
                                <div
                                    style={{
                                        fontSize: '10px',
                                        color: '#2b8a3e',
                                        fontWeight: 'bold',
                                    }}
                                >
                                    Hoàn tất
                                </div>
                                <div
                                    style={{
                                        fontSize: '16px',
                                        fontWeight: 'bold',
                                        color: '#2b8a3e',
                                    }}
                                >
                                    {r2QueueStats.uploaded}
                                </div>
                            </div>
                            <div
                                style={{
                                    backgroundColor:
                                        r2QueueStats.failedTasks > 0
                                            ? '#fff5f5'
                                            : '#f8f9fa',
                                    padding: '8px',
                                    borderRadius: '10px',
                                    textAlign: 'center',
                                    border:
                                        r2QueueStats.failedTasks > 0
                                            ? '1px solid #ffc9c9'
                                            : '1px solid #e9ecef',
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: '10px',
                                        color:
                                            r2QueueStats.failedTasks > 0
                                                ? '#e03131'
                                                : '#6c757d',
                                        fontWeight: 'bold',
                                    }}
                                >
                                    Lỗi
                                </div>
                                <div
                                    style={{
                                        fontSize: '16px',
                                        fontWeight: 'bold',
                                        color:
                                            r2QueueStats.failedTasks > 0
                                                ? '#e03131'
                                                : '#333',
                                    }}
                                >
                                    {r2QueueStats.failedTasks}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    )
}
export default AdminSystemTab
