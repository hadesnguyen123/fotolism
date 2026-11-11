import type { StateCreator } from 'zustand'
import {
    BEAUTY_PRESETS,
    DEFAULT_BEAUTY_CONFIG,
    type BeautyConfig,
    type BeautyPreset,
} from '../../services/beautyEngine'
import { LS_BEAUTY_CONFIG_KEY } from '../../lib/constants'
import type { ColorFilterItem } from '../../config/filters'

export {
    BEAUTY_PRESETS,
    DEFAULT_BEAUTY_CONFIG,
    type BeautyConfig,
    type BeautyPreset,
}

export function loadSavedBeautyConfig(): BeautyConfig {
    try {
        const raw =
            typeof window !== 'undefined'
                ? localStorage.getItem(LS_BEAUTY_CONFIG_KEY)
                : null
        if (raw) {
            const parsed = JSON.parse(raw)
            return { ...DEFAULT_BEAUTY_CONFIG, ...parsed, mirror: true }
        }
    } catch {}
    return DEFAULT_BEAUTY_CONFIG
}

export interface BeautyCameraSlice {
    // Beauty adjustments
    selectedBeautyPreset: string | null
    applyBeautyPreset: (presetId: string) => void
    slimFace: number
    vLine: number
    bigEyes: number
    skinSmoothing: number
    whiteningTone: number
    rosyTone: number
    glowClarity: number
    brightnessAdjust: number
    contrastAdjust: number
    saturationAdjust: number
    setSlimFace: (val: number) => void
    setVLine: (val: number) => void
    setBigEyes: (val: number) => void
    setSkinSmoothing: (val: number) => void
    setWhiteningTone: (val: number) => void
    setRosyTone: (val: number) => void
    setGlowClarity: (val: number) => void
    setBrightnessAdjust: (val: number) => void
    setContrastAdjust: (val: number) => void
    setSaturationAdjust: (val: number) => void
    saveBeautyConfig: (config?: Partial<BeautyConfig>) => void
    resetAdjustments: () => void
    getBeautyFilterCss: () => string
    getCameraTransformCss: (mirror: boolean) => string
    getEffectiveFilterCss: () => string

    // Lighting
    ringLightEnabled: boolean
    ringLightLevel: number
    setRingLightEnabled: (enabled: boolean) => void
    setRingLightLevel: (level: number) => void

    // Countdown (8s, 5s)
    countdownSeconds: number
    setCountdownSeconds: (sec: number) => void

    // Camera device & stream
    availableCameras: Array<{ id: string; name: string }>
    selectedCameraId: string | null
    cameraType: 'eos' | 'laptop'
    setCameraType: (type: 'eos' | 'laptop') => void
    mirrorCamera: boolean
    setCameras: (cameras: Array<{ id: string; name: string }>) => void
    selectCamera: (id: string) => void
    setMirrorCamera: (mirror: boolean) => void
}

export const createBeautyCameraSlice: StateCreator<
    BeautyCameraSlice & { selectedFilter?: ColorFilterItem },
    [],
    [],
    BeautyCameraSlice
