import React from 'react'
import { Move } from 'lucide-react'
import type {
    ThemeItem,
    FrameSize,
    ColorFilterItem,
} from '../../store/appStore'
import { resolveAssetUrl } from '../../lib/constants'
import type { SlotOffset } from '../../lib/canvasCompositor'

interface InteractiveStripPreviewProps {
    selectedFrameSize: FrameSize
    selectedTheme: ThemeItem | null
    selectedFilter: ColorFilterItem | null
    is2x6: boolean
    frameSlots: any[]
    photos: any[]
    slotOffsets: SlotOffset[]
    activeDragIndex: number | null
    onPointerDown: (
        index: number,
        e: React.PointerEvent<HTMLDivElement>
    ) => void
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void
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
    onPointerDown,
    onPointerMove,
    onPointerUp,
}) => {
    return (
        <div className="interactive-strip-preview-wrapper animate-pop">
            <div className="strip-reposition-banner">
                <Move size={15} />
                <span>Chạm & kéo ảnh trong từng ô để cân chỉnh vị trí</span>
            </div>

            <div
                className={`interactive-strip-preview ${
                    selectedFrameSize === '2x6'
                        ? 'strip-2x6-view'
                        : 'postcard-4x6-view'
                }`}
                style={{
                    position: 'relative',
                    aspectRatio: is2x6 ? '600 / 1800' : '1200 / 1800',
                    background:
                        selectedTheme?.bgGradient ||
                        selectedTheme?.bgColor ||
                        '#FAF6F0',
                    borderRadius: '14px',
                    boxShadow: '0 16px 45px rgba(0, 0, 0, 0.16)',
                    overflow: 'hidden',
                }}
            >
                {frameSlots.map((slot: any, idx: number) => {
                    const photo = photos[idx]
                    const photoSrc =
                        photo?.compositedPath ||
                        photo?.enhancedPath ||
                        photo?.rawPath ||
                        ''
                    const offset = slotOffsets[idx] || { x: 0, y: 0 }
                    const photoWidthRatio = 16 / 9 / (slot.aspectRatio || 1.5)

                    return (
                        <div
                            key={idx}
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
                        >
                            {photoSrc && (
                                <img
                                    src={photoSrc}
                                    alt={`Slot ${idx + 1}`}
                                    draggable={false}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        height: '100%',
                                        width: `${Math.max(100, photoWidthRatio * 100)}%`,
                                        maxWidth: 'none',
                                        left: `${50 - photoWidthRatio * 50 + offset.x * (photoWidthRatio - 1) * 50}%`,
                                        objectFit: 'cover',
                                        pointerEvents: 'none',
                                        filter:
                                            selectedFilter?.cssFilter || 'none',
                                        transition:
                                            activeDragIndex === idx
                                                ? 'none'
                                                : 'left 0.12s ease-out',
                                    }}
                                />
                            )}
                            <div className="slot-drag-handle-badge">
                                <Move size={14} />
                            </div>
                        </div>
                    )
                })}

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
