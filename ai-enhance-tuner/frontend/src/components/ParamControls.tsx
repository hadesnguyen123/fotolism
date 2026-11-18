/**
 * @file ParamControls.tsx
 * Bảng điều chỉnh toàn bộ thông số AI Enhance theo nhóm, hiển thị trực tiếp tên biến gốc
 * và trạng thái thay đổi so với mặc định preset để dễ dàng đối chiếu khi apply lại vào `ai-service`.
 */
import React, { useState } from 'react'
import { ChevronDown, ChevronRight, Pipette, RotateCcw, X } from 'lucide-react'
import type { KoreanBeautyConfig, PresetId, PresetsPayload, StyleId, TuneParams } from '../types'

interface ParamControlsProps {
  params: TuneParams
  presetsPayload: PresetsPayload | null
  isPickingWb: boolean
  hasImage: boolean
  onTogglePickWb: () => void
  onChangeParams: (updater: (prev: TuneParams) => TuneParams) => void
  onSelectPreset: (presetId: PresetId) => void
  onResetCurrentPreset: () => void
}

interface SliderItemProps {
  label: string
  fieldKey: string
  value: number
  defaultValue?: number
  min: number
  max: number
  step: number
  decimals?: number
  onChange: (val: number) => void
  onReset?: () => void
}

