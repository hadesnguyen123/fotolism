/**
 * @file SelfboothSetupScreen.tsx
 * Màn hình cấu hình trước khi chụp phòng tự chụp (Selfbooth):
 * chọn tỷ lệ khung ảnh, chọn bộ lọc màu (Nature, B&W, Retro, Snow) và hiển thị thông tin thời gian phiên chụp.
 * Phụ thuộc: react, store/appStore, lib/api.
 */

import { useState, useEffect, useRef } from 'react'
import {
    useAppStore,
    ALL_LAYOUTS,
    SELFBOOTH_FILTERS,
    type ColorFilterItem,
} from '../store/appStore'
import { fotolismApi, isBrowser, mockApi } from '../lib/api'
import { Check } from 'lucide-react'
import { BRAND_LOGO_SRC } from '../lib/brandLogo'
import { CANON_DAEMON_BASE_URL, resolveAssetUrl } from '../lib/constants'
import './SelfboothSetupScreen.css'

export default function SelfboothSetupScreen() {
    const {
        setScreen,
        selectLayout,
        selectedFilter,
        selectFilter,
    } = useAppStore()

    const videoRef = useRef<HTMLVideoElement>(null)
    const [stream, setStream] = useState<MediaStream | null>(null)
    const [isCanonLive, setIsCanonLive] = useState(false)

    const activeFilter =
        SELFBOOTH_FILTERS.find((f) => f.id === selectedFilter?.id) ||
        SELFBOOTH_FILTERS[0]

    // Đảm bảo mặc định chọn một trong 3 filter Nature / B&W / Retro
    useEffect(() => {
        const isValid = SELFBOOTH_FILTERS.some(
            (f) => f.id === selectedFilter?.id
        )
        if (!isValid) {
            selectFilter(SELFBOOTH_FILTERS[0])
        }
    }, [selectedFilter?.id, selectFilter])

    // Ưu tiên Canon Daemon Live View nếu đang hoạt động, fallback sang webcam
    useEffect(() => {
        let activeStream: MediaStream | null = null
        let mounted = true

        async function initCamera() {
            try {
                const apiClient = isBrowser ? mockApi : fotolismApi
                const daemonRes = await apiClient.camera.canonDaemonStatus?.()
                if (mounted && daemonRes?.success && daemonRes.data?.running) {
                    setIsCanonLive(true)
                    return
                }
            } catch {}

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
                if (!mounted) {
                    s.getTracks().forEach((t) => t.stop())
                    return
                }
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
            mounted = false
            if (activeStream) {
                activeStream.getTracks().forEach((t) => t.stop())
            }
        }
    }, [])

    function handleChooseFilter(filter: ColorFilterItem) {
        selectFilter(filter)
    }

    function handleStartCapture() {
        if (stream) {
            stream.getTracks().forEach((t) => t.stop())
        }
        const layouts = ALL_LAYOUTS[4]
        if (layouts && layouts[0]) {
            selectLayout(layouts[0])
        }
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
                    <h1 className="setup-header-title">Chọn filter</h1>
                </div>
            </header>

            {/* ── Main Stage: Bố cục dọc 9:16 — Bộ lọc trên, Preview 3:4 bên dưới ── */}
            <main className="selfbooth-setup-grid">
                {/* PHẦN TRÊN: BỘ 3 FILTER SELFBOOTH (Nature, B&W, Retro) */}
                <section className="setup-controls-card">
                    <div className="control-section">
                        <div className="control-section-header">
                            <span className="section-label">Chọn Filter</span>
                        </div>

                        <div className="setup-filter-circles-row">
                            {SELFBOOTH_FILTERS.map((f) => {
                                const isSelected = activeFilter.id === f.id
                                return (
                                    <div
                                        key={f.id}
                                        className="setup-filter-circle-col"
                                    >
                                        <button
                                            type="button"
                                            className={`setup-filter-circle-btn ${isSelected ? 'selected' : ''}`}
                                            style={{
                                                backgroundColor: f.previewColor,
                                            }}
                                            onClick={() =>
                                                handleChooseFilter(f)
                                            }
                                            title={f.name}
                                            aria-label={`Chọn filter ${f.name}`}
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
                </section>

                {/* PHẦN DƯỚI: LIVE CAMERA PREVIEW TỈ LỆ 3:4 KHỚP LIVE VIEW SELFBOOTH */}
                <section className="setup-preview-card">
                    <div className="preview-video-container-3-2">
                        {isCanonLive && CANON_DAEMON_BASE_URL ? (
                            <img
                                src={`${CANON_DAEMON_BASE_URL}/liveview`}
                                alt="Live View"
                                className="preview-video-element"
                                style={{
                                    filter:
                                        activeFilter.cssFilter !== 'none'
                                            ? activeFilter.cssFilter
                                            : undefined,
                                    transform: 'scaleX(-1)',
                                }}
                            />
                        ) : (
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className="preview-video-element"
                                style={{
                                    filter:
                                        activeFilter.cssFilter !== 'none'
                                            ? activeFilter.cssFilter
                                            : undefined,
                                    transform: 'scaleX(-1)',
                                }}
                            />
                        )}

                        {activeFilter.id === 'snow' && (
                            <img
                                src={resolveAssetUrl('/filters/snow-overlay.png')}
                                alt=""
                                aria-hidden="true"
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    pointerEvents: 'none',
                                    zIndex: 2,
                                }}
                            />
                        )}

                        {/* Indicator Tông Màu Đang Áp Dụng (Frosted Glass Badge) */}
                        <div className="preview-filter-indicator">
                            <span
                                className="dot"
                                style={{
                                    background: activeFilter.previewColor,
                                }}
                            />
                            <span>
                                Bộ lọc:{' '}
                                <strong>{activeFilter.name}</strong>
                            </span>
                        </div>
                    </div>
                </section>
            </main>

            {/* ── Footer Navigation Bar: Nút Tiếp Tục (Căn giữa trên màn dọc) ── */}
            <footer className="selfbooth-bottom-nav">
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
