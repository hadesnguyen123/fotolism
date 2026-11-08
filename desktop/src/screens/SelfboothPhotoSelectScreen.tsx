import { useState, useMemo } from 'react'
import { useAppStore, type CapturedPhoto } from '../store/appStore'
import { SlidersHorizontal, ChevronDown, X, Image as ImageIcon } from 'lucide-react'
import { BRAND_LOGO_SRC } from '../lib/brandLogo'
import './SelfboothPhotoSelectScreen.css'

export default function SelfboothPhotoSelectScreen() {
  const {
    session,
    setSessionPhotos,
    setScreen,
    selectedTheme,
  } = useAppStore()

  // Toàn bộ ảnh đã chụp trong buổi Selfbooth
  const rawPhotos: CapturedPhoto[] = useMemo(() => {
    if (session?.selfboothLibrary && session.selfboothLibrary.length > 0) {
      return session.selfboothLibrary
    }
    if (session?.photos && session.photos.length > 0) {
      return session.photos
    }
    return []
  }, [session?.selfboothLibrary, session?.photos])

  // Trạng thái sắp xếp ảnh: 'newest' (mới nhất) | 'oldest' (cũ nhất)
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('oldest')

  const allPhotos = useMemo(() => {
    const list = [...rawPhotos]
    if (sortOrder === 'newest') {
      return list.reverse()
    }
    return list
  }, [rawPhotos, sortOrder])

  // Cố định 4 ô ảnh cho Selfbooth theo đúng quy chuẩn thiết kế
  const totalSlots = 4

  // Trạng thái 4 ô ảnh trong frame (khởi tạo rỗng để hiển thị dấu + như mockup)
  const [filledSlots, setFilledSlots] = useState<(CapturedPhoto | null)[]>([
    null,
    null,
    null,
    null,
  ])

  // Ô đang được chọn để điền ảnh tiếp theo (0 -> 3)
  const [activeSlotIndex, setActiveSlotIndex] = useState<number>(0)

  // Phân trang danh sách ảnh: 15 ảnh mỗi trang (5 cột x 3 hàng chuẩn mockup)
  const ITEMS_PER_PAGE = 15
  const [currentPage, setCurrentPage] = useState<number>(0)
  const totalPages = Math.max(1, Math.ceil(Math.max(1, allPhotos.length) / ITEMS_PER_PAGE))

  const currentPhotos = useMemo(() => {
    const start = currentPage * ITEMS_PER_PAGE
    return allPhotos.slice(start, start + ITEMS_PER_PAGE)
  }, [allPhotos, currentPage])

  // Xử lý khi khách chạm vào một ảnh trong lưới bên phải
  function handleTogglePhoto(photo: CapturedPhoto) {
    // Kiểm tra xem ảnh này đã được chọn vào ô nào chưa
    const existingIndex = filledSlots.findIndex(
      (s) => s && (s.id === photo.id || s.rawPath === photo.rawPath)
    )

    if (existingIndex !== -1) {
      // Nếu chạm vào ảnh đã chọn -> hủy chọn ô đó và đặt ô đó làm active
      const next = [...filledSlots]
      next[existingIndex] = null
      setFilledSlots(next)
      setActiveSlotIndex(existingIndex)
      return
    }

    // Nếu ảnh chưa chọn -> điền vào activeSlotIndex
    const next = [...filledSlots]
    next[activeSlotIndex] = photo
    setFilledSlots(next)

    // Tự động nhảy activeSlotIndex sang ô trống tiếp theo
    const nextEmptyIndex = next.findIndex((s, idx) => s === null && idx !== activeSlotIndex)
    if (nextEmptyIndex !== -1) {
      setActiveSlotIndex(nextEmptyIndex)
    } else {
      setActiveSlotIndex((activeSlotIndex + 1) % totalSlots)
    }
  }

  // Xóa ảnh khỏi ô cụ thể
  function handleRemoveSlot(index: number, e: React.MouseEvent) {
    e.stopPropagation()
    const next = [...filledSlots]
    next[index] = null
    setFilledSlots(next)
    setActiveSlotIndex(index)
  }

  // Đếm số ô đã chọn
  const filledCount = filledSlots.filter(Boolean).length
  const isComplete = filledCount === totalSlots

  // Tiếp tục sang màn hình xử lý ảnh & Review
  function handleProceed() {
    if (!isComplete) return
    const selectedPhotosOnly = filledSlots.filter((p): p is CapturedPhoto => p !== null)
    setSessionPhotos(selectedPhotosOnly)
    setScreen('processing')
  }

  function handleToggleSort() {
    setSortOrder((prev) => (prev === 'oldest' ? 'newest' : 'oldest'))
  }

  return (
    <div className="selfbooth-select-screen animate-fade-in" id="selfbooth-photo-select-screen">
      {/* ── Fixed Brand Logo góc trên bên trái ── */}
      <img src={BRAND_LOGO_SRC} alt="fotolism" className="selfbooth-fixed-brand" />

      {/* ── Top Header: Icon Khung Ảnh + Tiêu Đề Trung Tâm ── */}
      <header className="selfbooth-select-header">
        <div className="selfbooth-header-icon-box" aria-hidden="true">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#502A1D" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <circle cx="8.5" cy="8.5" r="1.5" fill="#502A1D" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        </div>
        <h1 className="selfbooth-header-title">Chọn ảnh vào Frame</h1>
        <p className="selfbooth-header-subtitle">
          Chọn 4 ảnh yêu thích từ bộ ảnh của bạn và ghép vào khung
        </p>
      </header>

      {/* ── Main 2-Card Layout: Khung In (Trái) + Thư Viện Ảnh (Phải) ── */}
      <main className="selfbooth-select-main">
        {/* THẺ TRÁI: Khung In Xem Trước (Card Bo Góc Trắng) */}
        <section className="selfbooth-frame-card">
          <div
            className="selfbooth-frame-strip"
            style={{
              backgroundColor: selectedTheme?.bgColor || '#502A1D',
              borderColor: selectedTheme?.borderColor || '#502A1D',
            }}
          >
            {/* 4 Ô Ảnh Trong Frame Dọc */}
            <div className="selfbooth-strip-slots">
              {Array.from({ length: totalSlots }).map((_, slotIdx) => {
                const photo = filledSlots[slotIdx]
                const isActive = activeSlotIndex === slotIdx

                return (
                  <div
                    key={slotIdx}
                    className={`selfbooth-slot-item ${isActive ? 'active' : ''} ${photo ? 'filled' : 'empty'}`}
                    onClick={() => setActiveSlotIndex(slotIdx)}
                    title={`Ô số ${slotIdx + 1}`}
                  >
                    {photo ? (
                      <>
                        <img
                          src={photo.compositedPath || photo.enhancedPath || photo.rawPath}
                          alt={`Slot ${slotIdx + 1}`}
                          className="selfbooth-slot-img"
                        />
                        <button
                          type="button"
                          className="selfbooth-slot-remove-btn"
                          onClick={(e) => handleRemoveSlot(slotIdx, e)}
                          title="Bỏ chọn ảnh này"
                        >
                          <X size={13} strokeWidth={2.8} />
                        </button>
                      </>
                    ) : (
                      <div className="selfbooth-slot-empty">
                        <span className="selfbooth-slot-plus">+</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Chữ Thương Hiệu Dưới Đáy Khung */}
            <div className="selfbooth-strip-footer">
              <span
                className="selfbooth-strip-brand-text"
                style={{ color: selectedTheme?.textColor || '#FFFFFF' }}
              >
                fotolism
              </span>
            </div>
          </div>
        </section>

        {/* THẺ PHẢI: Thư Viện Toàn Bộ Ảnh (Lưới 5 Cột x 3 Hàng = 15 Ảnh) */}
        <section className="selfbooth-gallery-card">
          {/* Thanh Công Cụ Trên Cùng Của Thẻ Phải */}
          <div className="selfbooth-gallery-topbar">
            {/* Pill bộ lọc danh mục */}
            <div className="selfbooth-category-pill">
              <span>Tất cả ảnh ({allPhotos.length})</span>
              <ChevronDown size={17} strokeWidth={2.4} />
            </div>

            {/* Pill trạng thái số lượng đã chọn */}
            <div className="selfbooth-status-pill">
              <span>Đã chọn: {filledCount} / {totalSlots}</span>
            </div>

            {/* Pill sắp xếp */}
            <button
              type="button"
              className="selfbooth-sort-pill"
              onClick={handleToggleSort}
              title={`Đang xếp: ${sortOrder === 'oldest' ? 'Cũ nhất trước' : 'Mới nhất trước'}`}
            >
              <SlidersHorizontal size={15} strokeWidth={2.4} />
              <span>Sắp xếp</span>
            </button>
          </div>

          {/* Lưới Ảnh 5x3 */}
          <div className="selfbooth-gallery-grid-area">
            {allPhotos.length === 0 ? (
              <div className="selfbooth-gallery-empty">
                <ImageIcon size={44} strokeWidth={1.8} color="#8C756B" />
                <p>Chưa có ảnh nào trong phiên chụp.</p>
              </div>
            ) : (
              <div className="selfbooth-gallery-grid">
                {currentPhotos.map((photo, index) => {
                  const absoluteIndex = currentPage * ITEMS_PER_PAGE + index
                  // Tìm xem ảnh này có được chọn vào ô nào chưa
                  const slotAssigned = filledSlots.findIndex(
                    (s) => s && (s.id === photo.id || s.rawPath === photo.rawPath)
                  )
                  const isSelected = slotAssigned !== -1

                  return (
                    <div
                      key={photo.id || absoluteIndex}
                      className={`gallery-thumb-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleTogglePhoto(photo)}
                    >
                      <img
                        src={photo.compositedPath || photo.enhancedPath || photo.rawPath}
                        alt={`Ảnh ${absoluteIndex + 1}`}
                        className="gallery-thumb-img"
                        loading="lazy"
                      />

                      {/* Nút tròn chọn góc trên phải */}
                      <div className={`gallery-thumb-circle ${isSelected ? 'checked' : 'unchecked'}`}>
                        {isSelected && (
                          <span className="circle-slot-num">{slotAssigned + 1}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* ── Fixed Footer Navigation: Nút Quay Lại & Chấm Phân Trang & Nút Tiếp Tục ── */}
      <footer className="selfbooth-select-bottom-bar">
        {/* Nút Quay Lại (Trái) */}
        <button
          type="button"
          className="btn-select-back"
          onClick={() => setScreen('capture')}
          title="Quay lại"
          aria-label="Quay lại"
        >
          Quay lại
        </button>

        {/* Chấm Tròn Phân Trang (Giữa) */}
        <div className="selfbooth-pagination-container">
          {Array.from({ length: Math.min(6, totalPages) }).map((_, pageIdx) => (
            <button
              key={pageIdx}
              type="button"
              className={`selfbooth-page-dot ${currentPage === pageIdx ? 'active' : ''}`}
              onClick={() => setCurrentPage(pageIdx)}
              title={`Trang ${pageIdx + 1}`}
              aria-label={`Trang ${pageIdx + 1}`}
            />
          ))}
        </div>

        {/* Nút Tiếp Tục (Phải) */}
        <button
          type="button"
          className={`btn-select-proceed ${isComplete ? 'enabled' : 'disabled'}`}
          disabled={!isComplete}
          onClick={handleProceed}
          title={isComplete ? 'Tiếp tục xử lý ảnh' : `Vui lòng chọn đủ ${totalSlots} ảnh`}
          aria-label="Tiếp tục"
        >
          Tiếp tục
        </button>
      </footer>
    </div>
  )
}
