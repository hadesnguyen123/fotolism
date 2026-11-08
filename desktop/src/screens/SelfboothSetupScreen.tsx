import { useState, useEffect, useRef } from 'react'
import {
  useAppStore,
  ALL_LAYOUTS,
  COLOR_FILTERS,
  type ColorFilterItem,
} from '../store/appStore'
import { DEFAULT_SELFBOOTH_DURATION_SECONDS } from '../lib/constants'
import { Check } from 'lucide-react'
import { BRAND_LOGO_SRC } from '../lib/brandLogo'
import './SelfboothSetupScreen.css'

// Các mốc thời gian chụp Selfbooth tinh gọn (5, 7, 10 phút)
const SELFBOOTH_MINUTES_OPTIONS = [
  { minutes: 5, seconds: 300, label: '5 Phút', desc: 'Tiêu chuẩn' },
  { minutes: 7, seconds: 420, label: '7 Phút', desc: 'Phổ biến' },
  { minutes: 10, seconds: 600, label: '10 Phút', desc: 'Thoải mái' },
]

export default function SelfboothSetupScreen() {
  const {
    setScreen,
    selectLayout,
    selectedFilter,
    selectFilter,
    eventConfig,
    setSelfboothDurationSeconds,
    mirrorCamera,
  } = useAppStore()

  const videoRef = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)

  // Thời gian chụp đã chọn (mặc định 300s = 5p)
  const currentDuration =
    eventConfig.selfboothDurationSeconds || DEFAULT_SELFBOOTH_DURATION_SECONDS
  const [selectedDuration, setSelectedDuration] = useState<number>(currentDuration)

  // Đảm bảo ban đầu bộ lọc thuộc 1 trong 3 màu
  useEffect(() => {
    const isOneOfThree = COLOR_FILTERS.some((f) => f.id === selectedFilter?.id)
    if (!isOneOfThree) {
      selectFilter(COLOR_FILTERS[0])
    }
  }, [selectedFilter?.id, selectFilter])

  // Bật webcam xem trước thời gian thực tỉ lệ 16:9
  useEffect(() => {
    let activeStream: MediaStream | null = null

    async function initCamera() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: {
            aspectRatio: 16 / 9,
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
          audio: false,
        })
        activeStream = s
        setStream(s)
        if (videoRef.current) {
          videoRef.current.srcObject = s
          videoRef.current.play().catch(() => {})
        }
      } catch (err) {
        console.warn('Cannot open preview webcam for SelfboothSetup:', err)
      }
    }

    initCamera()

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

  function handleChooseFilter(filter: ColorFilterItem) {
    selectFilter(filter)
  }

  function handleChooseDuration(durationSeconds: number) {
    setSelectedDuration(durationSeconds)
    setSelfboothDurationSeconds(durationSeconds)
  }

  function handleStartCapture() {
    setSelfboothDurationSeconds(selectedDuration)
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
    }
    const layouts = ALL_LAYOUTS[4]
    if (layouts && layouts[0]) {
      selectLayout(layouts[0])
    }
    // Bỏ màn chọn frame: trỏ thẳng vào capture
    setScreen('capture')
  }

  // Render SVG Icon đồng bộ với màn Chọn Bộ Lọc Màu
  const renderFilterIcon = (filterId: string) => {
    switch (filterId) {
      case 'normal':
        return (
          <svg width="36" height="36" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <rect x="7" y="9" width="34" height="30" rx="8" fill="#C48E66" />
            <circle cx="17" cy="18" r="3.5" fill="#FFFFFF" />
            <path d="M12 34L20 23L27 30L33 22L38 34H12Z" fill="#FFFFFF" />
          </svg>
        )
      case 'vintage_noir':
        return (
          <svg width="36" height="36" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <circle cx="24" cy="24" r="18" fill="#FFFFFF" stroke="#2D2D2D" strokeWidth="3" />
            <path d="M24 6C14.0589 6 6 14.0589 6 24C6 33.9411 14.0589 42 24 42V6Z" fill="#2D2D2D" />
          </svg>
        )
      case 'retro_90s':
        return (
          <svg width="38" height="38" viewBox="0 0 48 48" fill="none" aria-hidden="true">
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
    <div className="selfbooth-setup-container" id="selfbooth-setup-screen">
      {/* ── Fixed Brand Logo góc trên bên trái ── */}
      <img src={BRAND_LOGO_SRC} alt="fotolism" className="selfbooth-fixed-brand-logo" />

      {/* ── Top Header: Icon Camera + Tiêu Đề Trung Tâm ── */}
      <header className="selfbooth-setup-header">
        <div className="setup-header-center">
          <div className="setup-header-icon-box" aria-hidden="true">
            <svg
              width="38"
              height="38"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#502A1D"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
          </div>
          <h1 className="setup-header-title">Thiết Lập Chụp</h1>
          <p className="setup-header-subtitle">
            Tùy chỉnh tông màu và thời gian phiên chụp Selfbooth của bạn
          </p>
        </div>
      </header>

      {/* ── Main Stage: 2 Cột Cân Đối Hoàn Hảo (Live Camera 16:9 + Tùy Chọn Cài Đặt) ── */}
      <main className="selfbooth-setup-grid">
        {/* CỘT TRÁI: LIVE CAMERA PREVIEW TỈ LỆ CHUẨN 16:9 */}
        <section className="setup-preview-card">
          <div className="preview-video-container-16-9">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="preview-video-element"
              style={{
                filter:
                  selectedFilter?.cssFilter && selectedFilter.cssFilter !== 'none'
                    ? selectedFilter.cssFilter
                    : undefined,
                transform: mirrorCamera ? 'scaleX(-1)' : 'none',
              }}
            />

            {/* Indicator Tông Màu Đang Áp Dụng (Frosted Glass Badge) */}
            <div className="preview-filter-indicator">
              <span
                className="dot"
                style={{
                  background: selectedFilter?.previewColor || '#ffffff',
                }}
              />
              <span>
                Tông màu: <strong>{selectedFilter?.name || 'Tự nhiên'}</strong>
              </span>
            </div>
          </div>
        </section>

        {/* CỘT PHẢI: BỘ ĐIỀU KHIỂN TINH GỌN (3 TÔNG MÀU + THỜI GIAN PHÚT) */}
        <section className="setup-controls-card">
          {/* PHẦN 1: BỘ 3 TÔNG MÀU SANG TRỌNG */}
          <div className="control-section">
            <div className="control-section-header">
              <span className="section-label">Tông màu</span>
              <span className="section-hint">Áp dụng trực tiếp vào ảnh</span>
            </div>

            <div className="filters-3-grid">
              {COLOR_FILTERS.map((f) => {
                const isActive = selectedFilter.id === f.id
                return (
                  <button
                    key={f.id}
                    type="button"
                    className={`filter-card-chip ${isActive ? 'active' : ''}`}
                    onClick={() => handleChooseFilter(f)}
                    aria-label={`Chọn tông màu ${f.name}`}
                  >
                    {isActive && (
                      <div className="chip-check-badge" aria-hidden="true">
                        <Check size={12} strokeWidth={3.2} />
                      </div>
                    )}
                    <div className="filter-chip-icon">{renderFilterIcon(f.id)}</div>
                    <span className="filter-chip-name">{f.name}</span>
                    <span className="filter-chip-tag">{f.tag}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* PHẦN 2: THỜI GIAN CHỈ ĐỂ PHÚT (5 Phút, 7 Phút, 10 Phút) */}
          <div className="control-section">
            <div className="control-section-header">
              <span className="section-label">Thời gian chụp</span>
              <span className="section-hint">Tự do tạo dáng không giới hạn số ảnh</span>
            </div>

            <div className="durations-minutes-grid">
              {SELFBOOTH_MINUTES_OPTIONS.map((opt) => {
                const isSelected = selectedDuration === opt.seconds
                return (
                  <button
                    key={opt.minutes}
                    type="button"
                    className={`duration-card-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleChooseDuration(opt.seconds)}
                    aria-label={`Chọn thời gian ${opt.label}`}
                  >
                    {isSelected && (
                      <div className="chip-check-badge" aria-hidden="true">
                        <Check size={12} strokeWidth={3.2} />
                      </div>
                    )}
                    <span className="duration-chip-number">{opt.minutes}</span>
                    <span className="duration-chip-unit">Phút</span>
                    <span className="duration-chip-desc">{opt.desc}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer Navigation Bar: Nút Quay Lại & Nút Tiếp Tục Không Icon ── */}
      <footer className="selfbooth-bottom-nav">
        <button
          className="btn-selfbooth-back"
          onClick={() => {
            if (stream) {
              stream.getTracks().forEach((t) => t.stop())
            }
            setScreen('idle')
          }}
          title="Quay lại"
          aria-label="Quay lại"
        >
          Quay lại
        </button>

        <button
          className="btn-selfbooth-proceed"
          onClick={handleStartCapture}
          title="Tiếp tục"
          aria-label="Tiếp tục"
        >
          Tiếp tục
        </button>
      </footer>
    </div>
  )
}
