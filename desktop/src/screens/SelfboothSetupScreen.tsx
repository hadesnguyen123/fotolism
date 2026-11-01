import { useState, useEffect, useRef } from 'react'
import {
  useAppStore,
  COLOR_FILTERS,
  type ColorFilterItem,
} from '../store/appStore'
import {
  DEFAULT_SELFBOOTH_DURATION_SECONDS,
} from '../lib/constants'
import { Check } from 'lucide-react'
import './SelfboothSetupScreen.css'

// Thời gian chỉ hiển thị số phút tinh gọn
const SELFBOOTH_MINUTES_OPTIONS = [
  { minutes: 5, seconds: 300, label: '5 Phút' },
  { minutes: 7, seconds: 420, label: '7 Phút' },
  { minutes: 10, seconds: 600, label: '10 Phút' },
]

export default function SelfboothSetupScreen() {
  const {
    setScreen,
    selectedFilter,
    selectFilter,
    eventConfig,
    setSelfboothDurationSeconds,
    mirrorCamera,
  } = useAppStore()

  const videoRef = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)

  // Thời gian chụp đã chọn (mặc định 300s = 5p)
  const currentDuration = eventConfig.selfboothDurationSeconds || DEFAULT_SELFBOOTH_DURATION_SECONDS
  const [selectedDuration, setSelectedDuration] = useState<number>(currentDuration)

  // Đảm bảo ban đầu bộ lọc thuộc 1 trong 3 màu
  useEffect(() => {
    const isOneOfThree = COLOR_FILTERS.some((f) => f.id === selectedFilter?.id)
    if (!isOneOfThree) {
      selectFilter(COLOR_FILTERS[0])
    }
  }, [selectedFilter?.id, selectFilter])

  // Bật camera xem trước thời gian thực tỉ lệ 16:9
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
    setScreen('capture')
  }

  return (
    <div className="selfbooth-setup-container" id="selfbooth-setup-screen">
      {/* ── Top Header: Tiêu đề trung tâm ── */}
      <header className="selfbooth-setup-header">
        <div className="setup-header-center">
          <h1 className="setup-header-title">Thiết Lập Chụp</h1>
        </div>
      </header>

      {/* ── Main Stage: 2 Cột Cân Đối Hoàn Hảo (16:9 Preview + Controls) ── */}
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

            {/* Indicator Tông Màu Đang Áp Dụng */}
            <div className="preview-filter-indicator">
              <span
                className="dot"
                style={{
                  background: selectedFilter?.previewColor || '#ffffff',
                }}
              />
              <span>Màu: <strong>{selectedFilter?.name || 'Tự nhiên'}</strong></span>
            </div>
          </div>
        </section>

        {/* CỘT PHẢI: BỘ ĐIỀU KHIỂN TINH GỌN (3 TÔNG MÀU + THỜI GIAN PHÚT + CTA) */}
        <section className="setup-controls-card">
          {/* PHẦN 1: CHỈ 3 TÔNG MÀU */}
          <div className="control-section">
            <span className="section-label">Tông màu</span>
            <div className="filters-3-grid">
              {COLOR_FILTERS.map((f) => {
                const isActive = selectedFilter.id === f.id
                return (
                  <button
                    key={f.id}
                    type="button"
                    className={`filter-btn-compact ${isActive ? 'active' : ''}`}
                    onClick={() => handleChooseFilter(f)}
                  >
                    <div
                      className="filter-dot"
                      style={{ background: f.previewColor }}
                    />
                    <span className="filter-name">{f.name}</span>
                    {isActive && <Check size={18} className="active-check-icon" strokeWidth={3} />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* PHẦN 2: THỜI GIAN CHỈ ĐỂ PHÚT (5 Phút, 7 Phút, 10 Phút) */}
          <div className="control-section">
            <span className="section-label">Thời gian</span>
            <div className="durations-minutes-grid">
              {SELFBOOTH_MINUTES_OPTIONS.map((opt) => {
                const isSelected = selectedDuration === opt.seconds
                return (
                  <button
                    key={opt.minutes}
                    type="button"
                    className={`duration-btn-compact ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleChooseDuration(opt.seconds)}
                  >
                    <span className="duration-text">{opt.label}</span>
                    {isSelected && <Check size={18} className="active-check-icon" strokeWidth={3} />}
                  </button>
                )
              })}
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer Navigation Bar: Cách lề mặc định 100px ── */}
      <footer className="kiosk-bottom-nav-bar selfbooth-bottom-bar">
        <button
          className="kiosk-nav-btn btn-nav-back"
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
          className="kiosk-nav-btn btn-nav-next"
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
