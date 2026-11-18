/**
 * @file types.ts
 * Định nghĩa kiểu dữ liệu cho thông số AI Enhance, Preset và kết quả preview
 * khớp 1:1 với schema Pydantic của `desktop/ai-service`.
 */

export type PresetId =
  | 'white_pink_v2'
  | 'white_pink'
  | 'korean_soft_beauty'
  | 'capture_one_classic'

export type StyleId = 'natural' | 'bw' | 'retro'

export type CompareMode = 'split' | 'side_by_side' | 'after'

export interface KoreanBeautyConfig {
  presetId: string
  enabled: boolean
  skinSmoothing: number
  blemishRemoval: number
  selectiveBlemish: boolean
  selectiveSpotCorrection: boolean
  redSpotCorrection: boolean
  shineReduction: number
  darkCirclesReduction: number
  protectGlasses: boolean
  skinEvening: number
  skinTextureRetention: number
  rosyTone: number
  skinYellowReduction: number
  blushSpread: number
  blushAdaptation: number
  skinDiffuseLight: number
  foundationCoverage: number
  concealerStrength: number
  skinBrightening: number
  softGlow: number
  rosyBlush: number
  eyeSharpening: number
  globalSharpening: number
  slimFace: number
  bigEyes: number
  slimNose: number
  skinPlump: number
}

export interface TuneParams {
  beautyLevel: number
  skinEvening: number
  blemishRemoval: number
  darkCirclesReduction: number
  clarityGlow: number
  rosyGlow: number
  sharpen: boolean
  whiteBalanceStrength: number
  neutralReferenceRgb: [number, number, number] | null
  styleId: StyleId
  presetId: PresetId
  cropAspect: string
  koreanConfig: KoreanBeautyConfig
  previewMaxWidth: number
}

export interface UploadedImageInfo {
  imageId: string
  filename: string
  width: number
  height: number
  faceCount: number
  originalUrl: string
}

export interface EnhanceResultInfo {
  enhancedUrl: string
  filename: string
  processingTimeMs: number
  faceCount: number
  width: number
  height: number
  spotStats: {
    redSpots: number
    darkSpots: number
    spotCorrectionMs: number
  }
}

export interface PresetsPayload {
  presets: Record<'white_pink_v2' | 'white_pink' | 'korean_soft_beauty', KoreanBeautyConfig>
  classicDefaults: {
    beautyLevel: number
    skinEvening: number
    blemishRemoval: number
    darkCirclesReduction: number
    clarityGlow: number
    rosyGlow: number
    sharpen: boolean
  }
  styles: StyleId[]
}
