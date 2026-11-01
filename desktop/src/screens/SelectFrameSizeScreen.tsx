import { useAppStore, type FrameSize } from '../store/appStore'
import { DEFAULT_PRICE_2X6, DEFAULT_PRICE_4X6 } from '../lib/constants'
import './SelectFrameSizeScreen.css'

export default function SelectFrameSizeScreen() {
  const { setScreen, selectFrameSize, selectedFrameSize, eventConfig } = useAppStore()

  const price2x6 = eventConfig.price2x6 || DEFAULT_PRICE_2X6
  const price4x6 = eventConfig.price4x6 || DEFAULT_PRICE_4X6

  const price2x6Formatted = new Intl.NumberFormat('vi-VN').format(price2x6) + 'đ'
  const price4x6Formatted = new Intl.NumberFormat('vi-VN').format(price4x6) + 'đ'

  function handleChooseSize(size: FrameSize) {
    selectFrameSize(size)
  }

  function handleProceed() {
    setScreen('select-layout')
  }

  return (
    <div className="size-screen-container" id="select-frame-size-screen">
      {/* ── Top Header ── */}
      <header className="size-screen-header">
        <div className="size-header-center">
          <h1 className="size-header-title">Chọn Khổ In</h1>
        </div>
      </header>

      {/* ── 2-Option Cards Grid (Tối giản, Sang trọng, Touch-First) ── */}
      <main className="size-cards-grid">
        {/* Option 1: Strip 2x6 */}
        <div
          className={`size-option-card ${selectedFrameSize === '2x6' ? 'selected' : ''}`}
          onClick={() => handleChooseSize('2x6')}
          role="button"
          tabIndex={0}
        >
          <div className="size-card-header">
            <h2 className="card-title-header">Khung 2×6 inch</h2>
            <span className="card-price-pill">{price2x6Formatted}</span>
          </div>

          <div className="size-mockup-wrapper">
            <div className="mockup-strip-2x6">
              <div className="mockup-strip-slot" />
              <div className="mockup-strip-slot" />
              <div className="mockup-strip-slot" />
              <div className="mockup-strip-slot" />
            </div>
            <div className="mockup-strip-2x6 tilted">
              <div className="mockup-strip-slot" />
              <div className="mockup-strip-slot" />
              <div className="mockup-strip-slot" />
              <div className="mockup-strip-slot" />
            </div>
          </div>
        </div>

        {/* Option 2: Postcard 4x6 */}
        <div
          className={`size-option-card ${selectedFrameSize === '4x6' ? 'selected' : ''}`}
          onClick={() => handleChooseSize('4x6')}
          role="button"
          tabIndex={0}
        >
          <div className="size-card-header">
            <h2 className="card-title-header">Khung 4×6 inch</h2>
            <span className="card-price-pill">{price4x6Formatted}</span>
          </div>

          <div className="size-mockup-wrapper">
            <div className="mockup-postcard-4x6">
              <div className="mockup-grid-slot" />
              <div className="mockup-grid-slot" />
              <div className="mockup-grid-slot" />
              <div className="mockup-grid-slot" />
            </div>
          </div>
        </div>
      </main>

      {/* ── Bottom Bar: Nút Quay Lại (Góc dưới trái) + Nút Tiếp Tục (Góc dưới phải) ── */}
      <footer className="kiosk-bottom-nav-bar size-bottom-bar">
        <button
          className="kiosk-nav-btn btn-nav-back"
          onClick={() => setScreen('idle')}
          title="Quay lại"
          aria-label="Quay lại"
        >
          Quay lại
        </button>

        <button
          className="kiosk-nav-btn btn-nav-next"
          onClick={handleProceed}
          title="Tiếp tục"
          aria-label="Tiếp tục"
        >
          Tiếp tục
        </button>
      </footer>
    </div>
  )
}
