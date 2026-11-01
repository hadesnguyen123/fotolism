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

  const photos = session?.photos || []
  const displayedPhotos = photos.slice(0, selectedLayout.photosCount)
  const isGrid =
    selectedLayout.previewType === '4_grid' ||
    selectedLayout.previewType === '6_grid' ||
    selectedLayout.previewType === '8_grid'

  return (
    <div className="theme-screen-container" id="theme-select-screen">
      {/* ── Top Header: Tiêu đề trung tâm ── */}
      <header className="theme-screen-header">
        <div className="theme-header-center">
          <h1 className="theme-header-title">Chọn Frame</h1>
        </div>
      </header>

      {/* ── Main Split: Fixed Strip Preview (Left) + Frame Options (Right) ── */}
      <div className="theme-main-split">
        {/* Left Side: CỐ ĐỊNH KÍCH THƯỚC DẢI STRIP PREVIEW */}
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
                  {photo.compositedPath ? (
                    <img src={photo.compositedPath} alt={`Photo ${index + 1}`} />
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

            {/* Lớp Khung Đồ Họa PNG Trong Suốt (Overlay) */}
            {selectedTheme.overlayUrl && (
              <img
                src={selectedTheme.overlayUrl}
                alt={selectedTheme.name}
                className="theme-frame-overlay-img"
              />
            )}
          </div>
        </div>

        {/* Right Side: Frame Options (Tối giản, Sang trọng) */}
        <div className="frame-selector-panel">
          <div className="frames-grid-cards">
            {THEME_OPTIONS.map((theme: ThemeItem) => {
              const isSelected = selectedTheme.id === theme.id
              return (
                <div
                  key={theme.id}
                  className={`frame-option-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => selectTheme(theme)}
                  role="button"
                  tabIndex={0}
                >
                  <div
                    className="frame-card-preview-thumb"
                    style={{
                      background: theme.bgGradient || theme.bgColor,
                      borderColor: theme.borderColor,
                    }}
                  >
                    {theme.overlayUrl ? (
                      <img src={theme.overlayUrl} alt={theme.name} className="frame-card-thumb-overlay" />
                    ) : (
                      <div className="frame-thumb-inner" />
                    )}
                  </div>

                  <div className="frame-card-meta">
                    <span className="frame-card-name">{theme.name}</span>
                  </div>

                  {isSelected && (
                    <div className="frame-check-badge">
                      <Check size={20} strokeWidth={2.5} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Bottom Bar: Nút Quay Lại (Góc dưới trái) + Nút Tiếp Tục (Góc dưới phải) ── */}
      <footer className="kiosk-bottom-nav-bar theme-bottom-bar">
        <button
          className="kiosk-nav-btn btn-nav-back"
          onClick={() => setScreen('capture')}
          title="Quay lại"
          aria-label="Quay lại"
        >
          Quay lại
        </button>

        <button
          className="kiosk-nav-btn btn-nav-next"
          onClick={() => setScreen('select-filter')}
          title="Tiếp tục"
          aria-label="Tiếp tục"
        >
          Tiếp tục
        </button>
      </footer>
    </div>
  )
}
