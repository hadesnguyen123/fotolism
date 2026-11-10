import { useState, useRef, useEffect } from 'react'
import {
    useAppStore,
    STICKER_LIBRARY,
    type StickerCategory,
} from '../store/appStore'
import { DEFAULT_EVENT_NAME } from '../lib/constants'
import './StickerScreen.css'

export default function StickerScreen() {
    const {
        session,
        setScreen,
        selectedTheme,
        selectedLayout,
        eventConfig,
        placedStickers,
        addSticker,
        updateSticker,
        removeSticker,
        clearStickers,
    } = useAppStore()

    const categories: StickerCategory[] = [
        'Heart',
        'Cute',
        'Emoji',
        'Event',
        'Styles',
    ]
    const [activeCategory, setActiveCategory] =
        useState<StickerCategory>('Heart')
    const [activeStickerId, setActiveStickerId] = useState<string | null>(null)
    const [isDragging, setIsDragging] = useState(false)

    const frameRef = useRef<HTMLDivElement>(null)
    const dragRef = useRef<{
        id: string
        startX: number
        startY: number
        originX: number
        originY: number
        moved: boolean
    } | null>(null)

    const photos = session?.photos || []
    const displayedPhotos = photos.slice(0, selectedLayout.photosCount)
    const filteredStickers = STICKER_LIBRARY.filter(
        (s) => s.category === activeCategory
    )
    const isGrid =
        selectedLayout.previewType === '4_grid' ||
        selectedLayout.previewType === '6_grid' ||
        selectedLayout.previewType === '8_grid'

    // Bắt đầu kéo sticker (hỗ trợ cả chuột và màn hình cảm ứng qua Pointer Events)
    const handleStickerPointerDown = (
        e: React.PointerEvent<HTMLDivElement>,
        stickerId: string,
        currentX: number,
        currentY: number
    ) => {
        e.stopPropagation()
        setActiveStickerId(stickerId)

        dragRef.current = {
            id: stickerId,
            startX: e.clientX,
            startY: e.clientY,
            originX: currentX,
            originY: currentY,
            moved: false,
        }

        const handlePointerMove = (moveEvt: PointerEvent) => {
            if (!frameRef.current || !dragRef.current) return
            const rect = frameRef.current.getBoundingClientRect()
            if (rect.width === 0 || rect.height === 0) return

            const deltaX = moveEvt.clientX - dragRef.current.startX
            const deltaY = moveEvt.clientY - dragRef.current.startY

            if (!dragRef.current.moved && Math.hypot(deltaX, deltaY) > 3) {
                dragRef.current.moved = true
                setIsDragging(true)
            }

            const deltaXPercent = (deltaX / rect.width) * 100
            const deltaYPercent = (deltaY / rect.height) * 100

            const nextX = Math.max(
                4,
                Math.min(96, dragRef.current.originX + deltaXPercent)
            )
            const nextY = Math.max(
                4,
                Math.min(96, dragRef.current.originY + deltaYPercent)
            )

            updateSticker(dragRef.current.id, {
                x: Math.round(nextX * 10) / 10,
                y: Math.round(nextY * 10) / 10,
            })
        }

        const handlePointerUp = () => {
            setIsDragging(false)
            dragRef.current = null
            window.removeEventListener('pointermove', handlePointerMove)
            window.removeEventListener('pointerup', handlePointerUp)
            window.removeEventListener('pointercancel', handlePointerUp)
        }

        window.addEventListener('pointermove', handlePointerMove)
        window.addEventListener('pointerup', handlePointerUp)
        window.addEventListener('pointercancel', handlePointerUp)
    }

    // Dọn dẹp listener nếu component unmount trong lúc đang kéo
    useEffect(() => {
        return () => {
            setIsDragging(false)
            dragRef.current = null
        }
    }, [])

    const handleAddSticker = (icon: string) => {
        const id = addSticker(icon)
        setActiveStickerId(id)
    }

    return (
        <div
            className="sticker-screen-container"
            id="sticker-select-screen"
            onClick={() => setActiveStickerId(null)}
        >
            {/* Title */}
            <div className="screen-title-banner">
                <div className="title-bubble-badge">CHỌN STICKER TRANG TRÍ</div>
            </div>

            <div className="sticker-main-split">
                {/* Left Side: Photo Strip with placed Stickers */}
                <div className="sticker-canvas-column">
                    <div
                        ref={frameRef}
                        className="sticker-interactive-frame"
                        style={{
                            background:
                                selectedTheme.bgGradient ||
                                selectedTheme.bgColor,
                            borderColor: selectedTheme.borderColor,
                        }}
                        onClick={(e) => {
                            if (e.target === e.currentTarget) {
                                setActiveStickerId(null)
                            }
                        }}
                    >
                        {/* Render placed stickers */}
                        {placedStickers.map((st) => {
                            const isActive = activeStickerId === st.id
                            const scale = st.scale || 1
                            const rotation = st.rotation || 0

                            return (
                                <div
                                    key={st.id}
                                    className={`placed-sticker-element ${isActive ? 'active' : ''} ${
                                        isDragging && isActive ? 'dragging' : ''
                                    }`}
                                    style={{
                                        left: `${st.x}%`,
                                        top: `${st.y}%`,
                                        transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${scale})`,
                                    }}
                                    onPointerDown={(e) =>
                                        handleStickerPointerDown(
                                            e,
                                            st.id,
                                            st.x,
                                            st.y
                                        )
                                    }
                                    title="Chạm và kéo để di chuyển vị trí"
                                >
                                    <span className="placed-sticker-icon">
                                        {st.icon}
                                    </span>

                                    {/* Nút điều khiển khi đang chọn sticker */}
                                    {isActive && !isDragging && (
                                        <div
                                            className="sticker-controls-overlay"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {/* Xoay +30 độ */}
                                            <button
                                                type="button"
                                                className="sticker-ctrl-btn btn-rot"
                                                title="Xoay sticker (+30°)"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    updateSticker(st.id, {
                                                        rotation:
                                                            (rotation + 30) %
                                                            360,
                                                    })
                                                }}
                                            >
                                                ↻
                                            </button>

                                            {/* Xóa sticker */}
                                            <button
                                                type="button"
                                                className="sticker-ctrl-btn btn-del"
                                                title="Xóa sticker này"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    removeSticker(st.id)
                                                    setActiveStickerId(null)
                                                }}
                                            >
                                                ✕
                                            </button>

                                            {/* Phóng to */}
                                            <button
                                                type="button"
                                                className="sticker-ctrl-btn btn-scale-up"
                                                title="Phóng to"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    updateSticker(st.id, {
                                                        scale: Math.min(
                                                            2.4,
                                                            Math.round(
                                                                (scale + 0.2) *
                                                                    10
                                                            ) / 10
                                                        ),
                                                    })
                                                }}
                                            >
                                                +
                                            </button>

                                            {/* Thu nhỏ */}
                                            <button
                                                type="button"
                                                className="sticker-ctrl-btn btn-scale-down"
                                                title="Thu nhỏ"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    updateSticker(st.id, {
                                                        scale: Math.max(
                                                            0.6,
                                                            Math.round(
                                                                (scale - 0.2) *
                                                                    10
                                                            ) / 10
                                                        ),
                                                    })
                                                }}
                                            >
                                                −
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )
                        })}

                        <div
                            className={
                                isGrid
                                    ? 'grid-preview-slots'
                                    : 'strip-preview-slots'
                            }
                            style={{ pointerEvents: 'none' }}
                        >
                            {displayedPhotos.map((photo, index) => (
                                <div
                                    key={photo.id || index}
                                    className="theme-slot-photo"
                                >
                                    {photo.compositedPath ? (
                                        <img
                                            src={photo.compositedPath}
                                            alt={`Photo ${index + 1}`}
                                            draggable={false}
                                        />
                                    ) : (
                                        <div
                                            style={{
                                                color: '#fff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                height: '100%',
                                            }}
                                        >
                                            📸 Ảnh {index + 1}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Strip Branding Footer */}
                        <div
                            style={{
                                textAlign: 'center',
                                marginTop: 4,
                                pointerEvents: 'none',
                            }}
                        >
                            <span
                                style={{
                                    fontFamily: 'var(--font-display)',
                                    fontWeight: 900,
                                    fontSize: '0.85rem',
                                    letterSpacing: '1px',
                                    color: selectedTheme.textColor,
                                    textTransform: 'uppercase',
                                }}
                            >
                                {eventConfig.eventName || DEFAULT_EVENT_NAME}
                            </span>
                        </div>
                    </div>

                    {/* Quick guide & clear buttons */}
                    <div className="sticker-action-hints">
                        <span className="sticker-guide-text">
                            ✨ <b>Chạm & kéo</b> để di chuyển | <b>↻</b> xoay |{' '}
                            <b>+ / −</b> kích cỡ | <b>✕</b> xóa
                        </span>
                        {placedStickers.length > 0 && (
                            <button
                                className="btn btn-ghost"
                                style={{
                                    fontSize: '0.78rem',
                                    padding: '4px 10px',
                                    color: '#e11d48',
                                    fontWeight: 600,
                                }}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    clearStickers()
                                    setActiveStickerId(null)
                                }}
                            >
                                🗑️ Xóa hết ({placedStickers.length})
                            </button>
                        )}
                    </div>
                </div>

                {/* Right Side: Sticker Categories & Cards Grid */}
                <div
                    className="sticker-selector-panel"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="sticker-tabs-nav">
                        <button
                            className="theme-nav-arrow"
                            onClick={() => {
                                const idx = categories.indexOf(activeCategory)
                                setActiveCategory(
                                    categories[
                                        (idx - 1 + categories.length) %
                                            categories.length
                                    ]
                                )
                            }}
                        >
                            ‹
                        </button>

                        {categories.map((cat) => (
                            <button
                                key={cat}
                                className={`sticker-tab-pill ${activeCategory === cat ? 'active' : ''}`}
                                onClick={() => setActiveCategory(cat)}
                            >
                                {cat}
                            </button>
                        ))}

                        <button
                            className="theme-nav-arrow"
                            onClick={() => {
                                const idx = categories.indexOf(activeCategory)
                                setActiveCategory(
                                    categories[(idx + 1) % categories.length]
                                )
                            }}
                        >
                            ›
                        </button>
                    </div>

                    <div className="stickers-grid-cards">
                        {filteredStickers.map((st) => (
                            <div
                                key={st.id}
                                className="sticker-option-card"
                                onClick={() => handleAddSticker(st.icon)}
                                title="Bấm để dán vào ảnh"
                            >
                                <span className="sticker-big-icon">
                                    {st.icon}
                                </span>
                                <span className="sticker-label-text">
                                    {st.label}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Bottom Bar: Only Single Primary Action ── */}
            <footer
                className="sticker-bottom-bar"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    className="btn-proceed-filter"
                    onClick={() => setScreen('review')}
                >
                    <span>Tiếp Tục & In Ảnh</span>
                </button>
            </footer>
        </div>
    )
}
