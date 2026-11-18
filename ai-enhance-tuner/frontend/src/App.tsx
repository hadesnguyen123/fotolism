/**
 * @file App.tsx
 * Ứng dụng Fotolism AI Enhance Tuner: import ảnh, điều chỉnh bộ thông số AI Enhance,
 * nhấn Apply để xem thay đổi trực tiếp trên màn hình và xuất cấu hình cho `ai-service`.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Code2, Download, ImagePlus, Play, Sparkles } from 'lucide-react'
import { CompareViewer } from './components/CompareViewer'
import { ExportConfigModal } from './components/ExportConfigModal'
import { ParamControls } from './components/ParamControls'
import type {
  CompareMode,
  EnhanceResultInfo,
  KoreanBeautyConfig,
  PresetId,
  PresetsPayload,
  TuneParams,
  UploadedImageInfo,
} from './types'

const FALLBACK_KOREAN_CONFIG: KoreanBeautyConfig = {
  presetId: 'white_pink_v2',
  enabled: true,
  skinSmoothing: 0.7,
  blemishRemoval: 1.9,
  selectiveBlemish: true,
  selectiveSpotCorrection: true,
  redSpotCorrection: true,
  shineReduction: 0.0,
  darkCirclesReduction: 0.0,
  protectGlasses: true,
  skinEvening: 0.6,
  skinTextureRetention: 0.6,
  rosyTone: 0.925,
  skinYellowReduction: 0.0,
  blushSpread: 1.3,
  blushAdaptation: 0.85,
  skinDiffuseLight: 0.0,
  foundationCoverage: 0.0,
  concealerStrength: 0.4,
  skinBrightening: 0.55,
  softGlow: 0.13,
  rosyBlush: 0.6,
  eyeSharpening: 0.0,
  globalSharpening: 0.0,
  slimFace: 0.1,
  bigEyes: 0.06,
  slimNose: 0.06,
  skinPlump: 0.8,
}

const INITIAL_PARAMS: TuneParams = {
  beautyLevel: 50,
  skinEvening: 0.55,
  blemishRemoval: 0.55,
  darkCirclesReduction: 0.4,
  clarityGlow: -10,
  rosyGlow: 0.0,
  sharpen: false,
  whiteBalanceStrength: 0.0,
  neutralReferenceRgb: null,
  styleId: 'natural',
  presetId: 'white_pink_v2',
  cropAspect: 'none',
  koreanConfig: FALLBACK_KOREAN_CONFIG,
  previewMaxWidth: 1600,
}

export function App() {
  const [presetsPayload, setPresetsPayload] = useState<PresetsPayload | null>(null)
  const [params, setParams] = useState<TuneParams>(INITIAL_PARAMS)
  const [imageInfo, setImageInfo] = useState<UploadedImageInfo | null>(null)
  const [enhanceResult, setEnhanceResult] = useState<EnhanceResultInfo | null>(null)
  const [compareMode, setCompareMode] = useState<CompareMode>('split')
  const [zoom, setZoom] = useState(1)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [isPickingWb, setIsPickingWb] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const topFileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/presets')
      .then((res) => res.json())
      .then((data: PresetsPayload) => {
        setPresetsPayload(data)
        if (data.presets?.white_pink_v2) {
          setParams((prev) => ({
            ...prev,
            koreanConfig: { ...data.presets.white_pink_v2 },
          }))
        }
      })
      .catch(() => {
        setErrorMsg('Không kết nối được backend AI Tuner (cổng 8010).')
      })
  }, [])

  const applyEnhance = useCallback(
    async (targetImageId: string, targetParams: TuneParams) => {
      setIsProcessing(true)
      setErrorMsg(null)
      try {
        const res = await fetch('/api/enhance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageId: targetImageId,
            ...targetParams,
            cropAspect: targetParams.cropAspect === 'none' ? null : targetParams.cropAspect,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.detail || 'Lỗi khi chạy AI Enhance')
        }
        setEnhanceResult(data as EnhanceResultInfo)
        setIsDirty(false)
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Lỗi không xác định khi xử lý ảnh')
      } finally {
        setIsProcessing(false)
      }
    },
    []
  )

  const handleUploadFile = async (file: File) => {
    setIsProcessing(true)
    setErrorMsg(null)
    setIsPickingWb(false)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || 'Không thể import ảnh')
      }
      const uploaded = data as UploadedImageInfo
      setImageInfo(uploaded)
      setEnhanceResult(null)
      setZoom(1)
      setIsDirty(true)
      // Tự động chạy 1 lần ngay khi import để người dùng có baseline so sánh tức thì
      await applyEnhance(uploaded.imageId, params)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi import ảnh')
      setIsProcessing(false)
    }
  }

  const handleChangeParams = (updater: (prev: TuneParams) => TuneParams) => {
    setParams((prev) => updater(prev))
    setIsDirty(true)
  }

  const buildParamsForPreset = (presetId: PresetId, prev: TuneParams): TuneParams => {
    if (presetId === 'capture_one_classic') {
      const classic = presetsPayload?.classicDefaults
      return {
        ...prev,
        presetId,
        beautyLevel: classic?.beautyLevel ?? 50,
        skinEvening: classic?.skinEvening ?? 0.55,
        blemishRemoval: classic?.blemishRemoval ?? 0.55,
        darkCirclesReduction: classic?.darkCirclesReduction ?? 0.4,
        clarityGlow: classic?.clarityGlow ?? -10,
        rosyGlow: classic?.rosyGlow ?? 0,
        sharpen: classic?.sharpen ?? false,
      }
    }
    const presetCfg = presetsPayload?.presets?.[presetId]
    return {
      ...prev,
      presetId,
      beautyLevel: 50,
      koreanConfig: presetCfg ? { ...presetCfg } : { ...prev.koreanConfig, presetId },
    }
  }

  const handleSelectPreset = (presetId: PresetId) => {
    setParams((prev) => buildParamsForPreset(presetId, prev))
    setIsDirty(true)
  }

  const handleResetCurrentPreset = () => {
    setParams((prev) => ({
      ...buildParamsForPreset(prev.presetId, prev),
      styleId: 'natural',
      cropAspect: 'none',
      whiteBalanceStrength: 0,
      neutralReferenceRgb: null,
    }))
    setIsDirty(true)
  }

  const handlePickWbPoint = async (normX: number, normY: number) => {
    if (!imageInfo) return
    setIsPickingWb(false)
    try {
      const res = await fetch('/api/sample-rgb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId: imageInfo.imageId, normX, normY }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Không thể lấy mẫu RGB')
      handleChangeParams((prev) => ({
        ...prev,
        neutralReferenceRgb: data.rgb,
        whiteBalanceStrength: prev.whiteBalanceStrength > 0 ? prev.whiteBalanceStrength : 0.65,
      }))
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi lấy mẫu cân bằng trắng')
    }
  }

  return (
    <div className="app-shell">
      <input
        ref={topFileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleUploadFile(f)
          e.target.value = ''
        }}
      />

      <header className="topbar">
        <div className="topbar-group">
          <div className="brand-title">
            <Sparkles size={17} color="var(--accent)" />
            <span>Fotolism AI Enhance Tuner</span>
            <span className="brand-badge">Standalone</span>
          </div>
        </div>

        <div className="topbar-group">
          <button type="button" className="btn" onClick={() => topFileInputRef.current?.click()}>
            <ImagePlus size={14} />
            Import ảnh
          </button>

          {enhanceResult && (
            <a
              href={enhanceResult.enhancedUrl}
              download={`tuned_${imageInfo?.filename || 'photo.jpg'}`}
              className="btn"
              style={{ textDecoration: 'none' }}
            >
              <Download size={14} />
              Tải ảnh
            </a>
          )}

          <button type="button" className="btn" onClick={() => setShowExport(true)}>
            <Code2 size={14} />
            Export cho ai-service
          </button>
        </div>
      </header>

      {errorMsg && (
        <div
          style={{
            padding: '7px 16px',
            background: 'rgba(229, 107, 111, 0.14)',
            borderBottom: '1px solid rgba(229, 107, 111, 0.35)',
            color: '#ffb5b7',
            fontSize: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setErrorMsg(null)}
            style={{ height: 22 }}
          >
            Đóng
          </button>
        </div>
      )}

      <div className="workspace-body">
        <CompareViewer
          imageInfo={imageInfo}
          enhanceResult={enhanceResult}
          compareMode={compareMode}
          zoom={zoom}
          isProcessing={isProcessing}
          isDirty={isDirty}
          isPickingWb={isPickingWb}
          onChangeCompareMode={setCompareMode}
          onChangeZoom={setZoom}
          onUploadFile={handleUploadFile}
          onPickWbPoint={handlePickWbPoint}
        />

        <aside className="sidebar-pane">
          <ParamControls
            params={params}
            presetsPayload={presetsPayload}
            isPickingWb={isPickingWb}
            hasImage={Boolean(imageInfo)}
            onTogglePickWb={() => setIsPickingWb((v) => !v)}
            onChangeParams={handleChangeParams}
            onSelectPreset={handleSelectPreset}
            onResetCurrentPreset={handleResetCurrentPreset}
          />

          <div className="sidebar-footer">
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', height: 38, fontSize: 13.5 }}
              disabled={!imageInfo || isProcessing}
              onClick={() => imageInfo && applyEnhance(imageInfo.imageId, params)}
            >
              <Play size={14} fill="currentColor" />
              {isProcessing ? 'Đang xử lý...' : 'Apply thay đổi lên ảnh'}
            </button>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
              Chỉnh thanh thông số bên trên → nhấn <b>Apply</b> để xem kết quả
            </div>
          </div>
        </aside>
      </div>

      {showExport && (
        <ExportConfigModal
          params={params}
          presetsPayload={presetsPayload}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  )
}

export default App
