/**
 * @file CompareViewer.tsx
 * Khu vực hiển thị ảnh trung tâm hỗ trợ kéo thả import, so sánh Trước/Sau
 * (Split Slider, Song song, Soi gốc), zoom và chấm mẫu cân bằng trắng.
 */
import React, { useRef, useState } from 'react'
import {
  Columns2,
  Eye,
  ImagePlus,
  Loader2,
  Maximize2,
  SplitSquareHorizontal,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { CompareMode, EnhanceResultInfo, UploadedImageInfo } from '../types'

interface CompareViewerProps {
  imageInfo: UploadedImageInfo | null
  enhanceResult: EnhanceResultInfo | null
  compareMode: CompareMode
  zoom: number
  isProcessing: boolean
  isDirty: boolean
  isPickingWb: boolean
  onChangeCompareMode: (mode: CompareMode) => void
  onChangeZoom: (zoom: number) => void
  onUploadFile: (file: File) => void
  onPickWbPoint: (normX: number, normY: number) => void
}

export const CompareViewer: React.FC<CompareViewerProps> = ({
  imageInfo,
  enhanceResult,
  compareMode,
  zoom,
  isProcessing,
  isDirty,
  isPickingWb,
  onChangeCompareMode,
  onChangeZoom,
  onUploadFile,
  onPickWbPoint,
}) => {
  const [splitPos, setSplitPos] = useState(50)
  const [isDraggingSplit, setIsDraggingSplit] = useState(false)
  const [holdOriginal, setHoldOriginal] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const stageImageRef = useRef<HTMLDivElement>(null)

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    onUploadFile(files[0])
  }

  const updateSplitFromClientX = (clientX: number) => {
    const el = stageImageRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return
    const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100))
    setSplitPos(pct)
  }

  const handleImageClickForWb = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPickingWb || !stageImageRef.current) return
    const rect = stageImageRef.current.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const normX = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const normY = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    onPickWbPoint(normX, normY)
  }

  const showEnhanced = Boolean(enhanceResult?.enhancedUrl)

  return (
    <div
      className="viewer-pane"
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        handleFiles(e.dataTransfer.files)
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />

      <div className="viewer-toolbar">
        <div className="topbar-group">
          <div className="segmented">
            <button
              type="button"
              className={compareMode === 'split' ? 'active' : ''}
              onClick={() => onChangeCompareMode('split')}
              title="Kéo thanh chia đôi Trước / Sau"
            >
              <SplitSquareHorizontal size={13} />
              Split
            </button>
            <button
              type="button"
              className={compareMode === 'side_by_side' ? 'active' : ''}
              onClick={() => onChangeCompareMode('side_by_side')}
              title="Hiển thị song song 2 ảnh"
            >
              <Columns2 size={13} />
              Song song
            </button>
            <button
              type="button"
              className={compareMode === 'after' ? 'active' : ''}
              onClick={() => onChangeCompareMode('after')}
              title="Xem ảnh kết quả"
            >
              <Eye size={13} />
              Kết quả
            </button>
          </div>

          {showEnhanced && (
            <button
              type="button"
              className={`btn btn-sm ${holdOriginal ? 'btn-active' : ''}`}
              onMouseDown={() => setHoldOriginal(true)}
              onMouseUp={() => setHoldOriginal(false)}
              onMouseLeave={() => setHoldOriginal(false)}
              title="Nhấn giữ để xem nhanh ảnh gốc"
            >
              Giữ soi gốc
            </button>
          )}
        </div>

        <div className="topbar-group">
          {isPickingWb && (
            <span style={{ fontSize: 11.5, color: 'var(--accent)', fontWeight: 500 }}>
              Click vào vùng xám/trắng trên ảnh...
            </span>
          )}
          <button type="button" className="btn btn-sm" onClick={() => onChangeZoom(Math.max(0.5, +(zoom - 0.25).toFixed(2)))}>
            <ZoomOut size={13} />
          </button>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, minWidth: 44, textAlign: 'center' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button type="button" className="btn btn-sm" onClick={() => onChangeZoom(Math.min(3, +(zoom + 0.25).toFixed(2)))}>
            <ZoomIn size={13} />
          </button>
          <button type="button" className="btn btn-sm" onClick={() => onChangeZoom(1)} title="Vừa khung">
            <Maximize2 size={12} />
            Fit
          </button>
        </div>
      </div>

      <div
        className="viewer-stage"
        style={{ overflow: zoom > 1 ? 'auto' : 'hidden', cursor: isPickingWb ? 'crosshair' : 'default' }}
        onMouseMove={(e) => {
          if (isDraggingSplit) updateSplitFromClientX(e.clientX)
        }}
        onMouseUp={() => setIsDraggingSplit(false)}
        onMouseLeave={() => setIsDraggingSplit(false)}
      >
        {!imageInfo ? (
          <div
            className={`dropzone ${dragOver ? 'drag-over' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            style={{ cursor: 'pointer' }}
          >
            <ImagePlus size={36} color="var(--accent)" />
            <div style={{ fontSize: 15, fontWeight: 600 }}>Import ảnh để bắt đầu tinh chỉnh AI</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Kéo thả file ảnh vào đây hoặc nhấn để chọn ảnh chân dung (JPG, PNG, WebP).
              Sau khi chọn thông số ưng ý, nhấn <b>Apply</b> để xem kết quả.
            </div>
            <button type="button" className="btn btn-primary" style={{ marginTop: 6 }}>
              Chọn ảnh từ máy
            </button>
          </div>
        ) : compareMode === 'side_by_side' && showEnhanced && !holdOriginal ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 14,
              width: '100%',
              height: '100%',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Ảnh gốc (Before)
              </span>
              <img
                src={imageInfo.originalUrl}
                alt="Original"
                draggable={false}
                style={{
                  maxWidth: `${zoom * 100}%`,
                  maxHeight: `${zoom * 90}%`,
                  objectFit: 'contain',
                  borderRadius: 6,
                  boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Sau AI Enhance (After)
              </span>
              <img
                src={enhanceResult!.enhancedUrl}
                alt="Enhanced"
                draggable={false}
                style={{
                  maxWidth: `${zoom * 100}%`,
                  maxHeight: `${zoom * 90}%`,
                  objectFit: 'contain',
                  borderRadius: 6,
                  boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
                }}
              />
            </div>
          </div>
        ) : (
          <div
            ref={stageImageRef}
            onClick={handleImageClickForWb}
            style={{
              position: 'relative',
              display: 'inline-flex',
              maxWidth: zoom === 1 ? '100%' : 'none',
              maxHeight: zoom === 1 ? '100%' : 'none',
              transform: zoom !== 1 ? `scale(${zoom})` : undefined,
              transformOrigin: 'center center',
              borderRadius: 6,
              overflow: 'hidden',
              boxShadow: '0 14px 40px rgba(0, 0, 0, 0.55)',
            }}
          >
            {/* Ảnh nền: nếu chưa apply hoặc đang giữ soi gốc -> hiện ảnh gốc, ngược lại hiện ảnh đã enhance */}
            <img
              src={holdOriginal || !showEnhanced ? imageInfo.originalUrl : enhanceResult!.enhancedUrl}
              alt="Preview"
              draggable={false}
              style={{
                display: 'block',
                maxWidth: zoom === 1 ? 'calc(100vw - 410px)' : '82vw',
                maxHeight: zoom === 1 ? 'calc(100vh - 170px)' : '82vh',
                objectFit: 'contain',
              }}
            />

            {/* Lớp ảnh gốc cắt theo splitPos khi ở chế độ Split */}
            {compareMode === 'split' && showEnhanced && !holdOriginal && (
              <>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    clipPath: `inset(0 ${100 - splitPos}% 0 0)`,
                    pointerEvents: 'none',
                  }}
                >
                  <img
                    src={imageInfo.originalUrl}
                    alt="Original layer"
                    draggable={false}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      display: 'block',
                    }}
                  />
                </div>

                {/* Thanh chia & tay kéo */}
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    setIsDraggingSplit(true)
                    updateSplitFromClientX(e.clientX)
                  }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${splitPos}%`,
                    width: 2,
                    background: 'rgba(255,255,255,0.9)',
                    boxShadow: '0 0 8px rgba(0,0,0,0.8)',
                    cursor: 'ew-resize',
                    transform: 'translateX(-1px)',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      color: '#141210',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 11,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
                    }}
                  >
                    ⇄
                  </div>
                </div>

                <span
                  style={{
                    position: 'absolute',
                    top: 10,
                    left: 10,
                    padding: '3px 8px',
                    borderRadius: 5,
                    background: 'rgba(15,15,18,0.75)',
                    fontSize: 11,
                    pointerEvents: 'none',
                  }}
                >
                  Gốc
                </span>
                <span
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    padding: '3px 8px',
                    borderRadius: 5,
                    background: 'rgba(15,15,18,0.75)',
                    color: 'var(--accent)',
                    fontSize: 11,
                    pointerEvents: 'none',
                  }}
                >
                  AI Enhance
                </span>
              </>
            )}
          </div>
        )}

        {isProcessing && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(12, 12, 15, 0.55)',
              backdropFilter: 'blur(2px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
            }}
          >
            <div
              style={{
                padding: '12px 18px',
                borderRadius: 10,
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-strong)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontWeight: 500,
              }}
            >
              <Loader2 size={18} color="var(--accent)" className="spin" />
              Đang xử lý AI Enhance...
            </div>
          </div>
        )}
      </div>

      <div className="viewer-statusbar">
        <div className="topbar-group" style={{ gap: 14 }}>
          {imageInfo ? (
            <>
              <span>
                File: <b style={{ color: 'var(--text-primary)' }}>{imageInfo.filename}</b>
              </span>
              <span>
                Gốc: {imageInfo.width}×{imageInfo.height}px
              </span>
              <span>Khuôn mặt: {enhanceResult ? enhanceResult.faceCount : imageInfo.faceCount}</span>
            </>
          ) : (
            <span>Chưa có ảnh nào được import</span>
          )}
        </div>

        <div className="topbar-group" style={{ gap: 12 }}>
          {enhanceResult && (
            <>
              <span>
                Preview: {enhanceResult.width}×{enhanceResult.height}px
              </span>
              <span>
                Đốm sửa: {enhanceResult.spotStats.redSpots} đỏ / {enhanceResult.spotStats.darkSpots} tối
              </span>
              <span style={{ color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>
                {enhanceResult.processingTimeMs} ms
              </span>
            </>
          )}
          {isDirty && imageInfo && (
            <span style={{ color: 'var(--warning)', fontWeight: 500 }}>
              ● Có thay đổi chưa Apply
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
