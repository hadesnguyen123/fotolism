import React, { useEffect, useMemo, useState } from 'react'
import { Camera } from 'lucide-react'
import type {
    ThemeItem,
    FrameSize,
    ColorFilterItem,
} from '../../store/appStore'
import { resolveAssetUrl, DEFAULT_EVENT_NAME } from '../../lib/constants'
import type { SlotOffset } from '../../lib/canvasCompositor'
import {
    buildPhotoUrlCandidates,
    fromFileUrl,
} from '../../lib/photoboothSlotIntegrity'
import './InteractiveStripPreview.css'

/**
 * Hiển thị ảnh từng ô trong khung với chuỗi dự phòng nhiều tầng:
 * `compositedPath -> enhancedPath -> rawPath`, kết hợp IPC `readImageDataUrl` khi load trực tiếp lỗi.
 */
const SlotPreviewImage: React.FC<{
    photo: any
    alt: string
    style: React.CSSProperties
}> = ({ photo, alt, style }) => {
    const candidates = useMemo(
        () => buildPhotoUrlCandidates(photo),
        [photo?.compositedPath, photo?.enhancedPath, photo?.rawPath]
    )
    const candidatesKey = candidates.join('|')
    const [candidateIdx, setCandidateIdx] = useState(0)
    const [triedDataUrl, setTriedDataUrl] = useState(false)
    const [resolvedSrc, setResolvedSrc] = useState(candidates[0] || '')

    useEffect(() => {
        setCandidateIdx(0)
        setTriedDataUrl(false)
        setResolvedSrc(candidates[0] || '')
    }, [candidatesKey])

    if (!resolvedSrc) return null

    const handleImgError = () => {
        const currentUrl = candidates[candidateIdx] || resolvedSrc
        const localPath = fromFileUrl(currentUrl)
        const readFn =
            (window as any)?.fotolism?.storage?.readImageDataUrl ||
            (window as any)?.electronAPI?.storage?.readImageDataUrl

        if (!triedDataUrl && localPath && typeof readFn === 'function') {
            setTriedDataUrl(true)
            void readFn(currentUrl).then((res: any) => {
                if (res?.success && res?.data) {
                    setResolvedSrc(res.data)
                    return
                }
                const nextIdx = candidateIdx + 1
                if (nextIdx < candidates.length) {
                    setCandidateIdx(nextIdx)
                    setTriedDataUrl(false)
                    setResolvedSrc(candidates[nextIdx])
                }
            })
            return
        }

        const nextIdx = candidateIdx + 1
        if (nextIdx < candidates.length) {
            setCandidateIdx(nextIdx)
            setTriedDataUrl(false)
            setResolvedSrc(candidates[nextIdx])
        }
    }

    return (
        <img
            src={resolvedSrc}
            alt={alt}
            draggable={false}
            onError={handleImgError}
            style={style}
        />
    )
}

export interface InteractiveStripPreviewProps {
    selectedFrameSize: FrameSize
    selectedTheme: ThemeItem | null
    selectedFilter: ColorFilterItem | null
    is2x6: boolean
    frameSlots: any[]
    photos: any[]
    slotOffsets: SlotOffset[]
    activeDragIndex: number | null
    eventName?: string
    onPointerDown: (
        index: number,
        e: React.PointerEvent<HTMLDivElement>
    ) => void
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void
    onWheel?: (
        index: number,
        e: React.WheelEvent<HTMLDivElement>
    ) => void
}

export const InteractiveStripPreview: React.FC<
    InteractiveStripPreviewProps
