import {
  DEFAULT_PRICE_2X6,
  DEFAULT_PRICE_4X6,
} from '../lib/constants'

export type FrameSize = '2x6' | '4x6'

// ─── Khung Kích Thước (Frame Size) ──────────────────────────────────────────
export interface FrameSizeOption {
  id: FrameSize
  name: string
  subtitle: string
  price: string
  aspectRatio: string
  description: string
  previewImage: string
}

export const FRAME_SIZE_OPTIONS: FrameSizeOption[] = [
  {
    id: '2x6',
    name: 'KHUNG 2X6 INCH',
    subtitle: 'Dải Strip Photobooth Cổ Điển',
    price: `${new Intl.NumberFormat('vi-VN').format(DEFAULT_PRICE_2X6)}đ`,
    aspectRatio: '1 / 3',
    description: 'Bản in dải strip đôi thời thượng, lý tưởng để kẹp ví hoặc dán ốp lưng',
    previewImage: 'strip_2x6',
  },
  {
    id: '4x6',
    name: 'KHUNG 4X6 INCH',
    subtitle: 'Bưu Thiếp Postcard Tiêu Chuẩn',
    price: `${new Intl.NumberFormat('vi-VN').format(DEFAULT_PRICE_4X6)}đ`,
    aspectRatio: '2 / 3',
    description: 'Khổ ảnh bưu thiếp sang trọng, chứa được nhiều người và bố cục đa dạng',
    previewImage: 'postcard_4x6',
  },
]

// ─── Bố Cục Theo Danh Mục Ảnh (Layouts categorized by photo count) ────────────
export type LayoutCategory = 1 | 3 | 4 | 6 | 8 | 9

export interface GridLayoutItem {
  id: string
  name: string
  photosCount: number
  cols: number
  rows: number
  strip: boolean
  description: string
  previewType: '1_single' | '3_strip' | '4_strip' | '4_grid' | '6_grid' | '8_grid' | '9_grid'
  disabled?: boolean
}

export const ALL_LAYOUTS: Record<LayoutCategory, GridLayoutItem[]> = {
  1: [
    { id: '1_full_portrait', name: '1 ảnh Chân Dung', photosCount: 1, cols: 1, rows: 1, strip: false, description: '1 ảnh đơn phóng lớn', previewType: '1_single', disabled: true },
  ],
  3: [
    { id: '3_vertical_strip', name: '3 ảnh Dọc Strip', photosCount: 3, cols: 1, rows: 3, strip: true, description: '3 ảnh dải đứng (2x6)', previewType: '3_strip', disabled: true },
  ],
  4: [
    { id: '4_strip_classic', name: '4 ảnh Dọc Strip (2x6)', photosCount: 4, cols: 1, rows: 4, strip: true, description: '4 ảnh dải đứng (2x6)', previewType: '4_strip', disabled: false },
    { id: '4_grid_2x2', name: '4 ảnh Lưới Vuông (4x6)', photosCount: 4, cols: 2, rows: 2, strip: false, description: '4 ảnh lưới 2x2 (4x6)', previewType: '4_grid', disabled: false },
  ],
  6: [
    { id: '6_grid_2x3', name: '6 ảnh Lưới Dọc (2x3)', photosCount: 6, cols: 2, rows: 3, strip: false, description: '6 ảnh lưới 2 cột 3 hàng (4x6)', previewType: '6_grid', disabled: true },
    { id: '6_grid_3x2', name: '6 ảnh Lưới Ngang (3x2)', photosCount: 6, cols: 3, rows: 2, strip: false, description: '6 ảnh lưới 3 cột 2 hàng (4x6)', previewType: '6_grid', disabled: true },
  ],
  8: [
    { id: '8_grid_2x4', name: '8 ảnh Lưới Mini (2x4)', photosCount: 8, cols: 2, rows: 4, strip: false, description: '8 ảnh mini siêu vui (4x6)', previewType: '8_grid', disabled: true },
  ],
  9: [
    { id: '9_grid_3x3', name: '9 ảnh Lưới Vuông (4x6)', photosCount: 9, cols: 3, rows: 3, strip: false, description: '9 ảnh lưới 3 cột 3 hàng (4x6)', previewType: '9_grid', disabled: false },
  ],
}
