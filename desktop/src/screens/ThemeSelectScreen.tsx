import { useRef, useEffect, useState, useCallback } from 'react'
import { useAppStore, THEME_OPTIONS, COLOR_FILTERS, type ThemeItem, type ColorFilterItem } from '../store/appStore'
import { DEFAULT_EVENT_NAME, resolveAssetUrl } from '../lib/constants'
import { Check, Camera, Layers, Palette, ChevronLeft, ChevronRight } from 'lucide-react'
import { BRAND_LOGO_SRC } from '../lib/brandLogo'
import './ThemeSelectScreen.css'

export default function ThemeSelectScreen() {
  const [showFinishConfirm, setShowFinishConfirm] = useState(false)
  const {
    session,
    setScreen,
    selectedTheme,
    selectTheme,
    selectedLayout,
    selectedFrameSize,
    selectedFilter,
    selectFilter,
    eventConfig,
  } = useAppStore()

  const trackRef = useRef<HTMLDivElement>(null)

  // Danh sách themes lọc theo layout và khổ ảnh hiện tại
  const sortedThemes = THEME_OPTIONS.filter((t) => {
    if (t.layoutId && t.layoutId !== selectedLayout.id) return false
    if (t.frameSize && t.frameSize !== selectedFrameSize) return false
    return true
  })

  // Đảm bảo selectedTheme luôn thuộc danh sách hợp lệ của layout
  useEffect(() => {
    if (sortedThemes.length > 0 && !sortedThemes.some((t) => t.id === selectedTheme.id)) {
      selectTheme(sortedThemes[0])
      setActiveSlideIndex(0)
    }
  }, [selectedLayout.id, selectedFrameSize, selectTheme, selectedTheme.id, sortedThemes])

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

    trackRef.current.style.scrollBehavior = 'auto'
    trackRef.current.classList.add('is-dragging')
  }

  // Xử lý kéo trượt dải khung theo cử chỉ ngón tay
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDown.current || !trackRef.current) return
    const currentX = e.pageX
    const deltaX = currentX - startX.current

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

  // Nút mũi tên Prev / Next
  const handleScrollPrev = () => {
    if (!trackRef.current) return
    trackRef.current.scrollBy({ left: -220, behavior: 'smooth' })
  }

  const handleScrollNext = () => {
    if (!trackRef.current) return
    trackRef.current.scrollBy({ left: 220, behavior: 'smooth' })
  }

  // Chạm vào khung mini để chọn
  const handleSelectThemeItem = (theme: ThemeItem, index: number) => {
    if (hasDragged.current) return
    selectTheme(theme)
    setActiveSlideIndex(index)

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
  }, [selectedTheme.id, sortedThemes])

  return (
    <div className="theme-screen-container" id="theme-select-screen">
      {/* ── Fixed Brand Logo góc trên bên trái ── */}
      <img src={BRAND_LOGO_SRC} alt="fotolism" className="theme-fixed-brand-logo" />

      {/* ── Top Header: Icon Khung + Tiêu đề Trung tâm "Frame & Filter" ── */}
      <header className="theme-screen-header">
        <div className="theme-header-center">
          <div className="theme-header-icon-box" aria-hidden="true">
            <Layers size={32} strokeWidth={2.4} color="#502A1D" />
          </div>
          <h1 className="theme-header-title">Frame &amp; Filter</h1>
        </div>
      </header>

      {/* ── Main 2-Column Split: Live Preview (Trái) + Chọn Frame & Filter (Phải) ── */}
      <main className="theme-main-split">
        {/* CỘT TRÁI: Dải ảnh in hoàn chỉnh kèm ảnh thật của khách và bộ lọc màu */}
        <section className="theme-preview-card">
          <div
            className={`strip-preview-fixed-frame ${
              (selectedTheme.frameSize || selectedFrameSize) === '2x6' ? 'frame-size-2x6' : 'frame-size-4x6'
            } ${selectedTheme.overlayUrl ? 'has-custom-overlay' : ''}`}
            style={{
              background: selectedTheme.overlayUrl ? 'transparent' : (selectedTheme.bgGradient || selectedTheme.bgColor),
              borderColor: selectedTheme.overlayUrl ? 'transparent' : selectedTheme.borderColor,
            }}
          >
            {/* Nếu là cuộn phim 35mm: đục lỗ film 2 bên */}
            {selectedTheme.id === 'theme_vintage_film' && (
              <div className="film-live-perforations">
                <div className="film-holes-strip left" />
                <div className="film-holes-strip right" />
              </div>
            )}

            {/* Các ô chứa ảnh thật của khách (Hỗ trợ tọa độ chuẩn xác theo từng Khung Đồ Họa) */}
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
                      {photo.compositedPath || photo.rawPath ? (
                        <>
                          <img
                            src={photo.compositedPath || photo.rawPath}
                            alt={`Photo ${index + 1}`}
                            style={{
                              borderRadius: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              filter: selectedFilter?.cssFilter && selectedFilter.cssFilter !== 'none' ? selectedFilter.cssFilter : undefined,
                              transition: 'filter 0.25s ease',
                            }}
                          />
                          {(selectedFilter?.id === 'retro_90s' || selectedFilter?.hasGrain) && (
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
                    {photo.compositedPath || photo.rawPath ? (
                      <>
                        <img
                          src={photo.compositedPath || photo.rawPath}
                          alt={`Photo ${index + 1}`}
                          style={{
                            filter: selectedFilter?.cssFilter && selectedFilter.cssFilter !== 'none' ? selectedFilter.cssFilter : undefined,
                            transition: 'filter 0.25s ease',
                          }}
                        />
                        {(selectedFilter?.id === 'retro_90s' || selectedFilter?.hasGrain) && (
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
                src={resolveAssetUrl(selectedTheme.overlayUrl)}
                alt={selectedTheme.name}
                className="theme-frame-overlay-img"
              />
            )}
          </div>
        </section>

        {/* CỘT PHẢI: Gồm 2 section (Khung chọn Frame bên trên & Khung chọn Filter bên dưới) */}
        <section className="theme-control-column">
          {/* ── SECTION 1: CHỌN FRAME ── */}
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
                onClick={handleScrollPrev}
                aria-label="Khung trước"
              >
                <ChevronLeft size={20} strokeWidth={2.6} />
              </button>

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
                onClick={handleScrollNext}
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
                  onClick={() => handleDotClick(index)}
                  title={theme.name}
                  aria-label={`Chọn ${theme.name}`}
                />
              ))}
            </div>
          </div>

          {/* ── SECTION 2: CHỌN FILTER (3 BỘ LỌC MÀU - DẠNG HÌNH TRÒN MÀU SẮC) ── */}
          <div className="theme-filter-card">
            <div className="filter-section-header">
              <div className="carousel-card-title-group">
                <Palette className="control-header-icon" size={20} strokeWidth={2.4} />
                <h2 className="carousel-card-title">Chọn filter</h2>
              </div>
            </div>

            <div className="filter-circles-row" role="radiogroup" aria-label="Chọn bộ lọc màu">
              {COLOR_FILTERS.map((filter: ColorFilterItem) => {
                const isSelected = selectedFilter.id === filter.id
                const circleBg =
                  filter.id === 'normal'
                    ? '#E4D2C3'
                    : filter.id === 'vintage_noir'
                    ? '#262626'
                    : '#96532B'
                return (
                  <button
                    key={filter.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`filter-circle-btn ${isSelected ? 'selected' : ''}`}
                    style={{
                      backgroundColor: circleBg,
                      ['--circle-color' as any]: circleBg,
                    }}
                    onClick={() => selectFilter(filter)}
                    title={filter.name}
                    aria-label={`Bộ lọc ${filter.name}`}
                  >
                    {isSelected && (
                      <Check
                        size={20}
                        strokeWidth={3}
                        color="#FFFFFF"
                        style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))' }}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </section>
      </main>

      {/* ── Bottom Nav: Nút Quay lại (bên trái) & Nút Tiếp tục (bên phải) ── */}
      <footer className="theme-bottom-nav">
        <button
          type="button"
          className="btn-theme-back"
          onClick={() => {
            if (isSelfbooth) {
              setScreen('selfbooth-setup')
            } else {
              setScreen('capture')
            }
          }}
          title="Quay lại"
          aria-label="Quay lại"
        >
          Quay lại
        </button>

        <button
          type="button"
          className="btn-theme-proceed"
          onClick={() => setShowFinishConfirm(true)}
          title="Tiếp tục"
          aria-label="Tiếp tục"
        >
          Tiếp tục
        </button>
      </footer>

      {/* ── MODAL XÁC NHẬN KẾT THÚC & NHẬN ẢNH (FOTOLISM 3.0 WARM LUXURY) ── */}
      {showFinishConfirm && (
        <div className="theme-modal-overlay animate-fade-in" onClick={() => setShowFinishConfirm(false)}>
          <div className="theme-confirm-modal animate-pop" onClick={(e) => e.stopPropagation()}>
            <div className="theme-modal-badge">✨</div>
            <h2 className="theme-modal-title">Xác nhận kết thúc và nhận ảnh</h2>
            <p className="theme-modal-desc">
              Bạn đã hoàn toàn ưng ý với khung và bộ lọc màu này chưa? Hệ thống sẽ bắt đầu ghép dải ảnh hoàn chỉnh và in ngay sau khi xác nhận.
            </p>
            <div className="theme-modal-buttons">
              <button
                type="button"
                className="btn-theme-modal-cancel"
                onClick={() => setShowFinishConfirm(false)}
              >
                Chỉnh sửa thêm
              </button>
              <button
                type="button"
                className="btn-theme-modal-confirm"
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
