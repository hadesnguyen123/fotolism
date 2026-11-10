import React from 'react'
import type { CapturedPhoto } from '../../store/appStore'

interface LiveSlotsDockProps {
    totalShots: number
    selectedFrameSize: string
    slots: Array<CapturedPhoto | null>
    retakeSlotIndex: number | null
    justCapturedSlot: number | null
    slotDeleteCounts: Record<number, number>
    isCapturingShot: boolean
    targetSlotDimensions: { w: number; h: number }
    is2x6: boolean
    is9Grid: boolean
    onDeleteSlot: (index: number) => void
    onSelectRetakeSlot: (index: number) => void
}

export const LiveSlotsDock: React.FC<LiveSlotsDockProps> = ({
    totalShots,
    selectedFrameSize,
    slots,
    retakeSlotIndex,
    justCapturedSlot,
    slotDeleteCounts,
    isCapturingShot,
    targetSlotDimensions,
    is2x6,
    is9Grid,
    onDeleteSlot,
    onSelectRetakeSlot,
}) => {
    return (
        <aside className="slots-grid-col-2 right-slots-dock">
            <div
                className={`live-slots-deck vertical-slots-deck ${
                    totalShots >= 6 ? 'multi-col-deck' : ''
                } shots-${totalShots} frame-${selectedFrameSize}`}
            >
                <div
                    className={`live-slots-list ${totalShots >= 6 ? 'slots-grid-2cols' : ''} shots-${totalShots}`}
                >
                    {Array.from({ length: totalShots }).map((_, index) => {
                        const slotItem = slots[index]
                        const isFilled = slotItem !== null
                        const isRetaking = retakeSlotIndex === index
                        const isJustCaptured = justCapturedSlot === index
                        const isCenteredLast = totalShots === 9 && index === 8
                        const deleteCount = slotDeleteCounts[index] || 0
                        const canDelete = deleteCount < 2

                        return (
                            <div
                                key={index}
                                className={`live-slot-thumb slot-ratio-${
                                    is2x6 ? '2x6' : is9Grid ? '4x6-9' : '4x6-4'
                                } ${isFilled ? 'filled' : 'empty'} ${isRetaking ? 'retaking-target' : ''} ${
                                    isJustCaptured ? 'just-captured' : ''
                                } ${isCenteredLast ? 'slot-thumb-centered-last' : ''}`}
                                style={{
                                    aspectRatio: `${targetSlotDimensions.w} / ${targetSlotDimensions.h}`,
                                }}
                                onClick={() => {
                                    if (!isCapturingShot) {
                                        if (isFilled) {
                                            if (canDelete) {
                                                onDeleteSlot(index)
                                            }
                                        } else {
                                            onSelectRetakeSlot(index)
                                        }
                                    }
                                }}
                                title={
                                    isFilled
                                        ? canDelete
                                            ? `Bấm ✕ để xóa ảnh ô ${index + 1} và chụp lại ảnh khác (còn ${2 - deleteCount} lần)`
                                            : `Ô ${index + 1} đã hết 2 lượt xóa chụp lại`
                                        : `Ô ${index + 1} đang chờ chụp`
                                }
                            >
                                {isFilled ? (
                                    <>
                                        <img
                                            src={
                                                slotItem.compositedPath ||
                                                slotItem.rawPath
                                            }
                                            alt={`Slot ${index + 1}`}
                                        />
                                        <span className="slot-index-badge">
                                            {index + 1}
                                        </span>
                                        {!isCapturingShot && canDelete && (
                                            <button
                                                className="slot-delete-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onDeleteSlot(index)
                                                }}
                                                title={`Xóa ảnh ô ${index + 1} để chụp lại (còn ${2 - deleteCount} lần)`}
                                                aria-label={`Xóa ảnh ô ${index + 1}`}
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    <div className="slot-empty-content">
                                        <span className="slot-empty-plus">
                                            +
                                        </span>
                                        <span className="slot-empty-label">
                                            Ô {index + 1}
                                        </span>
                                        {isRetaking && (
                                            <span className="slot-retake-used-tag">
                                                Chụp lại
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>
        </aside>
    )
}
