// ─── Bộ Lọc Màu (Color Filters) — Quy chuẩn chỉ gồm 3 bộ lọc cốt lõi ────────────
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
        name: 'Tự nhiên',
        cssFilter: 'none',
        tag: '',
        previewColor: '#E4D2C3',
    },
    {
        id: 'vintage_noir',
        name: 'Cổ điển',
        cssFilter: 'grayscale(100%) contrast(1.18) brightness(1.05)',
        tag: '',
        previewColor: '#262626',
    },
    {
        id: 'retro_90s',
        name: 'Retro 90s',
        cssFilter:
            'sepia(0.38) hue-rotate(-14deg) saturate(1.2) contrast(1.08) brightness(0.98)',
        tag: '',
        previewColor: '#8B4A39',
        hasGrain: true,
    },
]
