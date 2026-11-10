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
    { minutes: 5, seconds: 300 },
    { minutes: 7, seconds: 420 },
    { minutes: 10, seconds: 600 },
]

export default function SelfboothSetupScreen() {
    const {
        setScreen,
        selectLayout,
        selectedFilter,
        selectFilter,
        eventConfig,
        setSelfboothDurationSeconds,
    } = useAppStore()

    const videoRef = useRef<HTMLVideoElement>(null)
    const [stream, setStream] = useState<MediaStream | null>(null)

    // Thời gian chụp đã chọn (mặc định 300s = 5p)
    const currentDuration =
        eventConfig.selfboothDurationSeconds ||
        DEFAULT_SELFBOOTH_DURATION_SECONDS
    const [selectedDuration, setSelectedDuration] =
        useState<number>(currentDuration)

    // Đảm bảo ban đầu bộ lọc thuộc 1 trong 3 màu
    useEffect(() => {
        const isOneOfThree = COLOR_FILTERS.some(
            (f) => f.id === selectedFilter?.id
        )
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
                console.warn(
                    'Cannot open preview webcam for SelfboothSetup:',
                    err
                )
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

    return (
        <div className="selfbooth-setup-container" id="selfbooth-setup-screen">
            {/* ── Fixed Brand Logo góc trên bên trái ── */}
            <img
                src={BRAND_LOGO_SRC}
                alt="fotolism"
                className="selfbooth-fixed-brand-logo"
            />

            {/* ── Top Header: Icon Camera + Tiêu Đề Trung Tâm (Không mô tả thừa) ── */}
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
                </div>
            </header>

            {/* ── Main Stage: 2 Cột Cân Đối Hoàn Hảo (Live Camera 3:2 + Tùy Chọn Cài Đặt) ── */}
            <main className="selfbooth-setup-grid">
                {/* CỘT TRÁI: LIVE CAMERA PREVIEW TỈ LỆ CHUẨN 3:2 */}
                <section className="setup-preview-card">
                    <div className="preview-video-container-3-2">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="preview-video-element"
                            style={{
                                filter:
                                    selectedFilter?.cssFilter &&
                                    selectedFilter.cssFilter !== 'none'
                                        ? selectedFilter.cssFilter
                                        : undefined,
                                transform: 'scaleX(-1)', // Kiosk: Gương luôn luôn bật
                            }}
                        />

                        {/* Indicator Tông Màu Đang Áp Dụng (Frosted Glass Badge) */}
                        <div className="preview-filter-indicator">
                            <span
                                className="dot"
                                style={{
                                    background:
                                        selectedFilter?.previewColor ||
                                        '#ffffff',
                                }}
                            />
                            <span>
                                Tông màu:{' '}
                                <strong>
                                    {selectedFilter?.name || 'Tự nhiên'}
                                </strong>
                            </span>
                        </div>
                    </div>
                </section>

                {/* CỘT PHẢI: BỘ ĐIỀU KHIỂN TINH GỌN (3 TÔNG MÀU HÌNH TRÒN + THỜI GIAN 5P 7P 10P) */}
                <section className="setup-controls-card">
                    {/* PHẦN 1: BỘ 3 TÔNG MÀU HÌNH TRÒN ĐƠN GIẢN NHƯ PHOTOBOOTH */}
                    <div className="control-section">
                        <div className="control-section-header">
                            <span className="section-label">Tông màu</span>
                        </div>

                        <div className="setup-filter-circles-row">
                            {COLOR_FILTERS.map((f) => {
                                const isSelected = selectedFilter.id === f.id
                                const circleBg =
                                    f.id === 'natural'
                                        ? '#D8C7B5'
                                        : f.id === 'classic'
                                          ? '#2D2426'
                                          : '#9C5832'
                                return (
                                    <div
                                        key={f.id}
                                        className="setup-filter-circle-col"
                                    >
                                        <button
                                            type="button"
                                            className={`setup-filter-circle-btn ${isSelected ? 'selected' : ''}`}
                                            style={{
                                                backgroundColor: circleBg,
                                            }}
                                            onClick={() =>
                                                handleChooseFilter(f)
                                            }
                                            title={f.name}
                                            aria-label={`Chọn tông màu ${f.name}`}
                                        >
                                            {isSelected && (
                                                <Check
                                                    size={24}
                                                    strokeWidth={3.2}
                                                    color="#FFFFFF"
                                                    style={{
                                                        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))',
                                                    }}
                                                />
                                            )}
                                        </button>
                                        <span className="setup-filter-circle-label">
                                            {f.name}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* PHẦN 2: THỜI GIAN CHỤP (5p, 7p, 10p KHÔNG MÔ TẢ) */}
                    <div className="control-section">
                        <div className="control-section-header">
                            <span className="section-label">
                                Thời gian chụp
                            </span>
                        </div>

                        <div className="durations-minutes-grid">
                            {SELFBOOTH_MINUTES_OPTIONS.map((opt) => {
                                const isSelected =
                                    selectedDuration === opt.seconds
                                return (
                                    <button
                                        key={opt.minutes}
                                        type="button"
                                        className={`duration-card-chip ${isSelected ? 'selected' : ''}`}
                                        onClick={() =>
                                            handleChooseDuration(opt.seconds)
                                        }
                                        aria-label={`Chọn thời gian ${opt.minutes} phút`}
                                    >
                                        {isSelected && (
                                            <div
                                                className="chip-check-badge"
                                                aria-hidden="true"
                                            >
                                                <Check
                                                    size={12}
                                                    strokeWidth={3.2}
                                                />
                                            </div>
                                        )}
                                        <span className="duration-chip-number">
                                            {opt.minutes}p
                                        </span>
                                        <span className="duration-chip-unit">
                                            {opt.minutes} phút
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </section>
            </main>

            {/* ── Footer Navigation Bar: Nút Tiếp Tục (Không có nút Quay lại) ── */}
            <footer
                className="selfbooth-bottom-nav"
                style={{ justifyContent: 'flex-end' }}
            >
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