> = ({
    selectedFrameSize,
    selectedTheme,
    selectedFilter,
    is2x6,
    frameSlots,
    photos,
    slotOffsets,
    activeDragIndex,
    eventName,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
}) => {
        return (
            <div className="interactive-strip-preview-wrapper animate-pop">
                <div className="strip-reposition-banner">
                    <span>Chạm để kéo căn chỉnh vị trí ảnh</span>
                </div>

                <div
                    className={`interactive-strip-preview ${selectedFrameSize === '2x6'
                            ? 'strip-2x6-view'
                            : 'postcard-4x6-view'
                        } ${selectedTheme?.overlayUrl ? 'has-custom-overlay' : ''}`}
                    style={{
                        position: 'relative',
                        aspectRatio: is2x6 ? '1200 / 3600' : '2400 / 3600',
                        background:
                            selectedTheme?.bgGradient ||
                            selectedTheme?.bgColor ||
                            '#FAF6F0',
                        borderRadius: '14px',
                        boxShadow: '0 16px 45px rgba(0, 0, 0, 0.16)',
                        overflow: 'hidden',
                    }}
                >
                    {/* Cuộn phim 35mm: đục lỗ film 2 bên */}
                    {selectedTheme?.id === 'theme_vintage_film' && (
                        <div className="film-live-perforations">
                            <div className="film-holes-strip left" />
                            <div className="film-holes-strip right" />
                        </div>
                    )}

                    {frameSlots.map((slot: any, idx: number) => {
                        const photo = photos[idx]
                        const photoSrc =
                            photo?.compositedPath ||
                            photo?.enhancedPath ||
                            photo?.rawPath ||
                            ''
                        const offset = slotOffsets[idx] || { x: 0, y: 0, scale: 1.0 }
                        const scaleVal = 1.0
                        const zoom = scaleVal * 1.08
                        const maxTranslatePercent = ((zoom - 1) / 2) * 100
                        const clampedX = Math.max(-1, Math.min(1, offset.x || 0))
                        const clampedY = Math.max(-1, Math.min(1, offset.y || 0))

                        return (
                            <div
                                key={photo?.id || idx}
                                className={`interactive-slot-box ${activeDragIndex === idx ? 'is-dragging' : ''}`}
                                style={{
                                    position: 'absolute',
                                    left: `${slot.xPercent}%`,
                                    top: `${slot.yPercent}%`,
                                    width: `${slot.wPercent}%`,
                                    height: `${slot.hPercent}%`,
                                    overflow: 'hidden',
                                    backgroundColor: '#141414',
                                    cursor: 'grab',
                                    touchAction: 'none',
                                    userSelect: 'none',
                                }}
                                onPointerDown={(e) => onPointerDown(idx, e)}
                                onPointerMove={onPointerMove}
                                onPointerUp={onPointerUp}
                                onPointerCancel={onPointerUp}
                                onWheel={(e) => onWheel && onWheel(idx, e)}
                            >
                                {photoSrc ? (
                                    <>
                                        <SlotPreviewImage
                                            photo={photo}
                                            alt={`Slot ${idx + 1}`}
                                            style={{
                                                position: 'absolute',
                                                inset: 0,
                                                width: '100%',
                                                height: '100%',
                                                objectFit: 'cover',
                                                pointerEvents: 'none',
                                                filter:
                                                    selectedFilter?.cssFilter &&
                                                        selectedFilter.cssFilter !== 'none'
                                                        ? selectedFilter.cssFilter
                                                        : undefined,
                                                transform: `translate(${clampedX * maxTranslatePercent}%, ${clampedY * maxTranslatePercent}%) scale(${zoom})`,
                                                transformOrigin: 'center center',
                                                transition:
                                                    activeDragIndex === idx
                                                        ? 'none'
                                                        : 'transform 0.12s ease-out',
                                            }}
                                        />
                                        {Boolean(selectedFilter?.hasGrain) && (
                                            <div className="retro-film-grain-overlay" />
                                        )}
                                    </>
                                ) : (
                                    <div className="theme-slot-placeholder">
                                        <Camera
                                            size={16}
                                            strokeWidth={2}
                                            style={{
                                                display: 'inline-block',
                                                verticalAlign: 'middle',
                                                marginRight: 4,
                                            }}
                                        />
                                        <span>Ảnh {idx + 1}</span>
                                    </div>
                                )}
                            </div>
                        )
                    })}

                    {/* Chân dải ảnh in thương hiệu */}
                    {!selectedTheme?.hideFooter && (
                        <div className="strip-branding-footer">
                            <span style={{ color: selectedTheme?.textColor || '#502a1d' }}>
                                {eventName || DEFAULT_EVENT_NAME}
                            </span>
                        </div>
                    )}

                    {/* Lớp khung viền đồ họa PNG overlay */}
                    {selectedTheme?.overlayUrl && (
                        <img
                            src={resolveAssetUrl(selectedTheme.overlayUrl)}
                            alt="Frame Overlay"
                            draggable={false}
                            style={{
                                position: 'absolute',
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'fill',
                                pointerEvents: 'none',
                                zIndex: 10,
                            }}
                        />
                    )}
                </div>
            </div>
        )
    }
