// ─── Bộ Lọc Màu (Color Filters) — Quy chuẩn chỉ gồm 3 bộ lọc cốt lõi ────────────
import { BW_CSS_FILTER } from './bwFilter'

export interface ColorFilterItem {
    id: string
    name: string
    cssFilter: string
    tag: string
    previewColor: string
    hasGrain?: boolean
}

export const COLOR_FILTERS: ColorFilterItem[] = [
    {
        id: 'normal',
        name: 'Natural',
        cssFilter: 'none',
        tag: '',
        previewColor: '#E4D2C3',
    },
    {
        id: 'vintage_noir',
        name: 'B&W',
        cssFilter: BW_CSS_FILTER,
        tag: '',
        previewColor: '#262626',
    },
    {
        id: 'retro_90s',
        name: 'Vintage',
        cssFilter:
            'contrast(0.92) brightness(0.90) sepia(0.28) saturate(0.92) hue-rotate(-6deg)',
        tag: '',
        previewColor: '#8B4A39',
        hasGrain: true,
    },
]

// ─── Bộ lọc riêng cho Selfbooth (Nature / B&W / Retro / Snow PNG) ──────────────
export const SELFBOOTH_FILTERS: ColorFilterItem[] = [
    {
        id: 'normal',
        name: 'Nature',
        cssFilter: 'none',
        tag: '',
        previewColor: '#E4D2C3',
    },
    {
        id: 'vintage_noir',
        name: 'B&W',
        cssFilter: BW_CSS_FILTER,
        tag: '',
        previewColor: '#262626',
    },
    {
        id: 'retro_90s',
        name: 'Retro',
        cssFilter:
            'contrast(0.92) brightness(0.90) sepia(0.28) saturate(0.92) hue-rotate(-6deg)',
        tag: '',
        previewColor: '#8B4A39',
        hasGrain: true,
    },
    {
        id: 'snow',
        name: 'Snow',
        cssFilter: 'none',
        tag: '',
        previewColor: '#B8DCFF',
    },
]
