import React from 'react'
import {
  Trash2,
  Cloud,
  Search,
  Eye,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
} from 'lucide-react'
import { type KioskOutboxSession } from '../../services/cloudSyncService'

interface AdminSessionsTabProps {
  sessions: KioskOutboxSession[]
  filteredSessions: KioskOutboxSession[]
  paginatedSessions: KioskOutboxSession[]
  sessionDateFrom: string
  setSessionDateFrom: (val: string) => void
  sessionDateTo: string
  setSessionDateTo: (val: string) => void
  sessionSyncFilter: 'ALL' | 'SYNCED' | 'PENDING_SYNC'
  setSessionSyncFilter: (val: 'ALL' | 'SYNCED' | 'PENDING_SYNC') => void
  currentPage: number
  setCurrentPage: (page: number | ((prev: number) => number)) => void
  totalPages: number
  handleCleanOldSessions: () => void
  handleTriggerManualSync: () => void
  isManualSyncing: boolean
  manualSyncMsg: string | null
}

export const AdminSessionsTab: React.FC<AdminSessionsTabProps> = ({
  filteredSessions,
  paginatedSessions,
  sessionDateFrom,
  setSessionDateFrom,
  sessionDateTo,
  setSessionDateTo,
  sessionSyncFilter,
  setSessionSyncFilter,
  currentPage,
  setCurrentPage,
  totalPages,
  handleCleanOldSessions,
  handleTriggerManualSync,
  isManualSyncing,
  manualSyncMsg,
}) => {
  const formatVND = (num: number) =>
    new Intl.NumberFormat('vi-VN').format(num) + ' đ'

  const formatDateTime = (iso: string) => {
    try {
      const d = new Date(iso)
      const time = d.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      })
      const date = d.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
      return `${time} ${date}`
    } catch {
      return iso
    }
  }

  return (
    <div className="tab-pane-content">
      {/* ── Tiêu Đề Tab & Các Nút Hành Động Lớn Touch-First ── */}
      <div className="pane-header-row">
        <div>
          <h2 className="tab-pane-title">Lịch Sử Phiên Chụp &amp; Đồng Bộ</h2>
          <p className="tab-pane-desc">
            Quản lý các phiên chụp cục bộ SQLite Outbox và đồng bộ đám mây CMS
          </p>
        </div>

        <div className="sessions-header-actions">
          <button
            className="btn-touch-outline"
            onClick={handleCleanOldSessions}
            title="Xóa các phiên chụp cũ hơn 7 ngày"
          >
            <Trash2 size={18} />
            <span>Dọn dẹp &gt; 7 ngày</span>
          </button>

          <button
            className="btn-touch-primary"
            onClick={handleTriggerManualSync}
            disabled={isManualSyncing}
          >
            <Cloud size={18} />
            <span>{isManualSyncing ? 'Đang sync...' : 'Sync lên CMS'}</span>
          </button>
        </div>
      </div>

      {manualSyncMsg && (
        <div className="shutter-result-notice">{manualSyncMsg}</div>
      )}

      {/* ── Bộ Lọc Tìm Kiếm Touch-First ── */}
      <div className="sessions-filter-card">
        <div className="filter-fields-row">
          <div className="filter-input-group">
            <label className="filter-label">Từ ngày</label>
            <input
              type="date"
              value={sessionDateFrom}
              onChange={(e) => setSessionDateFrom(e.target.value)}
              className="filter-date-input-touch"
            />
          </div>

          <div className="filter-input-group">
            <label className="filter-label">Đến ngày</label>
            <input
              type="date"
              value={sessionDateTo}
              onChange={(e) => setSessionDateTo(e.target.value)}
              className="filter-date-input-touch"
            />
          </div>

          <div className="filter-input-group">
            <label className="filter-label">Đồng bộ</label>
            <select
              value={sessionSyncFilter}
              onChange={(e) =>
                setSessionSyncFilter(
                  e.target.value as 'ALL' | 'SYNCED' | 'PENDING_SYNC'
                )
              }
              className="filter-select-touch"
            >
              <option value="ALL">Tất cả</option>
              <option value="SYNCED">Đã đồng bộ</option>
              <option value="PENDING_SYNC">Chờ Sync</option>
            </select>
          </div>

          <div className="filter-search-btn-wrap">
            <button
              className="btn-filter-search-touch"
              title="Tìm kiếm"
              onClick={() => setCurrentPage(1)}
            >
              <Search size={20} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Bảng Danh Sách Phiên Chụp (Paging 10 Record, Touch-Friendly) ── */}
      <div className="sessions-table-card">
        <div className="table-responsive-wrapper">
          <table className="sessions-table-touch">
            <thead>
              <tr>
                <th>Mã phiên</th>
                <th>Thời gian</th>
                <th>Bố cục</th>
                <th>Thanh toán</th>
                <th>Số tiền</th>
                <th>Bản in</th>
                <th>Đồng bộ</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {paginatedSessions.length > 0 ? (
                paginatedSessions.map((s) => (
                  <tr key={s.id}>
                    <td className="cell-session-code">
                      <strong>{s.session_code}</strong>
                    </td>
                    <td className="cell-time">{formatDateTime(s.created_at)}</td>
                    <td>
                      <span className="layout-tag-pill">{s.layout_type}</span>
                    </td>
                    <td>
                      <span
                        className={`payment-method-pill ${s.payment_method === 'vietqr' ? 'method-vietqr' : 'method-cash'}`}
                      >
                        {s.payment_method?.toUpperCase() || 'VIETQR'}
                      </span>
                    </td>
                    <td className="cell-amount">
                      {formatVND(s.total_amount)}
                    </td>
                    <td className="cell-copies">{s.copies}</td>
                    <td>
                      {s.sync_status === 'SYNCED' ? (
                        <span className="pill-badge pill-green">
                          <CheckCircle2 size={14} />
                          <span>Đã đồng bộ</span>
                        </span>
                      ) : (
                        <span className="pill-badge pill-amber">
                          <Clock size={14} />
                          <span>Chờ Sync</span>
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn-table-action-touch"
                        title="Xem chi tiết"
                        onClick={() =>
                          alert(
                            `Chi tiết phiên: ${s.session_code}\nBố cục: ${s.layout_type}\nSố tiền: ${formatVND(s.total_amount)}\nBản in: ${s.copies}\nTrạng thái Sync: ${s.sync_status}`
                          )
                        }
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="table-empty-notice">
                    Không tìm thấy phiên chụp nào phù hợp với bộ lọc
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Phân Trang (Paging 10 records) */}
        <div className="sessions-pagination-bar">
          <span className="pagination-count-label">
            Hiển thị{' '}
            <strong>
              {paginatedSessions.length > 0
                ? (currentPage - 1) * 10 + 1
                : 0}
            </strong>{' '}
            –{' '}
            <strong>
              {Math.min(currentPage * 10, filteredSessions.length)}
            </strong>{' '}
            trong <strong>{filteredSessions.length}</strong> phiên
          </span>

          <div className="pagination-nav-group">
            <button
              className="btn-page-touch"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
            >
              <ChevronLeft size={20} />
            </button>

            <span className="page-indicator-text">
              Trang <strong>{currentPage}</strong> / {totalPages}
            </span>

            <button
              className="btn-page-touch"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
export default AdminSessionsTab

