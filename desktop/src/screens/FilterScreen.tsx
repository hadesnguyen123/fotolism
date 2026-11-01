import { useState } from 'react'
import { useAppStore, COLOR_FILTERS, type ColorFilterItem } from '../store/appStore'
import { DEFAULT_EVENT_NAME } from '../lib/constants'
import { Check, Sparkles, Camera } from 'lucide-react'
import './FilterScreen.css'

export default function FilterScreen() {
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

  const isSelfboothMode = eventConfig.captureMode === 'selfbooth'
  const photos = session?.photos || []
  const displayedPhotos = isSelfboothMode ? photos : photos.slice(0, selectedLayout.photosCount)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0)

  const isGrid =
    selectedLayout.previewType === '4_grid' ||
    selectedLayout.previewType === '6_grid' ||
    selectedLayout.previewType === '8_grid'

  const activeHeroPhoto = displayedPhotos[selectedPhotoIndex] || displayedPhotos[0]

  return (
    <div className="filter-screen-container" id="filter-select-screen">
      {/* ── Top Header ── */}
      <header className="filter-screen-header">
        <div className="filter-header-center">
          <h1 className="filter-header-title">Bộ Lọc Màu</h1>
        </div>
      </header>

      {/* ── Main Split: Xem trước ảnh (Trái) + Bộ Lọc Màu (Phải) ── */}
      <div className="filter-main-split">
        {/* Left Side: Preview */}
        {!isSelfboothMode ? (
          /* CỐ ĐỊNH KÍCH THƯỚC DẢI STRIP PREVIEW CHO PHOTOBOOTH */
          <div className="strip-preview-fixed-column">
            <div
              className={`strip-preview-fixed-frame ${selectedFrameSize === '2x6' ? 'frame-size-2x6' : 'frame-size-4x6'}`}
              style={{
                background: selectedTheme.bgGradient || selectedTheme.bgColor,
                borderColor: selectedTheme.borderColor,
              }}
            >
              <div className={isGrid ? 'grid-preview-slots' : 'strip-preview-slots'}>
                {displayedPhotos.map((photo, index) => (
                  <div key={photo.id || index} className="theme-slot-photo">
                    {photo.compositedPath || photo.enhancedPath || photo.rawPath ? (
                      <img
                        src={photo.compositedPath || photo.enhancedPath || photo.rawPath}
                        alt={`Photo ${index + 1}`}
                        draggable={false}
                        style={{
                          filter: selectedFilter.cssFilter,
                          transition: 'filter 0.25s ease',
                        }}
                      />
                    ) : (
                      <div className="theme-slot-placeholder">
                        <Camera size={16} strokeWidth={2} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} />
                        <span>Ảnh {index + 1}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Strip Branding Footer */}
              <div className="strip-branding-footer">
                <span
                  style={{
                    color: selectedTheme.textColor,
                  }}
                >
                  {eventConfig.eventName || DEFAULT_EVENT_NAME}
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* PREVIEW ẢNH NGUYÊN BẢN TỰ DO CHO SELFBOOTH (KHÔNG KHUNG) */
          <div className="selfbooth-clean-preview-column">
            <div className="selfbooth-hero-photo-card">
              {activeHeroPhoto ? (
                <img
                  src={activeHeroPhoto.compositedPath || activeHeroPhoto.enhancedPath || activeHeroPhoto.rawPath}
                  alt="Hero Preview"
                  className="selfbooth-hero-img"
                  style={{
                    filter: selectedFilter.cssFilter,
                    transition: 'filter 0.25s ease',
                  }}
                />
              ) : (
                <div className="selfbooth-empty-placeholder">
                  <Sparkles size={48} color="#C8B2A4" />
                  <span>Chưa có ảnh nào được ghi nhận</span>
                </div>
              )}
              <div className="selfbooth-photo-index-tag">
                Ảnh #{selectedPhotoIndex + 1} / {displayedPhotos.length}
              </div>
            </div>

            {/* Thumbnail row to switch photo */}
            {displayedPhotos.length > 1 && (
              <div className="selfbooth-preview-thumb-row">
                {displayedPhotos.map((photo, pIdx) => {
                  const isCur = pIdx === selectedPhotoIndex
                  return (
                    <button
                      key={photo.id || pIdx}
                      className={`selfbooth-mini-thumb ${isCur ? 'active' : ''}`}
                      onClick={() => setSelectedPhotoIndex(pIdx)}
                      title={`Xem ảnh #${pIdx + 1}`}
                    >
                      <img
                        src={photo.compositedPath || photo.enhancedPath || photo.rawPath}
                        alt={`Thumb ${pIdx + 1}`}
                        style={{ filter: selectedFilter.cssFilter }}
                      />
                      <span>#{pIdx + 1}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Right Side: Bộ Lọc Màu ── */}
        <div className="filter-selector-panel">
          <div className="filter-list-presets">
            {COLOR_FILTERS.map((filter: ColorFilterItem) => {
              const isSelected = selectedFilter.id === filter.id
              return (
                <div
                  key={filter.id}
                  className={`filter-preset-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => selectFilter(filter)}
                  role="button"
                  tabIndex={0}
                >
                  <div
                    className="filter-card-circle"
                    style={{ background: filter.previewColor }}
                  >
                    {isSelected && (
                      <Check size={18} strokeWidth={3} color={filter.id === 'vintage_noir' ? '#fff' : '#502A1D'} />
                    )}
                  </div>

                  <div className="filter-card-meta">
                    <span className="filter-card-name">{filter.name}</span>
                    <span className="filter-card-tag">{filter.tag}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Bottom Bar: Nút Quay Lại (Góc dưới trái) + Nút Tiếp Tục (Góc dưới phải) ── */}
      <footer className="kiosk-bottom-nav-bar filter-bottom-bar">
        <button
          className="kiosk-nav-btn btn-nav-back"
          onClick={() => setScreen(isSelfboothMode ? 'capture' : 'select-theme')}
          title="Quay lại"
          aria-label="Quay lại"
        >
          Quay lại
        </button>

        <button
          className="kiosk-nav-btn btn-nav-next"
          onClick={() => setScreen('review')}
          title="Tiếp tục"
          aria-label="Tiếp tục"
        >
          Tiếp tục
        </button>
      </footer>
    </div>
  )
}
