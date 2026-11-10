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
  { id: 'normal',       name: 'Tự nhiên',     cssFilter: 'none', tag: '', previewColor: '#E4D2C3' },
  { id: 'vintage_noir', name: 'Cổ điển',      cssFilter: 'grayscale(100%) contrast(1.18) brightness(1.05)', tag: '', previewColor: '#262626' },
  { id: 'retro_90s',    name: 'Retro 90s',    cssFilter: 'sepia(0.28) contrast(1.14) brightness(1.02) saturate(1.28)', tag: '', previewColor: '#96532B', hasGrain: true },
]