> = (set, get) => {
    const saved = loadSavedBeautyConfig()
    const hasCustom =
        typeof window !== 'undefined' &&
        localStorage.getItem(LS_BEAUTY_CONFIG_KEY)
    const naturalPreset = BEAUTY_PRESETS.find((p) => p.id === 'natural')
    const active = hasCustom
        ? saved
        : {
              slimFace: naturalPreset?.slimFace ?? 18,
              vLine: naturalPreset?.vLine ?? 16,
              bigEyes: naturalPreset?.bigEyes ?? 12,
              skinSmoothing: naturalPreset?.skinSmoothing ?? 45,
              whiteningTone: 0,
              rosyTone: 0,
              glowClarity: 0,
              brightnessAdjust: 100,
              contrastAdjust: 100,
              saturationAdjust: 100,
          }

    return {
        selectedBeautyPreset: 'natural',
        slimFace: active.slimFace,
        vLine: active.vLine ?? 16,
        bigEyes: active.bigEyes ?? 12,
        skinSmoothing: active.skinSmoothing,
        whiteningTone: active.whiteningTone,
        rosyTone: active.rosyTone,
        glowClarity: active.glowClarity,
        brightnessAdjust: active.brightnessAdjust,
        contrastAdjust: active.contrastAdjust,
        saturationAdjust: active.saturationAdjust,

        applyBeautyPreset: (presetId) => {
            const preset = BEAUTY_PRESETS.find((p) => p.id === presetId)
            if (!preset) return
            set({
                selectedBeautyPreset: presetId,
                slimFace: preset.slimFace,
                vLine: preset.vLine,
                bigEyes: preset.bigEyes,
                skinSmoothing: preset.skinSmoothing,
                whiteningTone: preset.whiteningTone,
                rosyTone: preset.rosyTone,
                glowClarity: preset.glowClarity,
                brightnessAdjust: preset.brightness,
                contrastAdjust: preset.contrast,
            })
        },

        setSlimFace: (slimFace) =>
            set({ slimFace, selectedBeautyPreset: null }),
        setVLine: (vLine) => set({ vLine, selectedBeautyPreset: null }),
        setBigEyes: (bigEyes) => set({ bigEyes, selectedBeautyPreset: null }),
        setSkinSmoothing: (skinSmoothing) =>
            set({ skinSmoothing, selectedBeautyPreset: null }),
        setWhiteningTone: (whiteningTone) =>
            set({ whiteningTone, selectedBeautyPreset: null }),
        setRosyTone: (rosyTone) =>
            set({ rosyTone, selectedBeautyPreset: null }),
        setGlowClarity: (glowClarity) =>
            set({ glowClarity, selectedBeautyPreset: null }),
        setBrightnessAdjust: (brightnessAdjust) =>
            set({ brightnessAdjust, selectedBeautyPreset: null }),
        setContrastAdjust: (contrastAdjust) =>
            set({ contrastAdjust, selectedBeautyPreset: null }),
        setSaturationAdjust: (saturationAdjust) =>
            set({ saturationAdjust, selectedBeautyPreset: null }),

        saveBeautyConfig: (config) => {
            const current = get()
            const updated: BeautyConfig = {
                slimFace: config?.slimFace ?? current.slimFace,
                vLine: config?.vLine ?? current.vLine,
                bigEyes: config?.bigEyes ?? current.bigEyes,
                skinSmoothing: config?.skinSmoothing ?? current.skinSmoothing,
                whiteningTone: config?.whiteningTone ?? current.whiteningTone,
                rosyTone: config?.rosyTone ?? current.rosyTone,
                glowClarity: config?.glowClarity ?? current.glowClarity,
                brightnessAdjust:
                    config?.brightnessAdjust ?? current.brightnessAdjust,
                contrastAdjust:
                    config?.contrastAdjust ?? current.contrastAdjust,
                saturationAdjust:
                    config?.saturationAdjust ?? current.saturationAdjust,
            }
            try {
                if (typeof window !== 'undefined') {
                    localStorage.setItem(
                        LS_BEAUTY_CONFIG_KEY,
                        JSON.stringify(updated)
                    )
                }
            } catch (e) {
                console.warn('Failed to save beauty config to localStorage:', e)
            }
            set(updated)
        },

        resetAdjustments: () => {
            const def = DEFAULT_BEAUTY_CONFIG
            set({
                selectedBeautyPreset: 'none',
                mirrorCamera: true,
                ...def,
            })
        },

        getBeautyFilterCss: () => {
            const {
                brightnessAdjust,
                contrastAdjust,
                saturationAdjust,
                skinSmoothing,
                rosyTone,
                glowClarity,
                whiteningTone,
            } = get()

            const whiteMultiplier = 1 + (whiteningTone / 100) * 0.12
            const baseBright =
                brightnessAdjust !== 100 ? brightnessAdjust / 100 : 1
            const totalBright = baseBright * whiteMultiplier
            const b =
                totalBright !== 1 ? `brightness(${totalBright.toFixed(3)})` : ''
            const c =
                contrastAdjust !== 100
                    ? `contrast(${contrastAdjust / 100})`
                    : ''
            const s =
                saturationAdjust !== 100
                    ? `saturate(${saturationAdjust / 100})`
                    : ''
            const smooth =
                skinSmoothing > 0
                    ? `blur(${(skinSmoothing * 0.0065).toFixed(2)}px)`
                    : ''
            const rosy =
                rosyTone > 0
                    ? `hue-rotate(-${(rosyTone * 0.075).toFixed(1)}deg) saturate(${1 + rosyTone * 0.0025})`
                    : ''
            const clarity =
                glowClarity > 0 ? `contrast(${1 + glowClarity * 0.0016})` : ''

            const parts = [b, c, s, smooth, rosy, clarity].filter(Boolean)
            return parts.length > 0 ? parts.join(' ') : 'none'
        },

        getCameraTransformCss: (_mirror?: boolean) => {
            return 'scaleX(-1)'
        },

        getEffectiveFilterCss: () => {
            const state = get() as any
            const selectedFilter = state.selectedFilter
            const beautyCss = get().getBeautyFilterCss()
            const base =
                selectedFilter && selectedFilter.cssFilter !== 'none'
                    ? selectedFilter.cssFilter
                    : ''
            const beauty = beautyCss === 'none' ? '' : beautyCss
            const parts = [base, beauty].filter(Boolean)
            return parts.length > 0 ? parts.join(' ') : 'none'
        },

        ringLightEnabled: (() => {
            try {
                if (typeof window !== 'undefined') {
                    const v = localStorage.getItem(
                        'fotolism_ring_light_enabled'
                    )
                    return v !== null ? v === 'true' : false
                }
                return false
            } catch {
                return false
            }
        })(),
        ringLightLevel: (() => {
            try {
                if (typeof window !== 'undefined') {
                    const v = localStorage.getItem('fotolism_ring_light_level')
                    return v ? Number(v) : 75
                }
                return 75
            } catch {
                return 75
            }
        })(),
        setRingLightEnabled: (ringLightEnabled) => {
            try {
                if (typeof window !== 'undefined') {
                    localStorage.setItem(
                        'fotolism_ring_light_enabled',
                        String(ringLightEnabled)
                    )
                }
            } catch {}
            set({ ringLightEnabled })
        },
        setRingLightLevel: (ringLightLevel) => {
            try {
                if (typeof window !== 'undefined') {
                    localStorage.setItem(
                        'fotolism_ring_light_level',
                        String(ringLightLevel)
                    )
                }
            } catch {}
            set({ ringLightLevel })
        },

        countdownSeconds: 8,
        setCountdownSeconds: (countdownSeconds) =>
            set((state: any) => ({
                countdownSeconds,
                eventConfig: state.eventConfig
                    ? { ...state.eventConfig, countdownSeconds }
                    : undefined,
            })),

        availableCameras: [],
        selectedCameraId: null,
        cameraType: (() => {
            try {
                if (typeof window !== 'undefined') {
                    const v = localStorage.getItem('fotolism_camera_type')
                    return (v === 'laptop' ? 'laptop' : 'eos') as
                        'eos' | 'laptop'
                }
                return 'eos'
            } catch {
                return 'eos'
            }
        })(),
        setCameraType: (type: 'eos' | 'laptop') => {
            try {
                if (typeof window !== 'undefined') {
                    localStorage.setItem('fotolism_camera_type', type)
                }
            } catch {}
            set({
                cameraType: type,
                selectedCameraId: type === 'eos' ? 'canon-daemon-stream' : null,
            })
        },
        mirrorCamera: true,
        setCameras: (cameras) => set({ availableCameras: cameras }),
        selectCamera: (id) => set({ selectedCameraId: id }),
        setMirrorCamera: (_mirror?: boolean) => {
            try {
                if (typeof window !== 'undefined') {
                    localStorage.setItem('fotolism_mirror_camera', 'true')
                }
            } catch {}
            set({ mirrorCamera: true })
        },
    }
}
