import { useAppStore, ALL_LAYOUTS, type GridLayoutItem, type FrameSize } from '../store/appStore'
import { DEFAULT_PRICE_2X6, DEFAULT_PRICE_4X6 } from '../lib/constants'
import { Check } from 'lucide-react'
import PhotoboothHeader from '../components/PhotoboothHeader'
import './SelectLayoutScreen.css'

interface UnifiedLayoutConfig {
  layout: GridLayoutItem
  frameSize: FrameSize
  tag: string
  defaultCopies: number
}

export default function SelectLayoutScreen() {
  const {
    setScreen,
    selectedLayout,
    eventConfig,
  } = useAppStore()

  const price2x6 = eventConfig.price2x6 || DEFAULT_PRICE_2X6
  const price4x6 = eventConfig.price4x6 || DEFAULT_PRICE_4X6

  const formatVND = (num: number) =>
    new Intl.NumberFormat('vi-VN').format(num) + ' đ'

  // Hàng 1: 3 bố cục (Strip 4, Strip 3, Grid 6)
  const row1Configs: UnifiedLayoutConfig[] = [
    {
      layout: ALL_LAYOUTS[4].find((l) => l.id === '4_strip_classic') || ALL_LAYOUTS[4][0],
      frameSize: '2x6',
      tag: 'Khổ nhỏ 2×6',
      defaultCopies: 2,
    },
    {
      layout: ALL_LAYOUTS[3].find((l) => l.id === '3_vertical_strip') || ALL_LAYOUTS[3][0],
      frameSize: '2x6',
      tag: 'Khổ nhỏ 2×6',
      defaultCopies: 2,
    },
    {
      layout: ALL_LAYOUTS[6].find((l) => l.id === '6_grid_2x3') || ALL_LAYOUTS[6][0],
      frameSize: '4x6',
      tag: 'Khổ lớn 4×6',
      defaultCopies: 1,
    },
  ]

  // Hàng 2: 2 bố cục căn giữa (Grid 4, Grid 9)
  const row2Configs: UnifiedLayoutConfig[] = [
    {
      layout: ALL_LAYOUTS[4].find((l) => l.id === '4_grid_2x2') || ALL_LAYOUTS[4][1],
      frameSize: '4x6',
      tag: 'Khổ lớn 4×6',
      defaultCopies: 1,
    },
    {
      layout: (ALL_LAYOUTS[9] && ALL_LAYOUTS[9][0]) || {
        id: '9_grid_3x3',
        name: '9 ảnh Lưới Vuông',
        photosCount: 9,
        cols: 3,
        rows: 3,
        strip: false,
        description: '9 ảnh lưới 3 cột 3 hàng (4x6)',
        previewType: '9_grid',
      },
      frameSize: '4x6',
      tag: 'Khổ lớn 4×6',
      defaultCopies: 1,
    },
  ]

  function handleSelect(config: UnifiedLayoutConfig) {
    useAppStore.setState({
      selectedFrameSize: config.frameSize,
      selectedLayout: config.layout,
      selectedCategory: (config.layout.photosCount as any) || 4,
      selectedCopies: config.defaultCopies,
    })
  }

  function handleProceed() {
    if (eventConfig.paymentRequiredForPhotobooth) {
      setScreen('payment')
    } else {
      setScreen('capture')
    }
  }

  function renderLayoutItem(config: UnifiedLayoutConfig) {
    const isSelected = selectedLayout.id === config.layout.id
    const price = config.frameSize === '2x6' ? price2x6 : price4x6
    const is2x6 = config.frameSize === '2x6'

    return (
      <div
        key={config.layout.id}
        className={`poster-layout-item ${isSelected ? 'selected' : ''}`}
        onClick={() => handleSelect(config)}
        role="button"
        tabIndex={0}
      >
        {/* Khung Mockup Đồ Họa 2 Lớp (Mô phỏng 100% Ảnh In Thật 2x6 & 4x6) */}
        <div className={`poster-frame-wrapper ${is2x6 ? 'ratio-2x6' : 'ratio-4x6'}`}>
          {/* Tấm Nghiêng Màu Nhạt Phía Sau (Bản in thứ 2 trong gói 1+1) */}
          <div className="poster-sheet-back">
            <div
              className="poster-slots-grid"
              style={{
                gridTemplateColumns: `repeat(${config.layout.cols}, 1fr)`,
                gridTemplateRows: `repeat(${config.layout.rows}, 1fr)`,
              }}
            >
              {Array.from({ length: config.layout.photosCount }).map((_, i) => (
                <div key={i} className="poster-slot-back" />
              ))}
            </div>
            <div className="poster-footer-back">
              <span className="poster-brand-text">fotolism</span>
            </div>
          </div>

          {/* Tấm Chính Phía Trước (Khung Ngoài In Thật + Phần Trống Chèn Ảnh) */}
          <div className="poster-sheet-front">
            <div
              className="poster-slots-grid"
              style={{
                gridTemplateColumns: `repeat(${config.layout.cols}, 1fr)`,
                gridTemplateRows: `repeat(${config.layout.rows}, 1fr)`,
              }}
            >
              {Array.from({ length: config.layout.photosCount }).map((_, i) => (
                <div key={i} className="poster-slot-front" />
              ))}
            </div>
            <div className="poster-footer-front">
              <span className="poster-brand-text">fotolism</span>
            </div>
          </div>

          {isSelected && (
            <div className="poster-check-badge">
              <Check size={20} strokeWidth={3.5} />
            </div>
          )}
        </div>

        {/* Nút Giá Tiền Nâu Đậm Dạng Khối Đúng Mẫu Bảng Giá */}
        <div className="poster-price-btn">
          <span>{formatVND(price).replace(' đ', '')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="layout-poster-container" id="select-layout-screen">
      {/* ── Top Header: fotolism + 3 Bước (1. Chọn layout active) ── */}
      <PhotoboothHeader currentStep={1} />

      {/* ── Showcase Bảng Giá: 2 Hàng (Hàng trên 3, Hàng dưới 2) ── */}
      <main className="poster-board-main">
        {/* Hàng 1: 3 Bố Cục */}
        <div className="poster-board-row row-3">
          {row1Configs.map(renderLayoutItem)}
        </div>

        {/* Hàng 2: 2 Bố Cục Căn Giữa */}
        <div className="poster-board-row row-2">
          {row2Configs.map(renderLayoutItem)}
        </div>
      </main>

      {/* ── Footer: Nút Quay Lại (Góc dưới trái) + Banner Giá In Thêm (Giữa) + Nút Tiếp Tục (Góc dưới phải) ── */}
      <footer className="poster-footer-section">
        {/* Nút Quay Lại góc dưới bên tay trái (cách lề 100px) */}
        <button
          className="kiosk-nav-btn btn-nav-back"
          onClick={() => setScreen('idle')}
          title="Quay lại"
          aria-label="Quay lại"
        >
          Quay lại
        </button>

        {/* Banner Giá In Thêm ở giữa (Căn chỉnh cân đối trọn vẹn bên trong nền hồng) */}
        <div className="poster-extra-banner">
          <span className="extra-banner-label">GIÁ IN THÊM:</span>
          <span className="extra-banner-vbar" />
          <div className="extra-banner-val-group">
            <span className="extra-item">Khổ 2×6: <strong>+30K / 2 dải</strong></span>
            <span className="extra-banner-dot">•</span>
            <span className="extra-item">Khổ 4×6: <strong>+30K / 1 tấm</strong></span>
          </div>
        </div>

        {/* Nút Tiếp Tục góc dưới bên tay phải (cách lề 100px) */}
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
