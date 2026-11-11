import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useAppStore, THEME_OPTIONS, type ThemeItem } from '../store/appStore'
import { Layers } from 'lucide-react'
import { BRAND_LOGO_SRC } from '../lib/brandLogo'
import { FrameCarousel } from '../components/theme/FrameCarousel'
import { FilterSelectorDeck } from '../components/theme/FilterSelectorDeck'
import { InteractiveStripPreview } from '../components/theme/InteractiveStripPreview'
import type { SlotOffset } from '../lib/canvasCompositor'
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
        slotOffsets: storeSlotOffsets,
        setSlotOffsets: setStoreSlotOffsets,
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
        if (
            sortedThemes.length > 0 &&
            !sortedThemes.some((t) => t.id === selectedTheme.id)
        ) {
            selectTheme(sortedThemes[0])
            setActiveSlideIndex(0)
        }
    }, [
        selectedLayout.id,
        selectedFrameSize,
        selectTheme,
        selectedTheme.id,
        sortedThemes,
    ])

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
    const displayedPhotos =
        photos.length > 0
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

    const is2x6 = (selectedTheme?.frameSize || selectedFrameSize) === '2x6'
    const totalW = selectedTheme?.canvasWidth || (is2x6 ? 600 : 1200)
    const totalH = selectedTheme?.canvasHeight || 1800

    const initialOffsets =
        session?.slotOffsets ||
        storeSlotOffsets ||
        Array(photosCount).fill({ x: 0, y: 0 })

    const [slotOffsets, setSlotOffsetsState] = useState<SlotOffset[]>(() =>
        initialOffsets.length >= photosCount
            ? initialOffsets
            : Array.from({ length: photosCount }).map(
                  (_, i) => initialOffsets[i] || { x: 0, y: 0 }
              )
    )
    const slotOffsetsRef = useRef<SlotOffset[]>(slotOffsets)
    slotOffsetsRef.current = slotOffsets

    const frameSlots = useMemo(() => {
        if (selectedTheme?.slots && selectedTheme.slots.length > 0) {
            return selectedTheme.slots.map(
                (s: { x: number; y: number; w: number; h: number }) => ({
                    xPercent: (s.x / totalW) * 100,
                    yPercent: (s.y / totalH) * 100,
                    wPercent: (s.w / totalW) * 100,
                    hPercent: (s.h / totalH) * 100,
                    slotW: s.w,
                    slotH: s.h,
                    aspectRatio: s.w / s.h,
                })
            )
        }
        const totalSlots = selectedLayout.photosCount || 4
        const cols = selectedLayout.cols || (is2x6 ? 1 : 2)
        const rows =
            selectedLayout.rows || Math.max(1, Math.ceil(totalSlots / cols))
        const footerHeight = selectedTheme?.hideFooter ? 0 : 150
        const padX = is2x6 ? 36 : 50
        const padTop = 40
        const gap = 20
        const availableHeight = totalH - padTop - footerHeight
        const defW = (totalW - padX * 2 - gap * (cols - 1)) / cols
        const defH = (availableHeight - gap * (rows - 1)) / rows

        return Array.from({ length: totalSlots }).map((_, i) => {
            const colIdx = i % cols
            const rowIdx = Math.floor(i / cols)
            const sx = padX + colIdx * (defW + gap)
            const sy = padTop + rowIdx * (defH + gap)
            return {
                xPercent: (sx / totalW) * 100,
                yPercent: (sy / totalH) * 100,
                wPercent: (defW / totalW) * 100,
                hPercent: (defH / totalH) * 100,
                slotW: defW,
                slotH: defH,
                aspectRatio: defW / defH,
            }
        })
    }, [selectedTheme, selectedLayout, is2x6, totalW, totalH])

    // Cử chỉ chạm & kéo (pan) và mở rộng 2 ngón tay (pinch-to-zoom) trong từng ô slot
    const [activeDragIndex, setActiveDragIndex] = useState<number | null>(null)
    const activePointersRef = useRef<Map<number, { clientX: number; clientY: number }>>(new Map())
    const gestureStateRef = useRef<{
        index: number
        initOffset: SlotOffset
        slotPixelWidth: number
        slotPixelHeight: number
        // 1 finger pan
        startX: number
        startY: number
        // 2 finger pinch & pan
        initialPinchDist: number
        initialScale: number
        initialMidpoint: { x: number; y: number }
    } | null>(null)

    const handleSlotPointerDown = (
        index: number,
        e: React.PointerEvent<HTMLDivElement>
    ) => {
        const target = e.currentTarget
        try {
            target.setPointerCapture(e.pointerId)
        } catch {}

        activePointersRef.current.set(e.pointerId, {
            clientX: e.clientX,
            clientY: e.clientY,
        })

        const rect = target.getBoundingClientRect()
        const currentOffset = slotOffsetsRef.current[index] || { x: 0, y: 0, scale: 1.0 }
        const pointers = Array.from(activePointersRef.current.values())

        if (pointers.length === 1) {
            gestureStateRef.current = {
                index,
                initOffset: { ...currentOffset },
                slotPixelWidth: rect.width,
                slotPixelHeight: rect.height,
                startX: e.clientX,
                startY: e.clientY,
                initialPinchDist: 0,
                initialScale: currentOffset.scale || 1.0,
                initialMidpoint: { x: e.clientX, y: e.clientY },
            }
        } else if (pointers.length >= 2) {
            const p1 = pointers[0]
            const p2 = pointers[1]
            const dist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY)
            const midX = (p1.clientX + p2.clientX) / 2
            const midY = (p1.clientY + p2.clientY) / 2

            gestureStateRef.current = {
                index,
                initOffset: { ...currentOffset },
                slotPixelWidth: rect.width,
                slotPixelHeight: rect.height,
                startX: midX,
                startY: midY,
                initialPinchDist: Math.max(dist, 10),
                initialScale: currentOffset.scale || 1.0,
                initialMidpoint: { x: midX, y: midY },
            }
        }

        setActiveDragIndex(index)
    }

    const handleSlotPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!gestureStateRef.current || activeDragIndex === null) return
        if (!activePointersRef.current.has(e.pointerId)) return

        activePointersRef.current.set(e.pointerId, {
            clientX: e.clientX,
            clientY: e.clientY,
        })

        const {
            index,
            initOffset,
            slotPixelWidth,
            slotPixelHeight,
            startX,
            startY,
            initialPinchDist,
            initialScale,
            initialMidpoint,
        } = gestureStateRef.current

        const sensitivityX = Math.max(slotPixelWidth * 0.45, 40)
        const sensitivityY = Math.max(slotPixelHeight * 0.45, 40)
        const pointers = Array.from(activePointersRef.current.values())

        if (pointers.length === 1) {
            // Kéo 1 ngón: Di chuyển vị trí (Pan)
            const p = pointers[0]
            const dx = p.clientX - startX
            const dy = p.clientY - startY

            const nextX = Math.max(
                -1,
                Math.min(1, initOffset.x + dx / sensitivityX)
            )
            const nextY = Math.max(
                -1,
                Math.min(1, initOffset.y + dy / sensitivityY)
            )

            setSlotOffsetsState((prev) => {
                const next = [...prev]
                next[index] = {
                    ...(next[index] || {}),
                    x: nextX,
                    y: nextY,
                    scale: initOffset.scale || 1.0,
                }
                return next
            })
        } else if (pointers.length >= 2) {
            // Cử chỉ 2 ngón tay: Mở rộng 2 ngón phóng to (Pinch to zoom) & di chuyển
            const p1 = pointers[0]
            const p2 = pointers[1]
            const currentDist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY)
            const scaleFactor = currentDist / Math.max(initialPinchDist, 10)
            const nextScale = Math.max(
                1.0,
                Math.min(3.0, Number((initialScale * scaleFactor).toFixed(2)))
            )

            const currentMidX = (p1.clientX + p2.clientX) / 2
            const currentMidY = (p1.clientY + p2.clientY) / 2
            const midDx = currentMidX - initialMidpoint.x
            const midDy = currentMidY - initialMidpoint.y

            const nextX = Math.max(
                -1,
                Math.min(1, initOffset.x + midDx / sensitivityX)
            )
            const nextY = Math.max(
                -1,
                Math.min(1, initOffset.y + midDy / sensitivityY)
            )

            setSlotOffsetsState((prev) => {
                const next = [...prev]
                next[index] = {
                    x: nextX,
                    y: nextY,
                    scale: nextScale,
                }
                return next
            })
        }
    }

    const handleSlotPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        try {
            e.currentTarget.releasePointerCapture(e.pointerId)
        } catch {}

        activePointersRef.current.delete(e.pointerId)

        if (activePointersRef.current.size === 0) {
            // Khi nhấc tất cả ngón tay ra -> Lưu cấu hình căn chỉnh & zoom
            if (activeDragIndex !== null) {
                const finalOffsets = [...slotOffsetsRef.current]
                gestureStateRef.current = null
                setActiveDragIndex(null)
                setStoreSlotOffsets(finalOffsets)
            }
        } else if (activePointersRef.current.size === 1 && gestureStateRef.current) {
            // Khi nhấc 1 ngón ra nhưng vẫn còn 1 ngón chạm -> Chuyển tiếp mượt sang chế độ kéo 1 ngón không bị giật
            const remaining = Array.from(activePointersRef.current.values())[0]
            const currentIndex = gestureStateRef.current.index
            const currentOffset = slotOffsetsRef.current[currentIndex] || { x: 0, y: 0, scale: 1.0 }

            gestureStateRef.current = {
                ...gestureStateRef.current,
                startX: remaining.clientX,
                startY: remaining.clientY,
                initOffset: { ...currentOffset },
                initialPinchDist: 0,
                initialScale: currentOffset.scale || 1.0,
                initialMidpoint: { x: remaining.clientX, y: remaining.clientY },
            }
        }
    }

    // Hỗ trợ cuộn chuột lăn (Wheel) để phóng to / thu nhỏ khi dùng chuột
    const handleSlotWheel = useCallback(
        (index: number, e: React.WheelEvent<HTMLDivElement>) => {
            const currentOffset =
                slotOffsetsRef.current[index] || { x: 0, y: 0, scale: 1.0 }
            const currentScale = currentOffset.scale || 1.0
            const step = e.deltaY < 0 ? 0.08 : -0.08
            const nextScale = Math.max(
                1.0,
                Math.min(3.0, Number((currentScale + step).toFixed(2)))
            )

            const nextOffsets = [...slotOffsetsRef.current]
            nextOffsets[index] = {
                ...currentOffset,
                scale: nextScale,
            }
            setSlotOffsetsState(nextOffsets)
            setStoreSlotOffsets(nextOffsets)
        },
        [setStoreSlotOffsets]
    )

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
            trackRef.current.scrollBy({
                left: momentumScroll,
                behavior: 'smooth',
            })
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
            const children = Array.from(
                trackRef.current.children
            ) as HTMLElement[]
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
            const selectedIdx = sortedThemes.findIndex(
                (t) => t.id === selectedTheme.id
            )
            if (selectedIdx !== -1) {
                const children = Array.from(
                    trackRef.current.children
                ) as HTMLElement[]
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
            <img
                src={BRAND_LOGO_SRC}
                alt="fotolism"
                className="theme-fixed-brand-logo"
            />

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
                {/* CỘT TRÁI: Dải ảnh in tương tác — Cho phép chạm kéo cân chỉnh vị trí từng ô */}
                <section className="theme-preview-card">
                    <InteractiveStripPreview
                        selectedFrameSize={selectedFrameSize}
                        selectedTheme={selectedTheme}
                        selectedFilter={selectedFilter}
                        is2x6={is2x6}
                        frameSlots={frameSlots}
                        photos={displayedPhotos}
                        slotOffsets={slotOffsets}
                        activeDragIndex={activeDragIndex}
                        eventName={eventConfig.eventName}
                        onPointerDown={handleSlotPointerDown}
                        onPointerMove={handleSlotPointerMove}
                        onPointerUp={handleSlotPointerUp}
                        onWheel={handleSlotWheel}
                    />
                </section>

                {/* CỘT PHẢI: Gồm 2 section (Khung chọn Frame bên trên & Khung chọn Filter bên dưới) */}
                <section className="theme-control-column">
                    <FrameCarousel
                        sortedThemes={sortedThemes}
                        selectedTheme={selectedTheme}
                        selectedLayout={selectedLayout}
                        selectedFrameSize={selectedFrameSize}
                        isGrid={isGrid}
                        activeSlideIndex={activeSlideIndex}
                        trackRef={trackRef}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUpOrLeave={handlePointerUpOrLeave}
                        onTrackScroll={handleTrackScroll}
                        onScrollPrev={handleScrollPrev}
                        onScrollNext={handleScrollNext}
                        onSelectTheme={handleSelectThemeItem}
                        onDotClick={handleDotClick}
                    />

                    <FilterSelectorDeck
                        selectedFilter={selectedFilter}
                        onSelectFilter={selectFilter}
                    />
                </section>
            </main>

            {/* ── Bottom Nav: Nút Tiếp tục (bên phải) ── */}
            <footer className="theme-bottom-nav">
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
                <div
                    className="theme-modal-overlay animate-fade-in"
                    onClick={() => setShowFinishConfirm(false)}
                >
                    <div
                        className="theme-confirm-modal animate-pop"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="theme-modal-badge">✨</div>
                        <h2 className="theme-modal-title">
                            Xác nhận kết thúc và nhận ảnh
                        </h2>
                        <p className="theme-modal-desc">
                            Bạn đã hoàn toàn ưng ý với khung và bộ lọc màu này
                            chưa? Hệ thống sẽ bắt đầu ghép dải ảnh hoàn chỉnh và
                            in ngay sau khi xác nhận.
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
                                    setStoreSlotOffsets(slotOffsetsRef.current)
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
