import { useState } from 'react'
import {
    useLogStore,
    type LogCategory,
    type LogStatus,
} from '../store/logStore'
import { useAppStore } from '../store/appStore'
import './ErrorNotificationCenter.css'

export default function ErrorNotificationCenter() {
    const currentScreen = useAppStore((s) => s.screen)
    const {
        logs,
        activeToasts,
        isDrawerOpen,
        unreadErrorCount,
        dismissToast,
        clearLogs,
        setDrawerOpen,
    } = useLogStore()
    const [filterCategory, setFilterCategory] = useState<string>('all')
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null)
    const [copiedId, setCopiedId] = useState<string | null>(null)
    const [copiedAll, setCopiedAll] = useState(false)

    const errorLogsCount = logs.filter((l) => l.status === 'error').length
    const warningLogsCount = logs.filter((l) => l.status === 'warning').length

    const filteredLogs = logs.filter((l) => {
        if (filterCategory === 'all') return true
        if (filterCategory === 'error') return l.status === 'error'
        if (filterCategory === 'warning') return l.status === 'warning'
        return l.category === filterCategory
    })

    const getCategoryBadgeClass = (category: LogCategory) => {
        switch (category) {
            case 'camera':
                return 'log-badge-camera'
            case 'storage':
                return 'log-badge-storage'
            case 'print':
                return 'log-badge-print'
            case 'ai':
                return 'log-badge-ai'
            case 'config':
                return 'log-badge-config'
            default:
                return 'log-badge-system'
        }
    }

    const getStatusIcon = (status: LogStatus) => {
        switch (status) {
            case 'error':
                return '❌'
            case 'warning':
                return '⚠️'
            case 'success':
                return '✅'
        }
    }

    const copyToClipboard = async (text: string, id?: string) => {
        try {
            await navigator.clipboard.writeText(text)
            if (id) {
                setCopiedId(id)
                setTimeout(() => setCopiedId(null), 2000)
            } else {
                setCopiedAll(true)
                setTimeout(() => setCopiedAll(false), 2000)
            }
        } catch {
            // fallback
        }
    }

    return (
        <>
            {/* ── 1. ACTIVE TOASTS (Nổi trực tiếp trên màn hình chính khi có lỗi mới) ── */}
            <div className="error-toast-container" aria-live="assertive">
                {activeToasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`error-toast-card toast-${toast.status}`}
                    >
                        <div className="error-toast-glow" />
                        <div className="error-toast-header">
                            <div className="error-toast-title-row">
                                <span className="error-toast-icon">
                                    {getStatusIcon(toast.status)}
                                </span>
                                <span
                                    className={`error-category-tag ${getCategoryBadgeClass(toast.category)}`}
                                >
                                    {toast.category.toUpperCase()}
                                </span>
                                <span className="error-action-name">
                                    {toast.action}
                                </span>
                            </div>
                            <button
                                type="button"
                                className="error-toast-close"
                                onClick={() => dismissToast(toast.id)}
                                title="Đóng thông báo"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="error-toast-body">
                            <div className="error-toast-message">
                                {toast.message}
                            </div>
                            {toast.details && (
                                <button
                                    type="button"
                                    className="error-toast-view-details-btn"
                                    onClick={() => {
                                        dismissToast(toast.id)
                                        setDrawerOpen(true)
                                        setExpandedLogId(toast.id)
                                    }}
                                >
                                    🔍 Xem chi tiết lỗi
                                </button>
                            )}
                        </div>

                        <div className="error-toast-footer">
                            <span className="error-toast-time">
                                {toast.timeStr}
                            </span>
                            <div className="error-toast-progress-bar" />
                        </div>
                    </div>
                ))}
            </div>

            {/* ── 2. NÚT HUY HIỆU LOG (Chỉ hiển thị trong màn hình Admin để giữ sạch giao diện khách) ──────── */}
            {currentScreen === 'admin' && (
                <div className="error-hud-trigger">
                    <button
                        type="button"
                        className={`error-hud-btn ${unreadErrorCount > 0 ? 'hud-has-unread' : errorLogsCount > 0 ? 'hud-has-errors' : 'hud-normal'}`}
                        onClick={() => setDrawerOpen(!isDrawerOpen)}
                        title="Mở nhật ký lỗi API & Camera (Debug Log)"
                    >
                        <span className="hud-icon">
                            {unreadErrorCount > 0
                                ? '🚨'
                                : errorLogsCount > 0
                                  ? '⚠️'
                                  : '📋'}
                        </span>
                        <span className="hud-label">
                            {unreadErrorCount > 0
                                ? `${unreadErrorCount} LỖI API MỚI`
                                : errorLogsCount > 0
                                  ? `${errorLogsCount} Lỗi API`
                                  : 'Log API'}
                        </span>
                    </button>
                </div>
            )}

            {/* ── 3. DRAWER BẢNG ĐIỀU KHIỂN LOG CHI TIẾT (Trượt ra từ bên phải) ─────── */}
            {isDrawerOpen && (
                <div
                    className="error-drawer-backdrop"
                    onClick={() => setDrawerOpen(false)}
                >
                    <div
                        className="error-drawer-panel"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="error-drawer-header">
                            <div className="drawer-title-group">
                                <span className="drawer-title-icon">🛠️</span>
                                <div>
                                    <h2 className="drawer-title">
                                        Nhật Ký Lỗi & Phản Hồi API
                                    </h2>
                                    <p className="drawer-subtitle">
                                        Theo dõi trạng thái máy ảnh Canon
                                        (EDSDK), Web API, Máy in & Lưu trữ
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="drawer-close-btn"
                                onClick={() => setDrawerOpen(false)}
                                title="Đóng bảng điều khiển"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Filter Tabs & Counters */}
                        <div className="error-drawer-toolbar">
                            <div className="drawer-filter-tabs">
                                <button
                                    type="button"
                                    className={`filter-tab ${filterCategory === 'all' ? 'active' : ''}`}
                                    onClick={() => setFilterCategory('all')}
                                >
                                    Tất cả ({logs.length})
                                </button>
                                <button
                                    type="button"
                                    className={`filter-tab filter-tab-error ${filterCategory === 'error' ? 'active' : ''}`}
                                    onClick={() => setFilterCategory('error')}
                                >
                                    ❌ Lỗi ({errorLogsCount})
                                </button>
                                <button
                                    type="button"
                                    className={`filter-tab filter-tab-warning ${filterCategory === 'warning' ? 'active' : ''}`}
                                    onClick={() => setFilterCategory('warning')}
                                >
                                    ⚠️ Cảnh báo ({warningLogsCount})
                                </button>
                                <button
                                    type="button"
                                    className={`filter-tab ${filterCategory === 'camera' ? 'active' : ''}`}
                                    onClick={() => setFilterCategory('camera')}
                                >
                                    📷 Camera
                                </button>
                                <button
                                    type="button"
                                    className={`filter-tab ${filterCategory === 'storage' ? 'active' : ''}`}
                                    onClick={() => setFilterCategory('storage')}
                                >
                                    💾 Lưu trữ
                                </button>
                            </div>

                            <div className="drawer-actions-row">
                                <button
                                    type="button"
                                    className="drawer-copy-all-btn"
                                    onClick={() =>
                                        copyToClipboard(
                                            JSON.stringify(logs, null, 2)
                                        )
                                    }
                                >
                                    {copiedAll
                                        ? '✓ Đã sao chép!'
                                        : '📄 Copy tất cả Log'}
                                </button>
                                <button
                                    type="button"
                                    className="drawer-clear-btn"
                                    onClick={() => clearLogs()}
                                    disabled={logs.length === 0}
                                >
                                    🗑️ Xóa sạch log
                                </button>
                            </div>
                        </div>

                        {/* Log List */}
                        <div className="error-drawer-content">
                            {filteredLogs.length === 0 ? (
                                <div className="error-empty-state">
                                    <div className="empty-icon">🎉</div>
                                    <div className="empty-text">
                                        Chưa ghi nhận lỗi API nào!
                                    </div>
                                    <div className="empty-subtext">
                                        Tất cả các lệnh API máy ảnh và lưu trữ
                                        đang hoạt động bình thường.
                                    </div>
                                </div>
                            ) : (
                                <div className="error-log-list">
                                    {filteredLogs.map((item) => {
                                        const isExpanded =
                                            expandedLogId === item.id
                                        return (
                                            <div
                                                key={item.id}
                                                className={`log-item-card log-status-${item.status}`}
                                            >
                                                <div
                                                    className="log-item-summary"
                                                    onClick={() =>
                                                        setExpandedLogId(
                                                            isExpanded
                                                                ? null
                                                                : item.id
                                                        )
                                                    }
                                                >
                                                    <div className="log-item-left">
                                                        <span className="log-status-icon">
                                                            {getStatusIcon(
                                                                item.status
                                                            )}
                                                        </span>
                                                        <span
                                                            className={`error-category-tag ${getCategoryBadgeClass(item.category)}`}
                                                        >
                                                            {item.category.toUpperCase()}
                                                        </span>
                                                        <span className="log-action-text">
                                                            {item.action}
                                                        </span>
                                                    </div>
                                                    <div className="log-item-right">
                                                        <span className="log-time-tag">
                                                            {item.timeStr}
                                                        </span>
                                                        <span className="log-chevron">
                                                            {isExpanded
                                                                ? '▲'
                                                                : '▼'}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="log-item-message">
                                                    {item.message}
                                                </div>

                                                {/* Chi tiết lỗi (Full JSON / Stack trace) */}
                                                {isExpanded && item.details && (
                                                    <div className="log-item-details-box">
                                                        <div className="details-header">
                                                            <span>
                                                                Chi tiết kỹ
                                                                thuật (Payload &
                                                                Trace):
                                                            </span>
                                                            <button
                                                                type="button"
                                                                className="details-copy-btn"
                                                                onClick={(
                                                                    e
                                                                ) => {
                                                                    e.stopPropagation()
                                                                    copyToClipboard(
                                                                        item.details ||
                                                                            '',
                                                                        item.id
                                                                    )
                                                                }}
                                                            >
                                                                {copiedId ===
                                                                item.id
                                                                    ? '✓ Đã sao chép'
                                                                    : 'Sao chép'}
                                                            </button>
                                                        </div>
                                                        <pre className="details-pre">
                                                            {item.details}
                                                        </pre>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="error-drawer-footer">
                            <span className="drawer-footer-hint">
                                💡 Nhấn <strong>ESC</strong> hoặc bấm nút đóng
                                để ẩn bảng điều khiển này.
                            </span>
                            <button
                                type="button"
                                className="drawer-close-bottom-btn"
                                onClick={() => setDrawerOpen(false)}
                            >
                                Đóng bảng Log
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
