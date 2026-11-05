import { useRef, useEffect, useState, useCallback } from 'react'
import { useAppStore, THEME_OPTIONS, type ThemeItem } from '../store/appStore'
import { DEFAULT_EVENT_NAME } from '../lib/constants'
import { Check, Camera } from 'lucide-react'
import './ThemeSelectScreen.css'

export default function ThemeSelectScreen() {
  const {
    session,
    setScreen,
    selectedTheme,
    selectTheme,
    selectedLayout,
    selectedFrameSize,
    eventConfig,
  } = useAppStore()

  const trackRef = useRef<HTMLDivElement>(null)

  // Danh sách themes chuẩn theo mockup Warm Luxury:
  // 1. Nâu Cổ Điển -> 2. Trắng Tối Giản -> 3. Hồng Pastel -> 4. Xanh Baby -> 5. Vintage Kem -> 6. Cuộn Phim 35mm -> 7. Đen -> 8. Kim Tuyến
  const sortedThemes = THEME_OPTIONS

  // Vị trí khung hiện tại trên slide (dựa theo vị trí trượt cuộn)
  const [activeSlideIndex, setActiveSlideIndex] = useState(() => {
    const idx = sortedThemes.findIndex((t) => t.id === selectedTheme.id)
    return idx !== -1 ? idx : 0
  })

  // Quản lý cử chỉ vuốt chạm cảm ứng (Touch / Drag gesture)
  const isPointerDown = useRef(false)
  const startX = useRef(0)
  const scrollLeftStart = useRef(0)
  const hasDragged = useRef(false)
  const lastX = useRef(0)
  const lastTime = useRef(0)
  const velocityX = useRef(0)

  const photos = session?.photos || []
  const photosCount = selectedLayout.photosCount || 4
  const isSelfbooth = eventConfig.captureMode === 'selfbooth'
  const displayedPhotos = photos.length > 0 
    ? photos.slice(0, photosCount) 
    : Array.from({ length: photosCount }).map((_, i) => ({
        id: 'slot_' + (i + 1),
        rawPath: '',
        compositedPath: '',
      }))
  const isGrid =
    selectedLayout.strip === false ||
    selectedLayout.previewType === '4_grid' ||
    selectedLayout.previewType === '6_grid' ||
    selectedLayout.previewType === '8_grid' ||
    selectedLayout.previewType === '9_grid' ||
    (selectedLayout.cols !== undefined && selectedLayout.cols > 1)

  // Xử lý bắt đầu chạm màn hình cảm ứng hoặc nhấn chuột
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current) return
    isPointerDown.current = true
    hasDragged.current = false
    startX.current = e.pageX
    scrollLeftStart.current = trackRef.current.scrollLeft
    lastX.current = e.pageX
    lastTime.current = performance.now()
    velocityX.current = 0

    // Tắt smooth scroll tạm thời trong lúc kéo tay để theo sát chuyển động ngón tay
    trackRef.current.style.scrollBehavior = 'auto'
    trackRef.current.classList.add('is-dragging')
  }

  // Xử lý kéo trượt dải khung theo cử chỉ ngón tay
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDown.current || !trackRef.current) return
    const currentX = e.pageX
    const deltaX = currentX - startX.current

    // Nếu di chuyển quá 6px thì xác nhận là cử chỉ vuốt (swipe/drag), không phải click
    if (Math.abs(deltaX) > 6) {
      hasDragged.current = true
    }

    const now = performance.now()
    const dt = now - lastTime.current
    if (dt > 0) {
      velocityX.current = (currentX - lastX.current) / dt
    }
    lastX.current = currentX
    lastTime.current = now

    trackRef.current.scrollLeft = scrollLeftStart.current - deltaX
  }

  // Xử lý khi thả ngón tay (kết thúc cử chỉ vuốt trượt cảm ứng)
  const handlePointerUpOrLeave = () => {
    if (!isPointerDown.current || !trackRef.current) return
    isPointerDown.current = false
    trackRef.current.classList.remove('is-dragging')
    trackRef.current.style.scrollBehavior = 'smooth'

    // Trượt quán tính (Inertial momentum) khi người dùng quẹt nhanh
    if (Math.abs(velocityX.current) > 0.25) {
      const momentumScroll = -velocityX.current * 280
      trackRef.current.scrollBy({ left: momentumScroll, behavior: 'smooth' })
    }
  }

  // Lắng nghe sự kiện trượt cuộn để tính khung trung tâm hiển thị
  const handleTrackScroll = useCallback(() => {
    if (!trackRef.current) return
    const track = trackRef.current
    const trackCenter = track.scrollLeft + track.clientWidth / 2
    const children = Array.from(track.children) as HTMLElement[]

    let closestIdx = 0
    let minDiff = Infinity

    children.forEach((child, idx) => {
      const childCenter = child.offsetLeft + child.clientWidth / 2
      const diff = Math.abs(trackCenter - childCenter)
      if (diff < minDiff) {
        minDiff = diff
        closestIdx = idx
      }
    })

    setActiveSlideIndex(closestIdx)
  }, [])

  // Chạm vào khung mini để chọn (chỉ kích hoạt khi không phải là thao tác kéo trượt)
  const handleSelectThemeItem = (theme: ThemeItem, index: number) => {
    if (hasDragged.current) return
    selectTheme(theme)
    setActiveSlideIndex(index)

    // Cuộn nhẹ khung được chọn vào giữa tầm nhìn
    if (trackRef.current) {
      const children = Array.from(trackRef.current.children) as HTMLElement[]
      if (children[index]) {
        children[index].scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center',
        })
      }
    }
  }

  // Nhấp vào chấm dot phân trang để trượt tới khung đó
  const handleDotClick = (index: number) => {
    if (!trackRef.current) return
    const children = Array.from(trackRef.current.children) as HTMLElement[]
    if (children[index]) {
      children[index].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
    setActiveSlideIndex(index)
    selectTheme(sortedThemes[index])
  }

  // Tự động cuộn khung được chọn vào giữa lúc mới vào màn hình
  useEffect(() => {
    if (trackRef.current) {
      const selectedIdx = sortedThemes.findIndex((t) => t.id === selectedTheme.id)
      if (selectedIdx !== -1) {
        const children = Array.from(trackRef.current.children) as HTMLElement[]
        if (children[selectedIdx]) {
          children[selectedIdx].scrollIntoView({
            behavior: 'auto',
            block: 'nearest',
            inline: 'center',
          })
        }
      }
    }
  }, [])

  return (
    <div className="theme-screen-container" id="theme-select-screen">
      {/* ── Fixed Brand Logo góc trên bên trái ── */}
      <div className="theme-fixed-brand-logo">fotolism</div>

      {/* ── Top Header: Icon Khung + Tiêu đề Trung tâm ── */}
      <header className="theme-screen-header">
        <div className="theme-header-center">
          <div className="theme-header-icon-box" aria-hidden="true">
            <svg
              width="34"
              height="34"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#502A1D"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="3" y1="15" x2="21" y2="15" />
            </svg>
          </div>
          <h1 className="theme-header-title">Chọn Frame</h1>
          <p className="theme-header-subtitle">
            {isSelfbooth ? 'Chọn khung 4 ô trước khi bắt đầu chụp' : `Chọn khung layout ${selectedLayout.photosCount || 4} ảnh`}
          </p>
        </div>
      </header>

      {/* ── Main 2-Column Split: Live Preview (Trái) + Touch Slider Chọn Khung (Phải) ── */}
      <main className="theme-main-split">
        {/* CỘT TRÁI: Dải ảnh in hoàn chỉnh kèm ảnh thật của khách */}
        <section className="theme-preview-card">
          <div
            className={`strip-preview-fixed-frame ${
              selectedFrameSize === '2x6' ? 'frame-size-2x6' : 'frame-size-4x6'
            } ${selectedTheme.id === 'theme_vintage_film' ? 'is-vintage-film' : ''}`}
            style={{
              background: selectedTheme.bgGradient || selectedTheme.bgColor,
              borderColor: selectedTheme.borderColor,
            }}
          >
            {/* Nếu là cuộn phim 35mm: đục lỗ film 2 bên */}
            {selectedTheme.id === 'theme_vintage_film' && (
              <div className="film-live-perforations">
                <div className="film-holes-strip left" />
                <div className="film-holes-strip right" />
              </div>
            )}

            {/* Các ô chứa ảnh thật của khách */}
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
                <div key={photo.id || index} className="theme-slot-photo">
                  {photo.compositedPath || photo.rawPath ? (
                    <img
                      src={photo.compositedPath || photo.rawPath}
                      alt={`Photo ${index + 1}`}
                    />
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

            {/* Chân dải ảnh in thương hiệu fotolism */}
            {!selectedTheme.hideFooter && (
              <div className="strip-branding-footer">
                <span
                  style={{
                    color: selectedTheme.textColor,
                  }}
                >
                  {eventConfig.eventName || DEFAULT_EVENT_NAME}
                </span>
              </div>
            )}

            {/* Lớp Khung Đồ Họa PNG Trong Suốt (Overlay nếu có) */}
            {selectedTheme.overlayUrl && (
              <img
                src={selectedTheme.overlayUrl}
                alt={selectedTheme.name}
                className="theme-frame-overlay-img"
              />
            )}
          </div>
        </section>

        {/* CỘT PHẢI: Card trượt cảm ứng (Touch Slide) hiển thị danh sách các khung ngang */}
        <section className="theme-carousel-card">
          {/* Card Header: Tiêu đề + Bộ đếm số thứ tự */}
          <div className="carousel-card-header">
            <h2 className="carousel-card-title">
              Các khung {selectedLayout.photosCount || 4} ô
            </h2>
            <div className="carousel-card-meta-right">
              <span className="carousel-swipe-hint">Vuốt để xem thêm</span>
              <span className="carousel-card-counter">
                {activeSlideIndex + 1}/{sortedThemes.length}
              </span>
            </div>
          </div>

          {/* Vùng Trượt Cảm Ứng (Touch-First Slide Viewport - Vuốt Trái/Phải không cần nút bấm) */}
          <div className="carousel-touch-viewport">
            <div
              className="carousel-items-track"
              ref={trackRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUpOrLeave}
              onPointerLeave={handlePointerUpOrLeave}
              onPointerCancel={handlePointerUpOrLeave}
              onScroll={handleTrackScroll}
            >
              {sortedThemes.map((theme, index) => {
                const isSelected = selectedTheme.id === theme.id
                return (
                  <div
                    key={theme.id}
                    className={`frame-mini-wrapper ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectThemeItem(theme, index)}
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
                      {/* Hiệu ứng film đục lỗ cho theme 35mm */}
                      {theme.id === 'theme_vintage_film' && (
                        <div className="mini-film-perforations">
                          <div className="mini-film-holes left" />
                          <div className="mini-film-holes right" />
                        </div>
                      )}

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
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Dải chấm tròn phân trang (Dots Indicator) */}
          <div className="carousel-dots-row" aria-label="Bộ chọn trang theme">
            {sortedThemes.map((theme, index) => (
              <button
                key={theme.id}
                className={`carousel-dot ${index === activeSlideIndex ? 'active' : ''}`}
                onClick={() => handleDotClick(index)}
                title={theme.name}
                aria-label={`Chọn ${theme.name}`}
              />
            ))}
          </div>
        </section>
      </main>

      {/* ── Bottom Nav: Selfbooth có nút Quay lại setup, Photobooth không quay lại màn chụp ── */}
      <footer className="theme-bottom-nav">
        {isSelfbooth ? (
          <button
            className="btn-theme-back"
            onClick={() => setScreen('selfbooth-setup')}
            title="Quay lại"
            aria-label="Quay lại"
          >
            Quay lại
          </button>
        ) : (
          <div className="bottom-nav-spacer" />
        )}
        <button
          className="btn-theme-proceed"
          onClick={() => {
            if (isSelfbooth) {
              setScreen('capture')
            } else {
              setScreen('select-filter')
            }
          }}
          title="Tiếp tục"
          aria-label="Tiếp tục"
        >
          Tiếp tục
        </button>
      </footer>
    </div>
  )
}
