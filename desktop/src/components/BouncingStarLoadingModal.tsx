/**
 * @file BouncingStarLoadingModal.tsx
 * Thành phần hiển thị trạng thái chờ chuẩn thiết kế Fotolism (ngôi sao xanh nhảy parabol trên nền thẻ nâu `#653125`),
 * dùng thống nhất cho các bước: xử lý ảnh AI, upload ảnh lên Cloud, và in ảnh.
 * Phụ thuộc: react, lucide-react, ./BouncingStarLoadingModal.css.
 */

import React from 'react'
import { RefreshCw } from 'lucide-react'
import './BouncingStarLoadingModal.css'

export interface BouncingStarLoadingModalProps {
    message: string
    errorMessage?: string | null
    onRetry?: () => void
    retryDisabled?: boolean
    inline?: boolean
}

const REFERENCE_ASSET_BASE = `${import.meta.env.BASE_URL}reference-ui/`

export const BouncingStarLoadingModal: React.FC<BouncingStarLoadingModalProps> = ({
    message,
    errorMessage,
    onRetry,
    retryDisabled,
    inline = false,
}) => {
    const card = (
        <div
            className="fotolism-star-loading-card animate-pop"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="fotolism-star-loading-grit" aria-hidden="true">
                <img alt="" src={`${REFERENCE_ASSET_BASE}ap_paper_grit.png`} />
            </div>

            {!errorMessage && (
                <div className="fotolism-star-loading-star" aria-hidden="true">
                    <img alt="" src={`${REFERENCE_ASSET_BASE}p_loading_star.svg`} />
                </div>
            )}

            <p
                className="fotolism-star-loading-text"
                style={
                    errorMessage
                        ? {
                              top: '36%',
                              transform: 'translate(-50%, -50%)',
                              fontSize: 'clamp(20px, 2.6vw, 28px)',
                              letterSpacing: '-0.01em',
                          }
                        : undefined
                }
            >
                {errorMessage || message}
            </p>

            {errorMessage && onRetry && (
                <div className="fotolism-star-loading-error-actions">
                    <button
                        type="button"
                        className="fotolism-star-loading-retry-btn"
                        onClick={onRetry}
                        disabled={retryDisabled}
                    >
                        <RefreshCw size={18} />
                        <span>{retryDisabled ? 'Đang thử lại...' : 'Thử lại'}</span>
                    </button>
                </div>
            )}
        </div>
    )

    if (inline) return card

    return <div className="fotolism-star-loading-overlay animate-fade-in">{card}</div>
}
