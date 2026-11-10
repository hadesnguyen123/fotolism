import { useState } from 'react'
import { useAppStore, COLOR_FILTERS, type ColorFilterItem } from '../store/appStore'
import { DEFAULT_EVENT_NAME, resolveAssetUrl } from '../lib/constants'
import { BRAND_LOGO_SRC } from '../lib/brandLogo'
import { Check, Camera } from 'lucide-react'
import './FilterScreen.css'

export default function FilterScreen() {
  const [showFinishConfirm, setShowFinishConfirm] = useState(false)
  const {
    session,
    setScreen,
    selectedTheme,
    selectedLayout,
    selectedFrameSize,
    eventConfig,
    selectedFilter,
    selectFilter,
  } = useAppStore()

  const photos = session?.photos || []
  const displayedPhotos = photos.slice(0, selectedLayout.photosCount)

  const isGrid =
    selectedLayout.strip === false ||
    selectedLayout.previewType === '4_grid' ||
    selectedLayout.previewType === '6_grid' ||
    selectedLayout.previewType === '8_grid' ||
    selectedLayout.previewType === '9_grid' ||
    (selectedLayout.cols !== undefined && selectedLayout.cols > 1)

  // Render SVG Icon tương ứng cho từng bộ lọc màu theo mẫu thiết kế Warm Luxury
  const renderFilterIcon = (filterId: string) => {
    switch (filterId) {
      case 'normal':
        // Icon bức tranh phong cảnh (Núi & Mặt trời) màu nâu cam
        return (
          <svg width="52" height="52" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <rect x="7" y="9" width="34" height="30" rx="8" fill="#C48E66" />
            <circle cx="17" cy="18" r="3.5" fill="#FFFFFF" />
            <path d="M12 34L20 23L27 30L33 22L38 34H12Z" fill="#FFFFFF" />
          </svg>
        )
      case 'vintage_noir':
        // Icon vòng tròn chia đôi tương phản trắng đen B&W
        return (
          <svg width="52" height="52" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <circle cx="24" cy="24" r="18" fill="#FFFFFF" stroke="#2D2D2D" strokeWidth="3" />
            <path d="M24 6C14.0589 6 6 14.0589 6 24C6 33.9411 14.0589 42 24 42V6Z" fill="#2D2D2D" />
          </svg>
        )
      case 'retro_90s':
        // Icon máy quay phim cổ điển retro màu cam ấm
        return (
          <svg width="54" height="54" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <circle cx="17" cy="14" r="5" fill="#E58B44" />
            <circle cx="28" cy="14" r="5" fill="#E58B44" />
            <rect x="10" y="19" width="22" height="17" rx="4" fill="#E58B44" />
            <path d="M32 23.5L41 18V36L32 30.5V23.5Z" fill="#E58B44" />
          </svg>
        )
      default:
        return null
    }
  }

  return (
    <div className="filter-screen-container" id="filter-select-screen">
      {/* ── Fixed Brand Logo góc trên bên trái ── */}
      <img src={BRAND_LOGO_SRC} alt="fotolism" className="filter-fixed-brand-logo" />

      {/* ── Top Header: 3 Vòng Tròn Giao Nhau + Tiêu Đề Trung Tâm ── */}
      <header className="filter-screen-header">
        <div className="filter-header-center">
          <div className="filter-header-icon-box" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="16" r="10" fill="#8C5835" fillOpacity="0.88" />
              <circle cx="14" cy="25" r="10" fill="#C48E66" fillOpacity="0.88" />
              <circle cx="26" cy="25" r="10" fill="#E2BA96" fillOpacity="0.88" />
            </svg>
          </div>
          <h1 className="filter-header-title">Chọn Bộ Lọc</h1>
        </div>
      </header>

      {/* ── Main Split: Live Preview Dải In (Trái) + 3 Card Bộ Lọc Lớn (Phải) ── */}
      <main className="filter-main-split">
        {/* CỘT TRÁI: Dải ảnh in hoàn chỉnh áp dụng bộ lọc màu thời gian thực */}
        <section className="filter-preview-column">
          <div
            className={`strip-preview-fixed-frame ${
              (selectedTheme.frameSize || selectedFrameSize) === '2x6' ? 'frame-size-2x6' : 'frame-size-4x6'
            } ${selectedTheme.overlayUrl ? 'has-custom-overlay' : ''}`}
            style={{
              background: selectedTheme.overlayUrl ? 'transparent' : (selectedTheme.bgGradient || selectedTheme.bgColor),
              borderColor: selectedTheme.overlayUrl ? 'transparent' : selectedTheme.borderColor,
            }}
          >
            {/* Hiệu ứng đục lỗ nếu là theme cuộn phim 35mm */}
            {selectedTheme.id === 'theme_vintage_film' && (
              <div className="film-live-perforations">
                <div className="film-holes-strip left" />
                <div className="film-holes-strip right" />
              </div>
            )}

            {/* Các ô chứa ảnh thật áp dụng trực tiếp filter đã chọn */}
            {selectedTheme.slots && selectedTheme.slots.length > 0 ? (
              <div className="theme-custom-slots-container">
                {displayedPhotos.map((photo, index) => {
                  const slot = selectedTheme.slots![index]
                  if (!slot) return null
                  const canvasW = (selectedTheme.frameSize || selectedFrameSize) === '2x6' ? 600 : 1200
                  const canvasH = 1800
                  return (
                    <div
                      key={photo.id || index}
                      className="theme-slot-photo custom-positioned"
                      style={{
                        position: 'absolute',
                        left: `calc(${(slot.x / canvasW) * 100}% - 1px)`,
                        top: `calc(${(slot.y / canvasH) * 100}% - 1px)`,
                        width: `calc(${(slot.w / canvasW) * 100}% + 2px)`,
                        height: `calc(${(slot.h / canvasH) * 100}% + 2px)`,
                        borderRadius: 0,
                      }}
                    >
                      {photo.compositedPath || photo.enhancedPath || photo.rawPath ? (
                        <>
                          <img
                            src={photo.compositedPath || photo.enhancedPath || photo.rawPath}
                            alt={`Photo ${index + 1}`}
                            draggable={false}
                            style={{
                              borderRadius: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              filter: selectedFilter.cssFilter,
                              transition: 'filter 0.25s ease',
                            }}
                          />
                          {(selectedFilter.id === 'retro_90s' || selectedFilter.hasGrain) && (
                            <div className="retro-film-grain-overlay" />
                          )}
                        </>
                      ) : (
                        <div className="theme-slot-placeholder">
                          <Camera
                            size={16}
                            strokeWidth={2}
                            style={{
                              display: 'inline-block',
                              verticalAlign: 'middle',
                              marginRight: 4,
                            }}
                          />
                          <span>Ảnh {index + 1}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div
                className={isGrid ? 'grid-preview-slots' : 'strip-preview-slots'}
                style={
                  isGrid
                    ? {
                        gridTemplateColumns: `repeat(${selectedLayout.cols || 2}, 1fr)`,
                        gridTemplateRows: `repeat(${selectedLayout.rows || 2}, 1fr)`,
                      }
                    : undefined
                }
              >
                {displayedPhotos.map((photo, index) => (
                  <div key={photo.id || index} className="theme-slot-photo" style={{ position: 'relative' }}>
                    {photo.compositedPath || photo.enhancedPath || photo.rawPath ? (
                      <>
                        <img
                          src={photo.compositedPath || photo.enhancedPath || photo.rawPath}
                          alt={`Photo ${index + 1}`}
                          draggable={false}
                          style={{
                            filter: selectedFilter.cssFilter,
                            transition: 'filter 0.25s ease',
                          }}
                        />
                        {(selectedFilter.id === 'retro_90s' || selectedFilter.hasGrain) && (
                          <div className="retro-film-grain-overlay" />
                        )}
                      </>
                    ) : (
                      <div className="theme-slot-placeholder">
                        <Camera
                          size={16}
                          strokeWidth={2}
                          style={{
                            display: 'inline-block',
                            verticalAlign: 'middle',
                            marginRight: 4,
                          }}
                        />
                        <span>Ảnh {index + 1}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Chân dải ảnh in thương hiệu fotolism */}
            {!selectedTheme.hideFooter && (
              <div className="strip-branding-footer">
                <span style={{ color: selectedTheme.textColor }}>
                  {eventConfig.eventName || DEFAULT_EVENT_NAME}
                </span>
              </div>
            )}

            {/* Lớp Khung Đồ Họa PNG Trong Suốt (Overlay nếu có) */}
            {selectedTheme.overlayUrl && (
              <img
                src={resolveAssetUrl(selectedTheme.overlayUrl)}
                alt={selectedTheme.name}
                className="theme-frame-overlay-img"
              />
            )}
          </div>
        </section>

        {/* CỘT PHẢI: 3 Card Bộ Lọc Màu To Bản Chuẩn Thiết Kế */}
        <section className="filter-cards-container">
          {COLOR_FILTERS.map((filter: ColorFilterItem) => {
            const isSelected = selectedFilter.id === filter.id
            return (
              <div
                key={filter.id}
                className={`filter-big-card filter-card-${filter.id} ${
                  isSelected ? 'selected' : ''
                }`}
                onClick={() => selectFilter(filter)}
                role="button"
                tabIndex={0}
                aria-label={`Chọn bộ lọc ${filter.name}`}
              >
                {/* Dấu tích ✓ màu nâu ở góc trên bên phải khi được chọn */}
                {isSelected && (
                  <div className="filter-card-badge" aria-hidden="true">
                    <Check size={14} strokeWidth={3.2} />
                  </div>
                )}

                {/* Vùng nội dung chính của card */}
                <div className="filter-card-content">
                  <div className="filter-card-icon-wrapper">
                    {renderFilterIcon(filter.id)}
                  </div>
                  <h2 className="filter-card-name">{filter.name}</h2>
                </div>

                {/* Mảng lượn sóng trang trí chân card */}
                <div className="filter-card-wave-box" aria-hidden="true">
                  <svg viewBox="0 0 200 50" preserveAspectRatio="none">
                    <path
                      d="M0,25 C50,8 130,42 200,18 L200,50 L0,50 Z"
                      className="filter-wave-path"
                    />
                  </svg>
                </div>
              </div>
            )
          })}
        </section>
      </main>

      {/* ── Bottom Bar: Nút Tiếp Tục (Phải) Không Icon ── */}
      <footer className="filter-bottom-nav" style={{ justifyContent: 'flex-end' }}>
        <button
          className="btn-filter-proceed"
          onClick={() => setShowFinishConfirm(true)}
          title="Tiếp tục"
          aria-label="Tiếp tục"
        >
          Tiếp tục
        </button>
      </footer>

      {/* ── MODAL XÁC NHẬN KẾT THÚC & NHẬN ẢNH ── */}
      {showFinishConfirm && (
        <div className="filter-modal-overlay animate-fade-in" onClick={() => setShowFinishConfirm(false)}>
          <div className="filter-confirm-modal animate-pop" onClick={(e) => e.stopPropagation()}>
            <div className="filter-modal-badge">✨</div>
            <h2 className="filter-modal-title">Xác nhận kết thúc và nhận ảnh</h2>
            <p className="filter-modal-desc">
              Bạn đã hoàn toàn ưng ý với khung và bộ lọc màu này chưa? Hệ thống sẽ bắt đầu ghép dải ảnh hoàn chỉnh và in ngay sau khi xác nhận.
            </p>
            <div className="filter-modal-buttons">
              <button
                type="button"
                className="btn-filter-modal-cancel"
                onClick={() => setShowFinishConfirm(false)}
              >
                Chỉnh sửa thêm
              </button>
              <button
                type="button"
                className="btn-filter-modal-confirm"
                onClick={() => {
                  setShowFinishConfirm(false)
                  setScreen('processing')
                }}
              >
                Xác nhận kết thúc
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
