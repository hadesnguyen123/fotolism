import type { StateCreator } from 'zustand'
import type { FrameSize, LayoutCategory, GridLayoutItem } from '../../config/layouts'
import { ALL_LAYOUTS } from '../../config/layouts'
import type { ThemeItem } from '../../config/themes'
import { THEME_OPTIONS } from '../../config/themes'
import type { PlacedSticker } from '../../config/stickers'
import type { ColorFilterItem } from '../../config/filters'
import { COLOR_FILTERS } from '../../config/filters'

export interface LayoutThemeSlice {
  selectedFrameSize: FrameSize
  selectFrameSize: (size: FrameSize) => void
  selectedCategory: LayoutCategory
  selectCategory: (cat: LayoutCategory) => void
  selectedLayout: GridLayoutItem
  selectLayout: (layout: GridLayoutItem) => void
  selectedTheme: ThemeItem
  selectTheme: (theme: ThemeItem) => void
  placedStickers: PlacedSticker[]
  addSticker: (icon: string) => string
  updateSticker: (id: string, updates: Partial<PlacedSticker>) => void
  removeSticker: (id: string) => void
  clearStickers: () => void
  selectedFilter: ColorFilterItem
  selectFilter: (filter: ColorFilterItem) => void
}

export const createLayoutThemeSlice: StateCreator<any, [], [], LayoutThemeSlice> = (set) => ({
  selectedFrameSize: '2x6',
  selectFrameSize: (size) => {
    set((state: any) => {
      const isStrip = size === '2x6'
      const defaultCopies = isStrip ? 2 : 1
      if (state.selectedLayout && state.selectedLayout.strip === isStrip) {
        return {
          selectedFrameSize: size,
          selectedCopies: defaultCopies,
        }
      }
      const defaultLayout = isStrip ? ALL_LAYOUTS[4][0] : (ALL_LAYOUTS[4][1] || ALL_LAYOUTS[4][0])
      return {
        selectedFrameSize: size,
        selectedCategory: defaultLayout.photosCount as any,
        selectedLayout: defaultLayout,
        selectedCopies: defaultCopies,
      }
    })
  },

  selectedCategory: 4,
  selectCategory: (cat) => {
    const list = ALL_LAYOUTS[cat] || ALL_LAYOUTS[4]
    set({ selectedCategory: cat, selectedLayout: list[0] })
  },
  selectedLayout: ALL_LAYOUTS[4][0],
  selectLayout: (layout) => set({ selectedLayout: layout }),

  selectedTheme: THEME_OPTIONS[0],
  selectTheme: (theme) => set({ selectedTheme: theme }),

  selectedFilter: COLOR_FILTERS[0],
  selectFilter: (filter) => set({ selectedFilter: filter }),

  placedStickers: [],
  addSticker: (icon) => {
    const newId = `st_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`
    set((state: any) => ({
      placedStickers: [
        ...state.placedStickers,
        {
          id: newId,
          icon,
          x: Math.floor(30 + Math.random() * 40),
          y: Math.floor(30 + Math.random() * 40),
          scale: 1,
          rotation: Math.floor((Math.random() - 0.5) * 20),
        },
      ],
    }))
    return newId
  },
  updateSticker: (id, updates) =>
    set((state: any) => ({
      placedStickers: state.placedStickers.map((s: PlacedSticker) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    })),
  removeSticker: (id) =>
    set((state: any) => ({
      placedStickers: state.placedStickers.filter((s: PlacedSticker) => s.id !== id),
    })),
  clearStickers: () => set({ placedStickers: [] }),
})