const SliderItem: React.FC<SliderItemProps> = ({
  label,
  fieldKey,
  value,
  defaultValue,
  min,
  max,
  step,
  decimals = 2,
  onChange,
  onReset,
}) => {
  const isModified = defaultValue !== undefined && Math.abs(value - defaultValue) > 1e-4
  return (
    <div className="param-row">
      <div className="param-label-row">
        <div className="param-title">
          {isModified && <span className="modified-dot" title="Đã chỉnh khác mặc định preset" />}
          <span>{label}</span>
          <span className="param-key">{fieldKey}</span>
        </div>
        <div className="param-value-box">
          <span className="param-value">{value.toFixed(decimals)}</span>
          {isModified && onReset && (
            <button
              type="button"
              className="btn btn-sm"
              style={{ height: 20, padding: '0 4px', border: 'none', background: 'transparent' }}
              title="Khôi phục giá trị mặc định"
              onClick={onReset}
            >
              <RotateCcw size={11} />
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        className="studio-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  )
}

interface ToggleItemProps {
  label: string
  fieldKey: string
  checked: boolean
  defaultValue?: boolean
  onChange: (checked: boolean) => void
}

const ToggleItem: React.FC<ToggleItemProps> = ({ label, fieldKey, checked, defaultValue, onChange }) => {
  const isModified = defaultValue !== undefined && checked !== defaultValue
  return (
    <label className="toggle-row" style={{ cursor: 'pointer' }}>
      <span className="param-title">
        {isModified && <span className="modified-dot" title="Đã chỉnh khác mặc định preset" />}
        <span>{label}</span>
        <span className="param-key">{fieldKey}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: 'var(--accent)', width: 15, height: 15, cursor: 'pointer' }}
      />
    </label>
  )
}

interface SectionProps {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}

const Section: React.FC<SectionProps> = ({ title, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="section-card">
      <button type="button" className="section-header" onClick={() => setOpen((v) => !v)}>
        <span>{title}</span>
        {open ? <ChevronDown size={14} color="var(--text-secondary)" /> : <ChevronRight size={14} color="var(--text-secondary)" />}
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  )
}

export const ParamControls: React.FC<ParamControlsProps> = ({
  params,
  presetsPayload,
  isPickingWb,
  hasImage,
  onTogglePickWb,
  onChangeParams,
  onSelectPreset,
  onResetCurrentPreset,
}) => {
  const isClassic = params.presetId === 'capture_one_classic'
  const baseKorean: KoreanBeautyConfig | undefined =
    presetsPayload && params.presetId !== 'capture_one_classic'
      ? presetsPayload.presets[params.presetId]
      : undefined
  const baseClassic = presetsPayload?.classicDefaults

  const updateKorean = <K extends keyof KoreanBeautyConfig>(key: K, value: KoreanBeautyConfig[K]) => {
    onChangeParams((prev) => ({
      ...prev,
      koreanConfig: {
        ...prev.koreanConfig,
        [key]: value,
      },
    }))
  }

  return (
    <div className="sidebar-scroll">
      <Section title="Preset & Cấu hình chung" defaultOpen>
        <div className="param-row">
          <div className="param-label-row">
            <span className="param-title">
              Preset nền <span className="param-key">presetId</span>
            </span>
            <button type="button" className="btn btn-sm" onClick={onResetCurrentPreset} title="Đưa thông số về mặc định của preset này">
              <RotateCcw size={11} />
              Mặc định
            </button>
          </div>
          <select
            className="select-input"
            value={params.presetId}
            onChange={(e) => onSelectPreset(e.target.value as PresetId)}
          >
            <option value="white_pink_v2">white_pink_v2 (Mặc định sản xuất)</option>
            <option value="white_pink">white_pink (V1)</option>
            <option value="korean_soft_beauty">korean_soft_beauty</option>
            <option value="capture_one_classic">capture_one_classic (Classic)</option>
          </select>
        </div>

        <SliderItem
          label="Cường độ tổng"
          fieldKey="beautyLevel"
          value={params.beautyLevel}
          defaultValue={50}
          min={0}
          max={100}
          step={1}
          decimals={0}
          onChange={(v) => onChangeParams((p) => ({ ...p, beautyLevel: Math.round(v) }))}
          onReset={() => onChangeParams((p) => ({ ...p, beautyLevel: 50 }))}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div className="param-row">
            <span className="param-title">
              Bộ lọc <span className="param-key">styleId</span>
            </span>
            <select
              className="select-input"
              value={params.styleId}
              onChange={(e) => onChangeParams((p) => ({ ...p, styleId: e.target.value as StyleId }))}
            >
              <option value="natural">natural (Gốc)</option>
              <option value="bw">bw (Đen trắng)</option>
              <option value="retro">retro (Vintage)</option>
            </select>
          </div>
          <div className="param-row">
            <span className="param-title">
              Tỉ lệ cắt <span className="param-key">cropAspect</span>
            </span>
            <select
              className="select-input"
              value={params.cropAspect}
              onChange={(e) => onChangeParams((p) => ({ ...p, cropAspect: e.target.value }))}
            >
              <option value="none">Giữ nguyên</option>
              <option value="3:4">3:4 (Selfbooth)</option>
              <option value="2:3">2:3</option>
              <option value="4:6">4:6</option>
            </select>
          </div>
        </div>

        <div className="param-row">
          <span className="param-title">Độ phân giải xử lý (Preview)</span>
          <select
            className="select-input"
            value={params.previewMaxWidth}
            onChange={(e) => onChangeParams((p) => ({ ...p, previewMaxWidth: Number(e.target.value) }))}
          >
            <option value={1200}>Nhanh (1200px)</option>
            <option value={1600}>Cân bằng (1600px)</option>
            <option value={2400}>Chi tiết cao (2400px)</option>
            <option value={0}>Full độ phân giải gốc</option>
          </select>
        </div>
      </Section>

      {!isClassic ? (
        <>
          <Section title="Da & Khuyết điểm" defaultOpen>
            <SliderItem
              label="Căng mịn da (Plump)"
              fieldKey="skinPlump"
              value={params.koreanConfig.skinPlump}
              defaultValue={baseKorean?.skinPlump}
              min={0}
              max={3}
              step={0.05}
              onChange={(v) => updateKorean('skinPlump', v)}
              onReset={() => baseKorean && updateKorean('skinPlump', baseKorean.skinPlump)}
            />
            <SliderItem
              label="Mịn da"
              fieldKey="skinSmoothing"
              value={params.koreanConfig.skinSmoothing}
              defaultValue={baseKorean?.skinSmoothing}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => updateKorean('skinSmoothing', v)}
              onReset={() => baseKorean && updateKorean('skinSmoothing', baseKorean.skinSmoothing)}
            />
            <SliderItem
              label="Giữ vân da"
              fieldKey="skinTextureRetention"
              value={params.koreanConfig.skinTextureRetention}
              defaultValue={baseKorean?.skinTextureRetention}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => updateKorean('skinTextureRetention', v)}
              onReset={() => baseKorean && updateKorean('skinTextureRetention', baseKorean.skinTextureRetention)}
            />
            <SliderItem
              label="Đều màu da"
              fieldKey="skinEvening"
              value={params.koreanConfig.skinEvening}
              defaultValue={baseKorean?.skinEvening}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => updateKorean('skinEvening', v)}
              onReset={() => baseKorean && updateKorean('skinEvening', baseKorean.skinEvening)}
            />
            <SliderItem
              label="Khử khuyết điểm"
              fieldKey="blemishRemoval"
              value={params.koreanConfig.blemishRemoval}
              defaultValue={baseKorean?.blemishRemoval}
              min={0}
              max={2}
              step={0.02}
              onChange={(v) => updateKorean('blemishRemoval', v)}
              onReset={() => baseKorean && updateKorean('blemishRemoval', baseKorean.blemishRemoval)}
            />
            <SliderItem
              label="Giảm quầng thâm"
              fieldKey="darkCirclesReduction"
              value={params.koreanConfig.darkCirclesReduction}
              defaultValue={baseKorean?.darkCirclesReduction}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => updateKorean('darkCirclesReduction', v)}
              onReset={() => baseKorean && updateKorean('darkCirclesReduction', baseKorean.darkCirclesReduction)}
            />
            <SliderItem
              label="Giảm bóng dầu"
              fieldKey="shineReduction"
              value={params.koreanConfig.shineReduction}
              defaultValue={baseKorean?.shineReduction}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => updateKorean('shineReduction', v)}
              onReset={() => baseKorean && updateKorean('shineReduction', baseKorean.shineReduction)}
            />
            <SliderItem
              label="Phủ nền"
              fieldKey="foundationCoverage"
              value={params.koreanConfig.foundationCoverage}
              defaultValue={baseKorean?.foundationCoverage}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => updateKorean('foundationCoverage', v)}
              onReset={() => baseKorean && updateKorean('foundationCoverage', baseKorean.foundationCoverage)}
            />
            <SliderItem
              label="Che khuyết điểm"
              fieldKey="concealerStrength"
              value={params.koreanConfig.concealerStrength}
              defaultValue={baseKorean?.concealerStrength}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => updateKorean('concealerStrength', v)}
              onReset={() => baseKorean && updateKorean('concealerStrength', baseKorean.concealerStrength)}
            />

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <ToggleItem
                label="Bảo vệ cạnh khuyết điểm"
                fieldKey="selectiveBlemish"
                checked={params.koreanConfig.selectiveBlemish}
                defaultValue={baseKorean?.selectiveBlemish}
                onChange={(v) => updateKorean('selectiveBlemish', v)}
              />
              <ToggleItem
                label="Sửa đốm chọn lọc"
                fieldKey="selectiveSpotCorrection"
                checked={params.koreanConfig.selectiveSpotCorrection}
                defaultValue={baseKorean?.selectiveSpotCorrection}
                onChange={(v) => updateKorean('selectiveSpotCorrection', v)}
              />
              <ToggleItem
                label="Sửa đốm mụn đỏ"
                fieldKey="redSpotCorrection"
                checked={params.koreanConfig.redSpotCorrection}
                defaultValue={baseKorean?.redSpotCorrection}
                onChange={(v) => updateKorean('redSpotCorrection', v)}
              />
              <ToggleItem
                label="Bảo vệ gọng kính"
                fieldKey="protectGlasses"
                checked={params.koreanConfig.protectGlasses}
                defaultValue={baseKorean?.protectGlasses}
                onChange={(v) => updateKorean('protectGlasses', v)}
              />
            </div>
          </Section>

          <Section title="Ánh sáng, Sắc trắng & Má hồng" defaultOpen>
            <SliderItem
              label="Nâng sáng trắng hồng"
              fieldKey="skinBrightening"
              value={params.koreanConfig.skinBrightening}
              defaultValue={baseKorean?.skinBrightening}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => updateKorean('skinBrightening', v)}
              onReset={() => baseKorean && updateKorean('skinBrightening', baseKorean.skinBrightening)}
            />
            <SliderItem
              label="Ánh sáng dịu"
              fieldKey="softGlow"
              value={params.koreanConfig.softGlow}
              defaultValue={baseKorean?.softGlow}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => updateKorean('softGlow', v)}
              onReset={() => baseKorean && updateKorean('softGlow', baseKorean.softGlow)}
            />
            <SliderItem
              label="Tản sáng vùng tối"
              fieldKey="skinDiffuseLight"
              value={params.koreanConfig.skinDiffuseLight}
              defaultValue={baseKorean?.skinDiffuseLight}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => updateKorean('skinDiffuseLight', v)}
              onReset={() => baseKorean && updateKorean('skinDiffuseLight', baseKorean.skinDiffuseLight)}
            />
            <SliderItem
              label="Sắc hồng da"
              fieldKey="rosyTone"
              value={params.koreanConfig.rosyTone}
              defaultValue={baseKorean?.rosyTone}
              min={0}
              max={1}
              step={0.005}
              decimals={3}
              onChange={(v) => updateKorean('rosyTone', v)}
              onReset={() => baseKorean && updateKorean('rosyTone', baseKorean.rosyTone)}
            />
            <SliderItem
              label="Má hồng"
              fieldKey="rosyBlush"
              value={params.koreanConfig.rosyBlush}
              defaultValue={baseKorean?.rosyBlush}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => updateKorean('rosyBlush', v)}
              onReset={() => baseKorean && updateKorean('rosyBlush', baseKorean.rosyBlush)}
            />
            <SliderItem
              label="Độ lan má hồng"
              fieldKey="blushSpread"
              value={params.koreanConfig.blushSpread}
              defaultValue={baseKorean?.blushSpread}
              min={0.5}
              max={1.5}
              step={0.01}
              onChange={(v) => updateKorean('blushSpread', v)}
              onReset={() => baseKorean && updateKorean('blushSpread', baseKorean.blushSpread)}
            />
            <SliderItem
              label="Thích ứng má hồng"
              fieldKey="blushAdaptation"
              value={params.koreanConfig.blushAdaptation}
              defaultValue={baseKorean?.blushAdaptation}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => updateKorean('blushAdaptation', v)}
              onReset={() => baseKorean && updateKorean('blushAdaptation', baseKorean.blushAdaptation)}
            />
            <SliderItem
              label="Giảm ám vàng da"
              fieldKey="skinYellowReduction"
              value={params.koreanConfig.skinYellowReduction}
              defaultValue={baseKorean?.skinYellowReduction}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => updateKorean('skinYellowReduction', v)}
              onReset={() => baseKorean && updateKorean('skinYellowReduction', baseKorean.skinYellowReduction)}
            />
          </Section>

          <Section title="Độ nét & Tạo hình khuôn mặt" defaultOpen={false}>
            <SliderItem
              label="Nét mắt & lông mày"
              fieldKey="eyeSharpening"
              value={params.koreanConfig.eyeSharpening}
              defaultValue={baseKorean?.eyeSharpening}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => updateKorean('eyeSharpening', v)}
              onReset={() => baseKorean && updateKorean('eyeSharpening', baseKorean.eyeSharpening)}
            />
            <SliderItem
              label="Nét toàn ảnh"
              fieldKey="globalSharpening"
              value={params.koreanConfig.globalSharpening}
              defaultValue={baseKorean?.globalSharpening}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => updateKorean('globalSharpening', v)}
              onReset={() => baseKorean && updateKorean('globalSharpening', baseKorean.globalSharpening)}
            />
            <SliderItem
              label="Thon mặt V-line"
              fieldKey="slimFace"
              value={params.koreanConfig.slimFace}
              defaultValue={baseKorean?.slimFace}
              min={0}
              max={0.2}
              step={0.005}
              decimals={3}
              onChange={(v) => updateKorean('slimFace', v)}
              onReset={() => baseKorean && updateKorean('slimFace', baseKorean.slimFace)}
            />
            <SliderItem
              label="To mắt"
              fieldKey="bigEyes"
              value={params.koreanConfig.bigEyes}
              defaultValue={baseKorean?.bigEyes}
              min={0}
              max={0.2}
              step={0.005}
              decimals={3}
              onChange={(v) => updateKorean('bigEyes', v)}
              onReset={() => baseKorean && updateKorean('bigEyes', baseKorean.bigEyes)}
            />
            <SliderItem
              label="Thon mũi"
              fieldKey="slimNose"
              value={params.koreanConfig.slimNose}
              defaultValue={baseKorean?.slimNose}
              min={0}
              max={0.2}
              step={0.005}
              decimals={3}
              onChange={(v) => updateKorean('slimNose', v)}
              onReset={() => baseKorean && updateKorean('slimNose', baseKorean.slimNose)}
            />
          </Section>
        </>
      ) : (
        <Section title="Capture One Classic Engine" defaultOpen>
          <SliderItem
            label="Đều màu da"
            fieldKey="skinEvening"
            value={params.skinEvening}
            defaultValue={baseClassic?.skinEvening}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => onChangeParams((p) => ({ ...p, skinEvening: v }))}
          />
          <SliderItem
            label="Giảm khuyết điểm"
            fieldKey="blemishRemoval"
            value={params.blemishRemoval}
            defaultValue={baseClassic?.blemishRemoval}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => onChangeParams((p) => ({ ...p, blemishRemoval: v }))}
          />
          <SliderItem
            label="Giảm quầng thâm"
            fieldKey="darkCirclesReduction"
            value={params.darkCirclesReduction}
            defaultValue={baseClassic?.darkCirclesReduction}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => onChangeParams((p) => ({ ...p, darkCirclesReduction: v }))}
          />
          <SliderItem
            label="Độ trong / mềm"
            fieldKey="clarityGlow"
            value={params.clarityGlow}
            defaultValue={baseClassic?.clarityGlow}
            min={-100}
            max={100}
            step={1}
            decimals={0}
            onChange={(v) => onChangeParams((p) => ({ ...p, clarityGlow: v }))}
          />
          <SliderItem
            label="Sắc hồng Midtone"
            fieldKey="rosyGlow"
            value={params.rosyGlow}
            defaultValue={baseClassic?.rosyGlow}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => onChangeParams((p) => ({ ...p, rosyGlow: v }))}
          />
          <ToggleItem
            label="Làm nét bổ sung"
            fieldKey="sharpen"
            checked={params.sharpen}
            defaultValue={baseClassic?.sharpen}
            onChange={(v) => onChangeParams((p) => ({ ...p, sharpen: v }))}
          />
        </Section>
      )}

      <Section title="Cân bằng trắng (White Balance)" defaultOpen={false}>
        <SliderItem
          label="Cường độ WB"
          fieldKey="whiteBalanceStrength"
          value={params.whiteBalanceStrength}
          defaultValue={0}
          min={0}
          max={1}
          step={0.02}
          onChange={(v) => onChangeParams((p) => ({ ...p, whiteBalanceStrength: v }))}
          onReset={() => onChangeParams((p) => ({ ...p, whiteBalanceStrength: 0 }))}
        />
        <div className="param-row">
          <div className="param-label-row">
            <span className="param-title">
              Điểm trung tính <span className="param-key">neutralReferenceRgb</span>
            </span>
            {params.neutralReferenceRgb && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => onChangeParams((p) => ({ ...p, neutralReferenceRgb: null, whiteBalanceStrength: 0 }))}
              >
                <X size={11} /> Xoá
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              type="button"
              disabled={!hasImage}
              className={`btn btn-sm ${isPickingWb ? 'btn-active' : ''}`}
              style={{ flex: 1 }}
              onClick={onTogglePickWb}
            >
              <Pipette size={12} />
              {isPickingWb ? 'Click vào vùng trắng/xám trên ảnh...' : 'Chấm điểm trên ảnh'}
            </button>
          </div>
          {params.neutralReferenceRgb && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 11.5, color: 'var(--text-secondary)' }}>
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  border: '1px solid var(--border-strong)',
                  background: `rgb(${params.neutralReferenceRgb.join(',')})`,
                }}
              />
              <span style={{ fontFamily: 'var(--font-mono)' }}>
                RGB({params.neutralReferenceRgb.join(', ')})
              </span>
            </div>
          )}
        </div>
      </Section>
    </div>
  )
}
