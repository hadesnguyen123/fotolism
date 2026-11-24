import type { FrameSize } from './layouts'

export interface ThemeSlot {
    x: number
    y: number
    w: number
    h: number
}

export interface ThemeItem {
    id: string
    name: string
    bgColor: string
    bgGradient: string
    textColor: string
    borderColor: string
    overlayUrl?: string
    hideFooter?: boolean
    decorations?: string[]
    layoutId?: string // '4_strip_classic' | '4_grid_2x2' | '9_grid_3x3'
    frameSize?: FrameSize // '2x6' | '4x6'
    slots?: ThemeSlot[]
    canvasWidth?: number
    canvasHeight?: number
}

export const THEME_OPTIONS: ThemeItem[] = [
    // ── KHUNG 2x6 (4 ảnh - layout 4_strip_classic) ──────────────────────────────
    {
        id: 'theme_2x6_black_film',
        name: 'Film Đen Cổ Điển',
        bgColor: '#000000',
        bgGradient: '#000000',
        textColor: '#FFFFFF',
        borderColor: '#1F1F1F',
        overlayUrl: './frames/2x6_4_BlackFilm.png',
        hideFooter: true,
        layoutId: '4_strip_classic',
        frameSize: '2x6',
        slots: [
            { x: 82, y: 176, w: 1036, h: 684 },
            { x: 82, y: 928, w: 1036, h: 684 },
            { x: 82, y: 1680, w: 1036, h: 684 },
            { x: 82, y: 2432, w: 1036, h: 684 },
        ],
    },
    {
        id: 'theme_2x6_blue_stars',
        name: 'Ngôi Sao Xanh',
        bgColor: '#EEF5FC',
        bgGradient: '#EEF5FC',
        textColor: '#1E3A8A',
        borderColor: '#BFDBFE',
        overlayUrl: './frames/2x6_4_BlueStars.png',
        hideFooter: true,
        layoutId: '4_strip_classic',
        frameSize: '2x6',
        slots: [
            { x: 72, y: 166, w: 1056, h: 704 },
            { x: 72, y: 918, w: 1056, h: 704 },
            { x: 72, y: 1670, w: 1056, h: 704 },
            { x: 72, y: 2422, w: 1056, h: 704 },
        ],
    },
    {
        id: 'theme_2x6_brown_dot',
        name: 'Chấm Bi Nâu',
        bgColor: '#FAF6F0',
        bgGradient: '#FAF6F0',
        textColor: '#502A1D',
        borderColor: '#D7C4B7',
        overlayUrl: './frames/2x6_4_BrownDots.png',
        hideFooter: true,
        layoutId: '4_strip_classic',
        frameSize: '2x6',
        slots: [
            { x: 72, y: 166, w: 1056, h: 704 },
            { x: 72, y: 918, w: 1056, h: 704 },
            { x: 72, y: 1670, w: 1056, h: 704 },
            { x: 72, y: 2422, w: 1056, h: 704 },
        ],
    },
    {
        id: 'theme_2x6_brown_ren',
        name: 'Ren Nâu Vintage',
        bgColor: '#FAF6F0',
        bgGradient: '#FAF6F0',
        textColor: '#502A1D',
        borderColor: '#D7C4B7',
        overlayUrl: './frames/2x6_4_BrownRen.png',
        hideFooter: true,
        layoutId: '4_strip_classic',
        frameSize: '2x6',
        slots: [
            { x: 72, y: 284, w: 1056, h: 704 },
            { x: 72, y: 1036, w: 1056, h: 704 },
            { x: 72, y: 1788, w: 1056, h: 704 },
            { x: 72, y: 2540, w: 1056, h: 704 },
        ],
    },
    {
        id: 'theme_2x6_creme',
        name: 'Kem Tối Giản',
        bgColor: '#FAF7F2',
        bgGradient: '#FAF7F2',
        textColor: '#502A1D',
        borderColor: '#E5DDD5',
        overlayUrl: './frames/2x6_4_Creme.png',
        hideFooter: true,
        layoutId: '4_strip_classic',
        frameSize: '2x6',
        slots: [
            { x: 72, y: 166, w: 1056, h: 704 },
            { x: 72, y: 918, w: 1056, h: 704 },
            { x: 72, y: 1670, w: 1056, h: 704 },
            { x: 72, y: 2422, w: 1056, h: 704 },
        ],
    },
    {
        id: 'theme_2x6_jean_stars',
        name: 'Jean Ngôi Sao',
        bgColor: '#2B4C7E',
        bgGradient: '#2B4C7E',
        textColor: '#FFFFFF',
        borderColor: '#4A6FA5',
        overlayUrl: './frames/2x6_4_StarJeans.png',
        hideFooter: true,
        layoutId: '4_strip_classic',
        frameSize: '2x6',
        slots: [
            { x: 72, y: 166, w: 1056, h: 704 },
            { x: 72, y: 918, w: 1056, h: 704 },
            { x: 72, y: 1670, w: 1056, h: 704 },
            { x: 72, y: 2422, w: 1056, h: 704 },
        ],
    },

    // ── KHUNG 4x6 (4 ảnh - layout 4_grid_2x2) ──────────────────────────────────
    {
        id: 'theme_4x6_black_film',
        name: 'Film Đen Cổ Điển',
        bgColor: '#000000',
        bgGradient: '#000000',
        textColor: '#FFFFFF',
        borderColor: '#1F1F1F',
        overlayUrl: './frames/4x6_4_BlackFilm.png',
        hideFooter: true,
        layoutId: '4_grid_2x2',
        frameSize: '4x6',
        slots: [
            { x: 102, y: 102, w: 1068, h: 1430 },
            { x: 1230, y: 102, w: 1068, h: 1430 },
            { x: 102, y: 1592, w: 1068, h: 1430 },
            { x: 1230, y: 1592, w: 1068, h: 1430 },
        ],
    },
    {
        id: 'theme_4x6_blue_star',
        name: 'Ngôi Sao Xanh',
        bgColor: '#EEF5FC',
        bgGradient: '#EEF5FC',
        textColor: '#1E3A8A',
        borderColor: '#BFDBFE',
        overlayUrl: './frames/4x6_4_BlueStars.png',
        hideFooter: true,
        layoutId: '4_grid_2x2',
        frameSize: '4x6',
        slots: [
            { x: 92, y: 92, w: 1088, h: 1452 },
            { x: 1220, y: 92, w: 1088, h: 1452 },
            { x: 92, y: 1584, w: 1088, h: 1452 },
            { x: 1220, y: 1584, w: 1088, h: 1452 },
        ],
    },
    {
        id: 'theme_4x6_brown_dots',
        name: 'Chấm Bi Nâu',
        bgColor: '#FAF6F0',
        bgGradient: '#FAF6F0',
        textColor: '#502A1D',
        borderColor: '#D7C4B7',
        overlayUrl: './frames/4x6_4_BrownDots.png',
        hideFooter: true,
        layoutId: '4_grid_2x2',
        frameSize: '4x6',
        slots: [
            { x: 92, y: 92, w: 1088, h: 1452 },
            { x: 1220, y: 92, w: 1088, h: 1452 },
            { x: 92, y: 1584, w: 1088, h: 1452 },
            { x: 1220, y: 1584, w: 1088, h: 1452 },
        ],
    },
    {
        id: 'theme_4x6_brown_ren',
        name: 'Ren Nâu Vintage',
        bgColor: '#FAF6F0',
        bgGradient: '#FAF6F0',
        textColor: '#502A1D',
        borderColor: '#D7C4B7',
        overlayUrl: './frames/4x6_4_BrownRen.png',
        hideFooter: true,
        layoutId: '4_grid_2x2',
        frameSize: '4x6',
        slots: [
            { x: 92, y: 298, w: 1088, h: 1452 },
            { x: 1220, y: 298, w: 1088, h: 1452 },
            { x: 92, y: 1790, w: 1088, h: 1452 },
            { x: 1220, y: 1790, w: 1088, h: 1452 },
        ],
    },
    {
        id: 'theme_4x6_creme',
        name: 'Kem Tối Giản',
        bgColor: '#FAF7F2',
        bgGradient: '#FAF7F2',
        textColor: '#502A1D',
        borderColor: '#E5DDD5',
        overlayUrl: './frames/4x6_4_Creme.png',
        hideFooter: true,
        layoutId: '4_grid_2x2',
        frameSize: '4x6',
        slots: [
            { x: 92, y: 92, w: 1088, h: 1452 },
            { x: 1220, y: 92, w: 1088, h: 1452 },
            { x: 92, y: 1584, w: 1088, h: 1452 },
            { x: 1220, y: 1584, w: 1088, h: 1452 },
        ],
    },
    {
        id: 'theme_4x6_star_jeans',
        name: 'Jean Ngôi Sao',
        bgColor: '#2B4C7E',
        bgGradient: '#2B4C7E',
        textColor: '#FFFFFF',
        borderColor: '#4A6FA5',
        overlayUrl: './frames/4x6_4_StarJeans.png',
        hideFooter: true,
        layoutId: '4_grid_2x2',
        frameSize: '4x6',
        slots: [
            { x: 92, y: 92, w: 1088, h: 1452 },
            { x: 1220, y: 92, w: 1088, h: 1452 },
            { x: 92, y: 1584, w: 1088, h: 1452 },
            { x: 1220, y: 1584, w: 1088, h: 1452 },
        ],
    },

    // ── KHUNG 4x6 (9 ảnh - layout 9_grid_3x3) ──────────────────────────────────
    {
        id: 'theme_4x6_9_black',
        name: 'Đen Tối Giản (9 ô)',
        bgColor: '#000000',
        bgGradient: '#000000',
        textColor: '#FFFFFF',
        borderColor: '#27272A',
        overlayUrl: './frames/4x6_9_Black.png',
        hideFooter: true,
        layoutId: '9_grid_3x3',
        frameSize: '4x6',
        slots: [
            { x: 40, y: 40, w: 762, h: 1162 },
            { x: 820, y: 40, w: 762, h: 1162 },
            { x: 1598, y: 40, w: 762, h: 1162 },
            { x: 40, y: 1220, w: 762, h: 1162 },
            { x: 820, y: 1220, w: 762, h: 1162 },
            { x: 1598, y: 1220, w: 762, h: 1162 },
            { x: 40, y: 2398, w: 762, h: 1162 },
            { x: 820, y: 2398, w: 762, h: 1162 },
            { x: 1598, y: 2398, w: 762, h: 1162 },
        ],
    },
]
