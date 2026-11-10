import React from 'react'
import { Layers, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import type { ThemeItem, GridLayoutItem, FrameSize } from '../../store/appStore'
import { resolveAssetUrl } from '../../lib/constants'

interface FrameCarouselProps {
  sortedThemes: ThemeItem[]
  selectedTheme: ThemeItem
  selectedLayout: GridLayoutItem
  selectedFrameSize: FrameSize
  isGrid: boolean
  activeSlideIndex: number
  trackRef: React.RefObject<HTMLDivElement | null>
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerUpOrLeave: () => void
  onTrackScroll: () => void
  onScrollPrev: () => void
  onScrollNext: () => void
  onSelectTheme: (theme: ThemeItem, index: number) => void
  onDotClick: (index: number) => void
}

export const FrameCarousel: React.FC<FrameCarouselProps> = ({
  sortedThemes,
  selectedTheme,
  selectedLayout,
  selectedFrameSize,
  isGrid,
  activeSlideIndex,
  trackRef,
  onPointerDown,
  onPointerMove,
  onPointerUpOrLeave,
  onTrackScroll,
  onScrollPrev,
  onScrollNext,
  onSelectTheme,
  onDotClick,
}) => {
  return (
    <div className="theme-carousel-card">
      {/* Card Header: Tiêu đề "Chọn frame" + Tag bố cục */}
      <div className="carousel-card-header">
        <div className="carousel-card-title-group">
          <Layers className="control-header-icon" size={20} strokeWidth={2.4} />
          <h2 className="carousel-card-title">Chọn frame</h2>
        </div>
        <div className="carousel-card-meta-right">
          <span className="carousel-layout-tag">
            {selectedLayout.photosCount || 4} ảnh / {selectedFrameSize === '2x6' ? 'dải dọc' : 'khổ 4x6'}
          </span>
        </div>
      </div>

      {/* Vùng Trượt Cảm Ứng (Touch-First Slide Viewport kèm nút mũi tên tiện ích) */}
      <div className="carousel-slider-wrapper">
        <button
          type="button"
          className="carousel-nav-btn prev"
          onClick={onScrollPrev}
          aria-label="Khung trước"
        >
          <ChevronLeft size={20} strokeWidth={2.6} />
        </button>

        <div className="carousel-touch-viewport">
          <div
            className="carousel-items-track"
            ref={trackRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUpOrLeave}
            onPointerLeave={onPointerUpOrLeave}
            onPointerCancel={onPointerUpOrLeave}
            onScroll={onTrackScroll}
          >
            {sortedThemes.map((theme, index) => {
              const isSelected = selectedTheme.id === theme.id
              return (
                <div
                  key={theme.id}
                  className={`frame-mini-wrapper ${isSelected ? 'selected' : ''}`}
                  onClick={() => onSelectTheme(theme, index)}
                  role="button"
                  tabIndex={0}
                  aria-label={theme.name}
                >
                  {/* Badge tích chọn màu nâu góc trên bên phải */}
                  {isSelected && (
                    <div className="frame-selected-badge" aria-hidden="true">
                      <Check size={14} strokeWidth={3.2} />
                    </div>
                  )}

                  {/* Khung dải mini thể hiện màu sắc / phong cách */}
                  <div
                    className={`frame-mini-item frame-style-${theme.id} ${isGrid ? 'layout-4x6' : 'layout-2x6'}`}
                    style={{
                      backgroundColor: theme.bgColor,
                      borderColor: theme.borderColor,
                    }}
                  >
                    {/* Hiển thị hình ảnh khung đồ họa nếu có */}
                    {theme.overlayUrl ? (
                      <img
                        src={resolveAssetUrl(theme.overlayUrl)}
                        alt={theme.name}
                        className="frame-mini-overlay-img"
                      />
                    ) : (
                      <>
                        {/* Các ô chữ nhật rỗng màu trắng mô phỏng bố cục */}
                        <div
                          className={`frame-mini-slots ${isGrid ? 'mini-grid' : 'mini-strip'}`}
                          style={
                            isGrid
                              ? {
                                  gridTemplateColumns: `repeat(${selectedLayout.cols || 2}, 1fr)`,
                                  gridTemplateRows: `repeat(${selectedLayout.rows || 2}, 1fr)`,
                                }
                              : undefined
                          }
                        >
                          {Array.from({
                            length: selectedLayout.photosCount || 4,
                          }).map((_, slotIdx) => (
                            <div key={slotIdx} className="frame-mini-slot-box" />
                          ))}
                        </div>

                        {/* Chân dải mini in chữ fotolism */}
                        <div
                          className="frame-mini-brand-footer"
                          style={{ color: theme.textColor }}
                        >
                          fotolism
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <button
          type="button"
          className="carousel-nav-btn next"
          onClick={onScrollNext}
          aria-label="Khung tiếp theo"
        >
          <ChevronRight size={20} strokeWidth={2.6} />
        </button>
      </div>

      {/* Dải chấm tròn phân trang (Dots Indicator) */}
      <div className="carousel-dots-row" aria-label="Bộ chọn trang theme">
        {sortedThemes.map((theme, index) => (
          <button
            key={theme.id}
            className={`carousel-dot ${index === activeSlideIndex ? 'active' : ''}`}
            onClick={() => onDotClick(index)}
            title={theme.name}
            aria-label={`Chọn ${theme.name}`}
          />
        ))}
      </div>
    </div>
  )
}
