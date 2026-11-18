/**
 * @file ExportConfigModal.tsx
 * Hiển thị bản tóm tắt thông số đã chỉnh và sinh đoạn code Python / JSON sẵn sàng
 * copy để cập nhật lại vào `desktop/ai-service/core/korean_beauty_engine.py` và `enhance.py`.
 */
import React, { useMemo, useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import type { KoreanBeautyConfig, PresetsPayload, TuneParams } from '../types'

interface ExportConfigModalProps {
  params: TuneParams
  presetsPayload: PresetsPayload | null
  onClose: () => void
}

const fmtPyBool = (v: boolean) => (v ? 'True' : 'False')

export const ExportConfigModal: React.FC<ExportConfigModalProps> = ({
  params,
  presetsPayload,
  onClose,
}) => {
  const [copiedKey, setCopiedKey] = useState<'python' | 'json' | null>(null)

  const changedFields = useMemo(() => {
    if (!presetsPayload || params.presetId === 'capture_one_classic') return []
    const base = presetsPayload.presets[params.presetId]
    const diffs: Array<{ key: string; from: unknown; to: unknown }> = []
    ;(Object.keys(base) as Array<keyof KoreanBeautyConfig>).forEach((key) => {
      const a = base[key]
      const b = params.koreanConfig[key]
      if (typeof a === 'number' && typeof b === 'number') {
        if (Math.abs(a - b) > 1e-4) diffs.push({ key, from: a, to: b })
      } else if (a !== b) {
        diffs.push({ key, from: a, to: b })
      }
    })
    return diffs
  }, [params, presetsPayload])

  const pythonSnippet = useMemo(() => {
    if (params.presetId === 'capture_one_classic') {
      return `# desktop/ai-service/api/routes/enhance.py -> EnhanceRequest defaults
beautyLevel: int = Field(${params.beautyLevel}, ge=0, le=100)
skinEvening: float = Field(${params.skinEvening}, ge=0.0, le=1.0)
blemishRemoval: float = Field(${params.blemishRemoval}, ge=0.0, le=1.0)
darkCirclesReduction: float = Field(${params.darkCirclesReduction}, ge=0.0, le=1.0)
clarityGlow: float = Field(${params.clarityGlow}, ge=-100.0, le=100.0)
rosyGlow: float = Field(${params.rosyGlow}, ge=0.0, le=1.0)
sharpen: bool = Field(${fmtPyBool(params.sharpen)})`
    }

    const c = params.koreanConfig
    return `# desktop/ai-service/core/korean_beauty_engine.py -> KoreanBeautyConfig (${params.presetId})
# beautyLevel = ${params.beautyLevel} | styleId = "${params.styleId}"
cls(
    presetId="${params.presetId}",
    skinSmoothing=${c.skinSmoothing},
    blemishRemoval=${c.blemishRemoval},
    skinEvening=${c.skinEvening},
    skinTextureRetention=${c.skinTextureRetention},
    skinBrightening=${c.skinBrightening},
    rosyTone=${c.rosyTone},
    rosyBlush=${c.rosyBlush},
    blushSpread=${c.blushSpread},
    blushAdaptation=${c.blushAdaptation},
    softGlow=${c.softGlow},
    skinDiffuseLight=${c.skinDiffuseLight},
    skinYellowReduction=${c.skinYellowReduction},
    foundationCoverage=${c.foundationCoverage},
    concealerStrength=${c.concealerStrength},
    shineReduction=${c.shineReduction},
    darkCirclesReduction=${c.darkCirclesReduction},
    eyeSharpening=${c.eyeSharpening},
    globalSharpening=${c.globalSharpening},
    slimFace=${c.slimFace},
    bigEyes=${c.bigEyes},
    slimNose=${c.slimNose},
    skinPlump=${c.skinPlump},
    protectGlasses=${fmtPyBool(c.protectGlasses)},
    selectiveBlemish=${fmtPyBool(c.selectiveBlemish)},
    selectiveSpotCorrection=${fmtPyBool(c.selectiveSpotCorrection)},
    redSpotCorrection=${fmtPyBool(c.redSpotCorrection)},
)`
  }, [params])

  const jsonPayload = useMemo(() => {
    const payload: Record<string, unknown> = {
      beautyLevel: params.beautyLevel,
      styleId: params.styleId,
      presetId: params.presetId,
      whiteBalanceStrength: params.whiteBalanceStrength,
      neutralReferenceRgb: params.neutralReferenceRgb,
    }
    if (params.cropAspect && params.cropAspect !== 'none') {
      payload.cropAspect = params.cropAspect
    }
    if (params.presetId === 'capture_one_classic') {
      payload.skinEvening = params.skinEvening
      payload.blemishRemoval = params.blemishRemoval
      payload.darkCirclesReduction = params.darkCirclesReduction
      payload.clarityGlow = params.clarityGlow
      payload.rosyGlow = params.rosyGlow
      payload.sharpen = params.sharpen
    } else {
      payload.koreanConfig = { ...params.koreanConfig, presetId: params.presetId }
    }
    return JSON.stringify(payload, null, 2)
  }, [params])

  const handleCopy = async (kind: 'python' | 'json', text: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedKey(kind)
    setTimeout(() => setCopiedKey(null), 1600)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Export thông số cho ai-service</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              Copy trực tiếp cấu hình đã tinh chỉnh để cập nhật vào <code>desktop/ai-service</code>
            </div>
          </div>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {changedFields.length > 0 && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: 'var(--accent-dim)',
                border: '1px solid rgba(228,168,120,0.35)',
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--accent)', marginBottom: 6 }}>
                Các chỉ số đã thay đổi so với mặc định {params.presetId}:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {changedFields.map((d) => (
                  <span
                    key={d.key}
                    style={{
                      padding: '2px 8px',
                      borderRadius: 5,
                      background: 'rgba(0,0,0,0.35)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                    }}
                  >
                    {d.key}: {String(d.from)} → <b style={{ color: 'var(--accent)' }}>{String(d.to)}</b>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 12.5 }}>Python Preset (korean_beauty_engine.py)</span>
              <button type="button" className="btn btn-sm" onClick={() => handleCopy('python', pythonSnippet)}>
                {copiedKey === 'python' ? <Check size={12} color="var(--success)" /> : <Copy size={12} />}
                {copiedKey === 'python' ? 'Đã copy' : 'Copy Python'}
              </button>
            </div>
            <pre className="code-block">{pythonSnippet}</pre>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 12.5 }}>API JSON Payload (/enhance)</span>
              <button type="button" className="btn btn-sm" onClick={() => handleCopy('json', jsonPayload)}>
                {copiedKey === 'json' ? <Check size={12} color="var(--success)" /> : <Copy size={12} />}
                {copiedKey === 'json' ? 'Đã copy' : 'Copy JSON'}
              </button>
            </div>
            <pre className="code-block">{jsonPayload}</pre>
          </div>
        </div>
      </div>
    </div>
  )
}
