import { create } from 'zustand'
import {
  DEFAULT_EVENT_NAME,
  DEFAULT_ADMIN_PIN,
  DEFAULT_ACCOUNT_HOLDER,
  DEFAULT_COUPON_CODE,
  DEFAULT_BANK_BIN,
  DEFAULT_BANK_NAME,
  DEFAULT_ACCOUNT_NUMBER,
  DEFAULT_PRICE_2X6,
  DEFAULT_PRICE_4X6,
  DEFAULT_EXTRA_COPY_PRICE_2X6,
  DEFAULT_EXTRA_COPY_PRICE_4X6,
  DEFAULT_IDLE_TIMEOUT_SECONDS,
  DEFAULT_SELFBOOTH_DURATION_SECONDS,
  DEFAULT_TIMELAPSE_SPEED,
  DEFAULT_GDRIVE_FOLDER_ID,
  DEFAULT_GDRIVE_FOLDER_URL,
  DEFAULT_GDRIVE_WEBHOOK_URL,
  SAVE_ROOT_DIR,
  LS_BEAUTY_CONFIG_KEY,
  LS_EVENT_CONFIG_KEY,
} from '../lib/constants'
import type { DeviceConfig } from '../services/cloudSyncService'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AppScreen =
  | 'activate'
  | 'idle'
  | 'select-size'
  | 'select-layout'
  | 'confirm'
  | 'payment'
  | 'capture'
  | 'select-theme'
  | 'select-filter'
  | 'select-sticker'
  | 'processing'
  | 'review'
  | 'admin'
  | 'selfbooth-setup'
  | 'selfbooth-select'

export type BoothMode = 'attended' | 'unattended'
export type CaptureMode = 'photobooth' | 'selfbooth'
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

// ─── Chủ Đề Khung Hình (Themes) ───────────────────────────────────────────────
export type ThemeCategory = 'Một màu' | 'Khác' | 'Ngày lễ' | 'Thời trang' | 'Trào lưu'

export interface ThemeSlot {
  x: number
  y: number
  w: number
  h: number
}

export interface ThemeItem {
  id: string
  name: string
  category: ThemeCategory
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
}

export const THEME_OPTIONS: ThemeItem[] = [
  // ── KHUNG 2x6 (4 ảnh - layout 4_strip_classic) ──────────────────────────────
  {
    id: 'theme_2x6_black_film',
    name: 'Film Đen Cổ Điển',
    category: 'Thời trang',
    bgColor: '#141414',
    bgGradient: '#141414',
    textColor: '#FFFFFF',
    borderColor: '#1F1F1F',
    overlayUrl: '/frames/2x6_4_BlackFilm.png',
    hideFooter: true,
    layoutId: '4_strip_classic',
    frameSize: '2x6',
    slots: [
      { x: 41, y: 88, w: 518, h: 342 },
      { x: 41, y: 464, w: 518, h: 342 },
      { x: 41, y: 840, w: 518, h: 342 },
      { x: 41, y: 1216, w: 518, h: 342 },
    ],
  },
  {
    id: 'theme_2x6_blue_stars',
    name: 'Ngôi Sao Xanh',
    category: 'Thời trang',
    bgColor: '#EEF5FC',
    bgGradient: '#EEF5FC',
    textColor: '#1E3A8A',
    borderColor: '#BFDBFE',
    overlayUrl: '/frames/2x6_4_BlueStars1.png',
    hideFooter: true,
    layoutId: '4_strip_classic',
    frameSize: '2x6',
    slots: [
      { x: 36, y: 142, w: 528, h: 352 },
      { x: 36, y: 518, w: 528, h: 352 },
      { x: 36, y: 894, w: 528, h: 352 },
      { x: 36, y: 1270, w: 528, h: 352 },
    ],
  },
  {
    id: 'theme_2x6_brown_dot',
    name: 'Chấm Bi Nâu',
    category: 'Khác',
    bgColor: '#FAF6F0',
    bgGradient: '#FAF6F0',
    textColor: '#502A1D',
    borderColor: '#D7C4B7',
    overlayUrl: '/frames/2x6_4_BrownDot1.png',
    hideFooter: true,
    layoutId: '4_strip_classic',
    frameSize: '2x6',
    slots: [
      { x: 36, y: 142, w: 528, h: 352 },
      { x: 36, y: 518, w: 528, h: 352 },
      { x: 36, y: 894, w: 528, h: 352 },
      { x: 36, y: 1270, w: 528, h: 352 },
    ],
  },
  {
    id: 'theme_2x6_brown_ren',
    name: 'Ren Nâu Vintage',
    category: 'Khác',
    bgColor: '#FAF6F0',
    bgGradient: '#FAF6F0',
    textColor: '#502A1D',
    borderColor: '#D7C4B7',
    overlayUrl: '/frames/2x6_4_BrownRen1.png',
    hideFooter: true,
    layoutId: '4_strip_classic',
    frameSize: '2x6',
    slots: [
      { x: 36, y: 142, w: 528, h: 352 },
      { x: 36, y: 518, w: 528, h: 352 },
      { x: 36, y: 894, w: 528, h: 352 },
      { x: 36, y: 1270, w: 528, h: 352 },
    ],
  },
  {
    id: 'theme_2x6_creme',
    name: 'Kem Tối Giản',
    category: 'Một màu',
    bgColor: '#FAF7F2',
    bgGradient: '#FAF7F2',
    textColor: '#502A1D',
    borderColor: '#E5DDD5',
    overlayUrl: '/frames/2x6_4_Creme.png',
    hideFooter: true,
    layoutId: '4_strip_classic',
    frameSize: '2x6',
    slots: [
      { x: 36, y: 83, w: 528, h: 352 },
      { x: 36, y: 459, w: 528, h: 352 },
      { x: 36, y: 835, w: 528, h: 352 },
      { x: 36, y: 1211, w: 528, h: 352 },
    ],
  },
  {
    id: 'theme_2x6_jean_stars',
    name: 'Jean Ngôi Sao',
    category: 'Trào lưu',
    bgColor: '#2B4C7E',
    bgGradient: '#2B4C7E',
    textColor: '#FFFFFF',
    borderColor: '#4A6FA5',
    overlayUrl: '/frames/2x6_4_JeanStars.png',
    hideFooter: true,
    layoutId: '4_strip_classic',
    frameSize: '2x6',
    slots: [
      { x: 36, y: 83, w: 528, h: 352 },
      { x: 36, y: 459, w: 528, h: 352 },
      { x: 36, y: 835, w: 528, h: 352 },
      { x: 36, y: 1211, w: 528, h: 352 },
    ],
  },

  // ── KHUNG 4x6 (4 ảnh - layout 4_grid_2x2) ──────────────────────────────────
  {
    id: 'theme_4x6_black_film',
    name: 'Film Đen Cổ Điển',
    category: 'Thời trang',
    bgColor: '#141414',
    bgGradient: '#141414',
    textColor: '#FFFFFF',
    borderColor: '#1F1F1F',
    overlayUrl: '/frames/4x6_4_BlackFilm.png',
    hideFooter: true,
    layoutId: '4_grid_2x2',
    frameSize: '4x6',
    slots: [
      { x: 51, y: 51, w: 534, h: 715 },
      { x: 615, y: 51, w: 534, h: 715 },
      { x: 51, y: 796, w: 534, h: 715 },
      { x: 615, y: 796, w: 534, h: 715 },
    ],
  },
  {
    id: 'theme_4x6_blue_star',
    name: 'Ngôi Sao Xanh',
    category: 'Thời trang',
    bgColor: '#EEF5FC',
    bgGradient: '#EEF5FC',
    textColor: '#1E3A8A',
    borderColor: '#BFDBFE',
    overlayUrl: '/frames/4x6_4_BlueStar.png',
    hideFooter: true,
    layoutId: '4_grid_2x2',
    frameSize: '4x6',
    slots: [
      { x: 46, y: 46, w: 544, h: 726 },
      { x: 610, y: 46, w: 544, h: 726 },
      { x: 46, y: 792, w: 544, h: 726 },
      { x: 610, y: 792, w: 544, h: 726 },
    ],
  },
  {
    id: 'theme_4x6_brown_dots',
    name: 'Chấm Bi Nâu',
    category: 'Khác',
    bgColor: '#FAF6F0',
    bgGradient: '#FAF6F0',
    textColor: '#502A1D',
    borderColor: '#D7C4B7',
    overlayUrl: '/frames/4x6_4_BrownDots.png',
    hideFooter: true,
    layoutId: '4_grid_2x2',
    frameSize: '4x6',
    slots: [
      { x: 46, y: 46, w: 544, h: 726 },
      { x: 610, y: 46, w: 544, h: 726 },
      { x: 46, y: 792, w: 544, h: 726 },
      { x: 610, y: 792, w: 544, h: 726 },
    ],
  },
  {
    id: 'theme_4x6_brown_ren',
    name: 'Ren Nâu Vintage',
    category: 'Khác',
    bgColor: '#FAF6F0',
    bgGradient: '#FAF6F0',
    textColor: '#502A1D',
    borderColor: '#D7C4B7',
    overlayUrl: '/frames/4x6_4_BrownRen2.png',
    hideFooter: true,
    layoutId: '4_grid_2x2',
    frameSize: '4x6',
    slots: [
      { x: 46, y: 149, w: 544, h: 726 },
      { x: 610, y: 149, w: 544, h: 726 },
      { x: 46, y: 895, w: 544, h: 726 },
      { x: 610, y: 895, w: 544, h: 726 },
    ],
  },
  {
    id: 'theme_4x6_creme',
    name: 'Kem Tối Giản',
    category: 'Một màu',
    bgColor: '#FAF7F2',
    bgGradient: '#FAF7F2',
    textColor: '#502A1D',
    borderColor: '#E5DDD5',
    overlayUrl: '/frames/4x6_4_Creme.png',
    hideFooter: true,
    layoutId: '4_grid_2x2',
    frameSize: '4x6',
    slots: [
      { x: 46, y: 46, w: 544, h: 726 },
      { x: 610, y: 46, w: 544, h: 726 },
      { x: 46, y: 792, w: 544, h: 726 },
      { x: 610, y: 792, w: 544, h: 726 },
    ],
  },
  {
    id: 'theme_4x6_star_jeans',
    name: 'Jean Ngôi Sao',
    category: 'Trào lưu',
    bgColor: '#2B4C7E',
    bgGradient: '#2B4C7E',
    textColor: '#FFFFFF',
    borderColor: '#4A6FA5',
    overlayUrl: '/frames/4x6_4_StarJeans.png',
    hideFooter: true,
    layoutId: '4_grid_2x2',
    frameSize: '4x6',
    slots: [
      { x: 46, y: 46, w: 544, h: 726 },
      { x: 610, y: 46, w: 544, h: 726 },
      { x: 46, y: 792, w: 544, h: 726 },
      { x: 610, y: 792, w: 544, h: 726 },
    ],
  },

  // ── KHUNG 4x6 (9 ảnh - layout 9_grid_3x3) ──────────────────────────────────
  {
    id: 'theme_4x6_9_black',
    name: 'Đen Tối Giản (9 ô)',
    category: 'Một màu',
    bgColor: '#18181B',
    bgGradient: '#18181B',
    textColor: '#FFFFFF',
    borderColor: '#27272A',
    overlayUrl: '/frames/4x6_9_Black.png',
    hideFooter: true,
    layoutId: '9_grid_3x3',
    frameSize: '4x6',
    slots: [
      { x: 20, y: 20, w: 381, h: 581 },
      { x: 410, y: 20, w: 381, h: 581 },
      { x: 799, y: 20, w: 381, h: 581 },
      { x: 20, y: 610, w: 381, h: 581 },
      { x: 410, y: 610, w: 381, h: 581 },
      { x: 799, y: 610, w: 381, h: 581 },
      { x: 20, y: 1199, w: 381, h: 581 },
      { x: 410, y: 1199, w: 381, h: 581 },
      { x: 799, y: 1199, w: 381, h: 581 },
    ],
  },
  {
    id: 'theme_4x6_9_white',
    name: 'Trắng Tối Giản (9 ô)',
    category: 'Một màu',
    bgColor: '#FFFFFF',
    bgGradient: '#FFFFFF',
    textColor: '#351C15',
    borderColor: '#E5DDD5',
    hideFooter: false,
    layoutId: '9_grid_3x3',
    frameSize: '4x6',
    slots: [
      { x: 20, y: 20, w: 381, h: 581 },
      { x: 410, y: 20, w: 381, h: 581 },
      { x: 799, y: 20, w: 381, h: 581 },
      { x: 20, y: 610, w: 381, h: 581 },
      { x: 410, y: 610, w: 381, h: 581 },
      { x: 799, y: 610, w: 381, h: 581 },
      { x: 20, y: 1199, w: 381, h: 581 },
      { x: 410, y: 1199, w: 381, h: 581 },
      { x: 799, y: 1199, w: 381, h: 581 },
    ],
  },
  {
    id: 'theme_4x6_9_espresso',
    name: 'Nâu Cổ Điển (9 ô)',
    category: 'Một màu',
    bgColor: '#502A1D',
    bgGradient: '#502A1D',
    textColor: '#FFFFFF',
    borderColor: '#3D1F15',
    hideFooter: false,
    layoutId: '9_grid_3x3',
    frameSize: '4x6',
    slots: [
      { x: 20, y: 20, w: 381, h: 581 },
      { x: 410, y: 20, w: 381, h: 581 },
      { x: 799, y: 20, w: 381, h: 581 },
      { x: 20, y: 610, w: 381, h: 581 },
      { x: 410, y: 610, w: 381, h: 581 },
      { x: 799, y: 610, w: 381, h: 581 },
      { x: 20, y: 1199, w: 381, h: 581 },
      { x: 410, y: 1199, w: 381, h: 581 },
      { x: 799, y: 1199, w: 381, h: 581 },
    ],
  },
]

// ─── Stickers Trang Trí ───────────────────────────────────────────────────────
export type StickerCategory = 'Heart' | 'Emoji' | 'Cute' | 'Event' | 'Styles'

export interface StickerOption {
  id: string
  category: StickerCategory
  icon: string
  label: string
}

export const STICKER_LIBRARY: StickerOption[] = [
  // Heart
  { id: 'st_heart_pink', category: 'Heart', icon: '💖', label: 'Lấp lánh' },
  { id: 'st_heart_sparkle', category: 'Heart', icon: '💕', label: 'Trái tim đôi' },
  { id: 'st_heart_love', category: 'Heart', icon: '❤️', label: 'Tình yêu' },
  { id: 'st_heart_ribbon', category: 'Heart', icon: '💝', label: 'Hộp quà' },
  { id: 'st_heart_growing', category: 'Heart', icon: '💗', label: 'Rộn ràng' },

  // Cute
  { id: 'st_cute_bunny', category: 'Cute', icon: '🐰', label: 'Thỏ con' },
  { id: 'st_cute_cat', category: 'Cute', icon: '🐱', label: 'Mèo cưng' },
  { id: 'st_cute_butterfly', category: 'Cute', icon: '🦋', label: 'Bướm tím' },
  { id: 'st_cute_mushroom', category: 'Cute', icon: '🍄', label: 'Nấm đỏ' },
  { id: 'st_cute_rainbow', category: 'Cute', icon: '🌈', label: 'Cầu vồng' },
  { id: 'st_cute_chick', category: 'Cute', icon: '🐤', label: 'Gà con' },

  // Emoji
  { id: 'st_emoji_wink', category: 'Emoji', icon: '😉', label: 'Nháy mắt' },
  { id: 'st_emoji_stars', category: 'Emoji', icon: '🤩', label: 'Mắt sao' },
  { id: 'st_emoji_kiss', category: 'Emoji', icon: '😘', label: 'Thổi hôn' },
  { id: 'st_emoji_cool', category: 'Emoji', icon: '😎', label: 'Ngầu lòi' },

  // Event
  { id: 'st_event_cake', category: 'Event', icon: '🎂', label: 'Bánh kem' },
  { id: 'st_event_balloon', category: 'Event', icon: '🎈', label: 'Bóng bay' },
  { id: 'st_event_cheers', category: 'Event', icon: '🥂', label: 'Nâng ly' },
  { id: 'st_event_flower', category: 'Event', icon: '🌸', label: 'Hoa anh đào' },
  { id: 'st_event_sun', category: 'Event', icon: '☀️', label: 'Mặt trời' },

  // Styles
  { id: 'st_style_crown', category: 'Styles', icon: '👑', label: 'Vương miện' },
  { id: 'st_style_glasses', category: 'Styles', icon: '🕶️', label: 'Kính râm' },
  { id: 'st_style_bandaid', category: 'Styles', icon: '🩹', label: 'Băng cá nhân' },
  { id: 'st_style_sparkle', category: 'Styles', icon: '✨', label: 'Ánh sao' },
  { id: 'st_style_fries', category: 'Styles', icon: '🍟', label: 'Khoai tây chiên' },
]

export interface PlacedSticker {
  id: string
  icon: string
  x: number // percent 0 - 100
  y: number // percent 0 - 100
  scale: number
  rotation: number
}

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

export interface CapturedPhoto {
  id: string
  rawPath: string
  enhancedPath: string
  compositedPath: string
  timestamp: number
}

export interface DiscountCoupon {
  code: string
  type: 'percent' | 'fixed'
  value: number // % hoặc số tiền VND
  description: string
}

export const DEFAULT_DISCOUNT_COUPONS: DiscountCoupon[] = [
  { code: DEFAULT_COUPON_CODE, type: 'percent', value: 10, description: 'Giam 10% tong hoa don' },
  { code: 'GIAM20K', type: 'fixed', value: 20000, description: 'Giảm trực tiếp 20.000đ' },
  { code: 'FREE', type: 'percent', value: 100, description: 'Miễn phí trải nghiệm (0đ)' },
  { code: 'VIP2026', type: 'percent', value: 20, description: 'Khách hàng thân thiết VIP (-20%)' },
]

export interface SessionState {
  sessionId: string
  photos: CapturedPhoto[]
  selfboothLibrary?: CapturedPhoto[]
  selectedFrameSize: FrameSize
  selectedLayout: GridLayoutItem
  selectedTheme: ThemeItem
  placedStickers: PlacedSticker[]
  qrUrl: string | null
  qrImagePath: string | null
  timelapseUrl: string | null
  timelapseDataUrl?: string | null
  compositeStripUrl?: string | null
  gdriveUrl: string | null
  storageUrl?: string | null
  customerName?: string | null
  customerPhone?: string | null
  pinCode?: string | null
  // Thông tin thanh toán đã chốt
  paidAmount: number
  paidCopies: number
  paymentMethod: 'vietqr' | 'cash' | 'free' | null
  discountCodeUsed: string | null
  discountAmount: number
  hasPrinted?: boolean
}

import {
  BEAUTY_PRESETS,
  DEFAULT_BEAUTY_CONFIG,
  type BeautyConfig,
  type BeautyPreset,
} from '../services/beautyEngine'

export { BEAUTY_PRESETS, DEFAULT_BEAUTY_CONFIG, type BeautyConfig, type BeautyPreset }

export function loadSavedBeautyConfig(): BeautyConfig {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(LS_BEAUTY_CONFIG_KEY) : null
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...DEFAULT_BEAUTY_CONFIG, ...parsed }
    }
  } catch {}
  return DEFAULT_BEAUTY_CONFIG
}



export interface EventConfig {
  eventName: string
  eventLogo: string | null
  date: string
  operatorName: string
  countdownSeconds: number
  printEnabled: boolean
  printCopies: number
  qrEnabled: boolean
  // Chế độ chụp Photobooth vs Selfbooth
  captureMode: CaptureMode  // 'photobooth' | 'selfbooth'
  selfboothDurationSeconds: number // Thời gian giới hạn phiên Selfbooth (giây, mặc định 60s)
  // VietQR Kiosk Payment Settings
  paymentQrEnabled: boolean // Bật/tắt thanh toán QR
  paymentRequiredForPhotobooth: boolean // Yêu cầu thanh toán trước khi chụp Photobooth (Mặc định true)
  paymentRequiredForSelfbooth: boolean  // Yêu cầu thanh toán trước khi chụp Selfbooth (Mặc định false)
  bankBin: string           // Mã BIN ngân hàng (VD: 970422 - MB, 970436 - Vietcombank)
  bankName: string          // Tên hiển thị ngân hàng
  accountNumber: string     // Số tài khoản ngân hàng
  accountHolder: string     // Tên chủ tài khoản
  price2x6: number          // Giá gói 2x6 (VND)
  price4x6: number          // Giá gói 4x6 (VND)
  extraCopyPrice2x6: number // Giá bản in thêm 2x6 (VND)
  extraCopyPrice4x6: number // Giá bản in thêm 4x6 (VND)
  discountCoupons: DiscountCoupon[] // Danh sách mã giảm giá
  idleTimeoutSeconds: number
  // Timelapse Video Settings
  timelapseEnabled: boolean
  timelapseSpeed: number // 1.5, 2.0, 2.5, 3.0, 4.0
  // Google Drive Cloud Sync Settings
  gdriveEnabled: boolean
  gdriveFolderId: string
  gdriveFolderUrl: string
  gdriveWebhookUrl: string // URL Google Apps Script Web App để tạo subfolder tự động
  gdriveAutoSync: boolean
  // Storage Settings
  saveDirectory: string
  // Security
  adminPin: string
}

// ─── Global App Store ─────────────────────────────────────────────────────────

interface AppStore {
  // Navigation
  screen: AppScreen
  setScreen: (screen: AppScreen) => void

  // Trạng thái Tạm Khóa Kiosk từ CMS
  isKioskLocked: boolean
  setIsKioskLocked: (locked: boolean) => void

  // Mode
  boothMode: BoothMode
  setBoothMode: (mode: BoothMode) => void

  // Google Drive session sync state
  isSyncingDrive: boolean
  driveSyncDone: boolean
  driveSyncError: string | null
  cloudFolderUrl: string | null
  setIsSyncingDrive: (val: boolean) => void
  setDriveSyncDone: (val: boolean) => void
  setDriveSyncError: (err: string | null) => void
  setCloudFolderUrl: (url: string | null) => void
  compositeStripUrl: string | null
  setCompositeStripUrl: (url: string | null) => void

  // Session
  session: SessionState | null
  startNewSession: () => void
  addPhoto: (photo: CapturedPhoto) => void
  setSessionPhotos: (photos: CapturedPhoto[]) => void
  setSelfboothLibrary: (photos: CapturedPhoto[]) => void
  replaceSessionPhotoAt: (index: number, photo: CapturedPhoto) => void
  removeSessionPhotoAt: (index: number) => void
  clearSession: () => void
  setQr: (url: string, imagePath: string) => void
  setTimelapseUrl: (url: string | null, dataUrl?: string | null) => void
  setGdriveUrl: (url: string | null) => void
  setStorageUrl: (url: string | null) => void
  setCustomerInfo: (info: { customerName?: string | null; customerPhone?: string | null; pinCode?: string | null }) => void

  // Mode settings
  setCaptureMode: (mode: CaptureMode) => void
  setSelfboothDurationSeconds: (seconds: number) => void

  // Photobooth Session Timer: 4 phút từ sau thanh toán tới màn review
  photoboothSessionEndTime: number | null
  startPhotoboothSessionTimer: (seconds?: number) => void
  clearPhotoboothSessionTimer: () => void

  // Step 1: Chọn Khung Hình (2x6 inch vs 4x6 inch) & Số lượng in
  selectedFrameSize: FrameSize
  selectFrameSize: (size: FrameSize) => void
  selectedCopies: number
  setSelectedCopies: (copies: number) => void
  appliedCoupon: DiscountCoupon | null
  setAppliedCoupon: (coupon: DiscountCoupon | null) => void
  setSessionPayment: (data: {
    paidAmount: number
    paidCopies: number
    paymentMethod: 'vietqr' | 'cash' | 'free'
    discountCodeUsed: string | null
    discountAmount: number
  }) => void
  setSessionPrinted: () => void

  // Step 2: Chọn Bố Cục (1, 3, 4, 6, 8 ảnh)
  selectedCategory: LayoutCategory
  selectCategory: (cat: LayoutCategory) => void
  selectedLayout: GridLayoutItem
  selectLayout: (layout: GridLayoutItem) => void

  // Step 3 (Post Capture): Chọn Chủ Đề
  selectedTheme: ThemeItem
  selectTheme: (theme: ThemeItem) => void

  // Step 4 (Post Capture): Chọn Sticker
  placedStickers: PlacedSticker[]
  addSticker: (icon: string) => string
  updateSticker: (id: string, updates: Partial<PlacedSticker>) => void
  removeSticker: (id: string) => void
  clearStickers: () => void

  // Color Filters, Adjustments & Lighting
  selectedFilter: ColorFilterItem
  selectFilter: (filter: ColorFilterItem) => void
  selectedBeautyPreset: string | null
  applyBeautyPreset: (presetId: string) => void
  slimFace: number      // 0 - 100 Thon gọn má
  vLine: number         // 0 - 100 Cằm V-Line
  bigEyes: number       // 0 - 100 Mắt to tự nhiên
  skinSmoothing: number // 0 - 100 Làm mịn da
  whiteningTone: number // 0 - 100 Trắng da
  rosyTone: number      // 0 - 100 Trắng hồng
  glowClarity: number   // 0 - 100 Sáng nét
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
  ringLightEnabled: boolean
  ringLightLevel: number
  setRingLightEnabled: (enabled: boolean) => void
  setRingLightLevel: (level: number) => void

  // Countdown (3s, 5s, 10s)
  countdownSeconds: number
  setCountdownSeconds: (sec: number) => void

  // Event config
  eventConfig: EventConfig
  setEventConfig: (config: Partial<EventConfig>) => void

  // Camera
  availableCameras: Array<{ id: string; name: string }>
  selectedCameraId: string | null
  cameraType: 'eos' | 'laptop'
  setCameraType: (type: 'eos' | 'laptop') => void
  mirrorCamera: boolean
  setCameras: (cameras: Array<{ id: string; name: string }>) => void
  selectCamera: (id: string) => void
  setMirrorCamera: (mirror: boolean) => void

  // Device Provisioning & Activation
  deviceConfig: DeviceConfig | null
  isDeviceActivated: boolean
  loadDeviceConfig: () => Promise<DeviceConfig | null>
  setDeviceConfig: (config: DeviceConfig | null) => void
  resetDeviceConfig: () => Promise<void>
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

const DEFAULT_EVENT_CONFIG: EventConfig = {
  eventName: DEFAULT_EVENT_NAME,
  eventLogo: null,
  date: new Date().toISOString().split('T')[0],
  operatorName: '',
  countdownSeconds: 5,
  printEnabled: true,
  printCopies: 2,
  qrEnabled: true,
  captureMode: 'photobooth',
  selfboothDurationSeconds: DEFAULT_SELFBOOTH_DURATION_SECONDS,
  paymentQrEnabled: true,
  paymentRequiredForPhotobooth: true,
  paymentRequiredForSelfbooth: false,
  bankBin: DEFAULT_BANK_BIN,
  bankName: DEFAULT_BANK_NAME,
  accountNumber: DEFAULT_ACCOUNT_NUMBER,
  accountHolder: DEFAULT_ACCOUNT_HOLDER,
  price2x6: DEFAULT_PRICE_2X6,
  price4x6: DEFAULT_PRICE_4X6,
  extraCopyPrice2x6: DEFAULT_EXTRA_COPY_PRICE_2X6,
  extraCopyPrice4x6: DEFAULT_EXTRA_COPY_PRICE_4X6,
  discountCoupons: DEFAULT_DISCOUNT_COUPONS,
  idleTimeoutSeconds: DEFAULT_IDLE_TIMEOUT_SECONDS,
  timelapseEnabled: true,
  timelapseSpeed: DEFAULT_TIMELAPSE_SPEED,
  gdriveEnabled: true,
  gdriveFolderId: DEFAULT_GDRIVE_FOLDER_ID,
  gdriveFolderUrl: DEFAULT_GDRIVE_FOLDER_URL,
  gdriveWebhookUrl: DEFAULT_GDRIVE_WEBHOOK_URL,
  gdriveAutoSync: true,
  saveDirectory: SAVE_ROOT_DIR,
  adminPin: DEFAULT_ADMIN_PIN,
}

export function loadSavedEventConfig(): Partial<EventConfig> {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(LS_EVENT_CONFIG_KEY) : null
    if (raw) {
      const parsed = JSON.parse(raw)
      // Tự động chuẩn hóa tên thương hiệu / sự kiện thành chữ viết thường fotolism
      if (
        !parsed.eventName ||
        parsed.eventName === 'FOTOLISM PHOTOBOOTH' ||
        parsed.eventName === 'Fotolism Photobooth' ||
        parsed.eventName === 'Fotolism' ||
        parsed.eventName === 'FOTOLISM'
      ) {
        parsed.eventName = DEFAULT_EVENT_NAME
        if (typeof window !== 'undefined') {
          localStorage.setItem(LS_EVENT_CONFIG_KEY, JSON.stringify(parsed))
        }
      }

      // Tự động đồng bộ số tài khoản MB Bank thực tế nếu đang giữ số cũ
      if (
        !parsed.accountNumber ||
        parsed.accountNumber === '0388889999' ||
        parsed.accountNumber === '190388889999' ||
        parsed.accountHolder === 'FOTOLISM VIETNAM' ||
        parsed.accountHolder === 'Fotolism Vietnam'
      ) {
        parsed.accountNumber = DEFAULT_ACCOUNT_NUMBER
        parsed.bankBin = DEFAULT_BANK_BIN
        parsed.bankName = DEFAULT_BANK_NAME
        parsed.accountHolder = DEFAULT_ACCOUNT_HOLDER
        if (typeof window !== 'undefined') {
          localStorage.setItem(LS_EVENT_CONFIG_KEY, JSON.stringify(parsed))
        }
      }
      // Tự động đồng bộ giá in thêm 30.000đ cho tất cả các khổ
      if (!parsed.extraCopyPrice2x6 || parsed.extraCopyPrice2x6 === 20000) {
        parsed.extraCopyPrice2x6 = DEFAULT_EXTRA_COPY_PRICE_2X6
        if (typeof window !== 'undefined') {
          localStorage.setItem(LS_EVENT_CONFIG_KEY, JSON.stringify(parsed))
        }
      }
      if (
        !parsed.gdriveWebhookUrl ||
        !parsed.gdriveWebhookUrl.includes('AKfycbw2koNyt')
      ) {
        parsed.gdriveWebhookUrl = DEFAULT_GDRIVE_WEBHOOK_URL
        if (typeof window !== 'undefined') {
          localStorage.setItem(LS_EVENT_CONFIG_KEY, JSON.stringify(parsed))
        }
      }
      return parsed
    }
  } catch {}
  return {}
}

export const useAppStore = create<AppStore>((set, get) => ({
  screen: 'idle',
  setScreen: (screen) => set({ screen }),

  isKioskLocked: false,
  setIsKioskLocked: (isKioskLocked) => set({ isKioskLocked }),

  boothMode: 'unattended',
  setBoothMode: (boothMode) => set({ boothMode }),

  selectedFrameSize: '2x6',
  selectFrameSize: (size) => {
    set((state) => {
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

  selectedCopies: 2,
  setSelectedCopies: (selectedCopies) => set({ selectedCopies }),
  appliedCoupon: null,
  setAppliedCoupon: (appliedCoupon) => set({ appliedCoupon }),

  setSessionPayment: (data) =>
    set((state) => ({
      session: state.session
        ? {
            ...state.session,
            ...data,
          }
        : null,
    })),

  setSessionPrinted: () =>
    set((state) => ({
      session: state.session ? { ...state.session, hasPrinted: true } : null,
    })),

  selectedCategory: 4,
  selectCategory: (cat) => {
    const list = ALL_LAYOUTS[cat] || ALL_LAYOUTS[4]
    set({ selectedCategory: cat, selectedLayout: list[0] })
  },
  selectedLayout: ALL_LAYOUTS[4][0],
  selectLayout: (layout) => set({ selectedLayout: layout }),

  selectedTheme: THEME_OPTIONS[0],
  selectTheme: (theme) => set({ selectedTheme: theme }),

  placedStickers: [],
  addSticker: (icon) => {
    const newId = `st_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`
    set((state) => ({
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
    set((state) => ({
      placedStickers: state.placedStickers.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    })),
  removeSticker: (id) =>
    set((state) => ({
      placedStickers: state.placedStickers.filter((s) => s.id !== id),
    })),
  clearStickers: () => set({ placedStickers: [] }),

  // Google Drive session sync state
  isSyncingDrive: false,
  driveSyncDone: false,
  driveSyncError: null,
  cloudFolderUrl: null,
  setIsSyncingDrive: (isSyncingDrive) => set({ isSyncingDrive }),
  setDriveSyncDone: (driveSyncDone) => set({ driveSyncDone }),
  setDriveSyncError: (driveSyncError) => set({ driveSyncError }),
  setCloudFolderUrl: (cloudFolderUrl) => set({ cloudFolderUrl }),
  compositeStripUrl: null,
  setCompositeStripUrl: (compositeStripUrl) =>
    set((state) => ({
      compositeStripUrl,
      session: state.session ? { ...state.session, compositeStripUrl } : state.session,
    })),

  session: null,
  startNewSession: () =>
    set({
      selectedFrameSize: '2x6',
      selectedCategory: 4,
      selectedLayout: ALL_LAYOUTS[4][0],
      selectedCopies: 2,
      appliedCoupon: null,
      selectedTheme: THEME_OPTIONS[0],
      selectedFilter: COLOR_FILTERS[0],
      session: {
        sessionId: generateSessionId(),
        photos: [],
        selectedFrameSize: '2x6',
        selectedLayout: ALL_LAYOUTS[4][0],
        selectedTheme: THEME_OPTIONS[0],
        placedStickers: [],
        qrUrl: null,
        qrImagePath: null,
        timelapseUrl: null,
        gdriveUrl: null,
        storageUrl: null,
        customerName: null,
        customerPhone: null,
        pinCode: null,
        paidAmount: 0,
        paidCopies: 2,
        paymentMethod: null,
        discountCodeUsed: null,
        discountAmount: 0,
      },
      placedStickers: [],
      isSyncingDrive: false,
      driveSyncDone: false,
      driveSyncError: null,
      cloudFolderUrl: null,
    }),

  addPhoto: (photo) =>
    set((state) => {
      const s = state.session || {
        sessionId: generateSessionId(),
        photos: [],
        selectedFrameSize: get().selectedFrameSize,
        selectedLayout: get().selectedLayout,
        selectedTheme: get().selectedTheme,
        placedStickers: [],
        qrUrl: null,
        qrImagePath: null,
        timelapseUrl: null,
        gdriveUrl: null,
        storageUrl: null,
        customerName: null,
        customerPhone: null,
        pinCode: null,
        paidAmount: 0,
        paidCopies: get().selectedCopies,
        paymentMethod: null,
        discountCodeUsed: null,
        discountAmount: 0,
      }
      return { session: { ...s, photos: [...s.photos, photo] } }
    }),

  setSelfboothLibrary: (photos) =>
    set((state) => {
      if (!state.session) return {}
      return { session: { ...state.session, selfboothLibrary: photos } }
    }),

  setSessionPhotos: (photos) =>
    set((state) => {
      const s = state.session || {
        sessionId: generateSessionId(),
        photos: [],
        selectedFrameSize: get().selectedFrameSize,
        selectedLayout: get().selectedLayout,
        selectedTheme: get().selectedTheme,
        placedStickers: [],
        qrUrl: null,
        qrImagePath: null,
        timelapseUrl: null,
        gdriveUrl: null,
        storageUrl: null,
        customerName: null,
        customerPhone: null,
        pinCode: null,
        paidAmount: 0,
        paidCopies: get().selectedCopies,
        paymentMethod: null,
        discountCodeUsed: null,
        discountAmount: 0,
      }
      return { session: { ...s, photos } }
    }),

  replaceSessionPhotoAt: (index, photo) =>
    set((state) => {
      if (!state.session) return { session: state.session }
      const newPhotos = [...state.session.photos]
      newPhotos[index] = photo
      return { session: { ...state.session, photos: newPhotos } }
    }),

  removeSessionPhotoAt: (index) =>
    set((state) => {
      if (!state.session) return { session: state.session }
      const newPhotos = state.session.photos.filter((_, i) => i !== index)
      return { session: { ...state.session, photos: newPhotos } }
    }),

  setCaptureMode: (captureMode) =>
    set((state) => ({
      eventConfig: { ...state.eventConfig, captureMode },
    })),

  setSelfboothDurationSeconds: (selfboothDurationSeconds) =>
    set((state) => ({
      eventConfig: { ...state.eventConfig, selfboothDurationSeconds },
    })),

  photoboothSessionEndTime: null,
  startPhotoboothSessionTimer: (seconds = 240) =>
    set({ photoboothSessionEndTime: Date.now() + seconds * 1000 }),
  clearPhotoboothSessionTimer: () =>
    set({ photoboothSessionEndTime: null }),

  clearSession: () => {
    // 1. Thu hồi các Object URL nhị phân (Blob) để chống rò rỉ RAM (Memory Leak)
    const currentSession = get().session
    if (typeof window !== 'undefined' && typeof URL !== 'undefined') {
      if (currentSession?.timelapseUrl?.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(currentSession.timelapseUrl)
        } catch { }
      }
    }

    const savedBeauty = loadSavedBeautyConfig()
    set({
      session: null,
      photoboothSessionEndTime: null,
      appliedCoupon: null, // Xóa bỏ triệt để mã giảm giá của phiên trước
      selectedFrameSize: '2x6',
      selectedCategory: 4,
      selectedLayout: ALL_LAYOUTS[4][0],
      selectedCopies: 2,
      selectedTheme: THEME_OPTIONS[0],
      selectedFilter: COLOR_FILTERS[0],
      selectedBeautyPreset: 'natural',
      slimFace: savedBeauty.slimFace,
      vLine: savedBeauty.vLine ?? 16,
      bigEyes: savedBeauty.bigEyes ?? 12,
      skinSmoothing: savedBeauty.skinSmoothing,
      whiteningTone: savedBeauty.whiteningTone,
      rosyTone: savedBeauty.rosyTone,
      glowClarity: savedBeauty.glowClarity,
      brightnessAdjust: savedBeauty.brightnessAdjust,
      contrastAdjust: savedBeauty.contrastAdjust,
      placedStickers: [],
      isSyncingDrive: false,
      driveSyncDone: false,
      driveSyncError: null,
      cloudFolderUrl: null,
      compositeStripUrl: null,
    })
  },

  setQr: (url, imagePath) =>
    set((state) => ({
      session: state.session
        ? { ...state.session, qrUrl: url, qrImagePath: imagePath }
        : state.session,
    })),

  setTimelapseUrl: (url, dataUrl) =>
    set((state) => ({
      session: state.session
        ? {
            ...state.session,
            timelapseUrl: url,
            timelapseDataUrl:
              dataUrl !== undefined
                ? dataUrl
                : url?.startsWith('data:')
                  ? url
                  : state.session.timelapseDataUrl,
          }
        : state.session,
    })),

  setGdriveUrl: (url) =>
    set((state) => ({
      session: state.session ? { ...state.session, gdriveUrl: url } : state.session,
    })),

  setStorageUrl: (url) =>
    set((state) => ({
      session: state.session ? { ...state.session, storageUrl: url } : state.session,
    })),

  setCustomerInfo: (info) =>
    set((state) => ({
      session: state.session
        ? {
            ...state.session,
            customerName: info.customerName !== undefined ? info.customerName : state.session.customerName,
            customerPhone: info.customerPhone !== undefined ? info.customerPhone : state.session.customerPhone,
            pinCode: info.pinCode !== undefined ? info.pinCode : state.session.pinCode,
          }
        : null,
    })),

  selectedFilter: COLOR_FILTERS[0],
  selectFilter: (filter) => set({ selectedFilter: filter }),

  selectedBeautyPreset: 'natural',
  ...(() => {
    const saved = loadSavedBeautyConfig()
    return {
      slimFace: saved.slimFace,
      vLine: saved.vLine ?? 16,
      bigEyes: saved.bigEyes ?? 12,
      skinSmoothing: saved.skinSmoothing,
      whiteningTone: saved.whiteningTone,
      rosyTone: saved.rosyTone,
      glowClarity: saved.glowClarity,
      brightnessAdjust: saved.brightnessAdjust,
      contrastAdjust: saved.contrastAdjust,
      saturationAdjust: saved.saturationAdjust,
    }
  })(),

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

  setSlimFace: (slimFace) => set({ slimFace, selectedBeautyPreset: null }),
  setVLine: (vLine) => set({ vLine, selectedBeautyPreset: null }),
  setBigEyes: (bigEyes) => set({ bigEyes, selectedBeautyPreset: null }),
  setSkinSmoothing: (skinSmoothing) => set({ skinSmoothing, selectedBeautyPreset: null }),
  setWhiteningTone: (whiteningTone) => set({ whiteningTone, selectedBeautyPreset: null }),
  setRosyTone: (rosyTone) => set({ rosyTone, selectedBeautyPreset: null }),
  setGlowClarity: (glowClarity) => set({ glowClarity, selectedBeautyPreset: null }),
  setBrightnessAdjust: (brightnessAdjust) => set({ brightnessAdjust, selectedBeautyPreset: null }),
  setContrastAdjust: (contrastAdjust) => set({ contrastAdjust, selectedBeautyPreset: null }),
  setSaturationAdjust: (saturationAdjust) => set({ saturationAdjust, selectedBeautyPreset: null }),

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
      brightnessAdjust: config?.brightnessAdjust ?? current.brightnessAdjust,
      contrastAdjust: config?.contrastAdjust ?? current.contrastAdjust,
      saturationAdjust: config?.saturationAdjust ?? current.saturationAdjust,
    }
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(LS_BEAUTY_CONFIG_KEY, JSON.stringify(updated))
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

  // Beauty-only filter (áp dụng trực tiếp vào camera preview và frame chụp)
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

    // 1. Trắng sáng da: kết hợp brightnessAdjust và whiteningTone
    const whiteMultiplier = 1 + (whiteningTone / 100) * 0.12
    const baseBright = brightnessAdjust !== 100 ? brightnessAdjust / 100 : 1
    const totalBright = baseBright * whiteMultiplier
    const b = totalBright !== 1 ? `brightness(${totalBright.toFixed(3)})` : ''

    const c = contrastAdjust !== 100 ? `contrast(${contrastAdjust / 100})` : ''
    const s = saturationAdjust !== 100 ? `saturate(${saturationAdjust / 100})` : ''

    // 2. Làm mịn da (Skin Smoothing): micro-blur làm mờ nếp nhăn & lỗ chân lông
    const smooth = skinSmoothing > 0 ? `blur(${(skinSmoothing * 0.0065).toFixed(2)}px)` : ''

    // 3. Trắng hồng (Rosy Tone): tươi tắn màu môi & má đào
    const rosy =
      rosyTone > 0
        ? `hue-rotate(-${(rosyTone * 0.075).toFixed(1)}deg) saturate(${1 + rosyTone * 0.0025})`
        : ''

    // 4. Sáng nét (Clarity): sắc sảo chi tiết viền mắt, chân mày
    const clarity =
      glowClarity > 0 ? `contrast(${1 + glowClarity * 0.0016})` : ''

    const parts = [b, c, s, smooth, rosy, clarity].filter(Boolean)
    return parts.length > 0 ? parts.join(' ') : 'none'
  },

  // Lật gương đồng bộ
  getCameraTransformCss: (mirror: boolean) => {
    return mirror ? 'scaleX(-1)' : 'none'
  },

  getEffectiveFilterCss: () => {
    const { selectedFilter } = get()
    const beautyCss = get().getBeautyFilterCss()
    const base = selectedFilter.cssFilter === 'none' ? '' : selectedFilter.cssFilter
    const beauty = beautyCss === 'none' ? '' : beautyCss
    const parts = [base, beauty].filter(Boolean)
    return parts.length > 0 ? parts.join(' ') : 'none'
  },

  ringLightEnabled: (() => {
    try {
      if (typeof window !== 'undefined') {
        const v = localStorage.getItem('fotolism_ring_light_enabled')
        return v !== null ? v === 'true' : false
      }
      return false
    } catch { return false }
  })(),
  ringLightLevel: (() => {
    try {
      if (typeof window !== 'undefined') {
        const v = localStorage.getItem('fotolism_ring_light_level')
        return v ? Number(v) : 75
      }
      return 75
    } catch { return 75 }
  })(),
  setRingLightEnabled: (ringLightEnabled) => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('fotolism_ring_light_enabled', String(ringLightEnabled))
      }
    } catch { }
    set({ ringLightEnabled })
  },
  setRingLightLevel: (ringLightLevel) => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('fotolism_ring_light_level', String(ringLightLevel))
      }
    } catch { }
    set({ ringLightLevel })
  },

  countdownSeconds: 5,
  setCountdownSeconds: (countdownSeconds) =>
    set((state) => ({
      countdownSeconds,
      eventConfig: { ...state.eventConfig, countdownSeconds },
    })),

  eventConfig: { ...DEFAULT_EVENT_CONFIG, ...loadSavedEventConfig() },
  setEventConfig: (config) =>
    set((state) => {
      const updated = { ...state.eventConfig, ...config }
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem(LS_EVENT_CONFIG_KEY, JSON.stringify(updated))
        }
      } catch (err) {
        console.warn('Failed to persist event config to localStorage:', err)
      }
      return { eventConfig: updated }
    }),

  availableCameras: [],
  selectedCameraId: null,
  cameraType: (() => {
    try {
      if (typeof window !== 'undefined') {
        const v = localStorage.getItem('fotolism_camera_type')
        return (v === 'laptop' ? 'laptop' : 'eos') as 'eos' | 'laptop'
      }
      return 'eos'
    } catch { return 'eos' }
  })(),
  setCameraType: (type: 'eos' | 'laptop') => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('fotolism_camera_type', type)
      }
    } catch { }
    set({
      cameraType: type,
      selectedCameraId: type === 'eos' ? 'canon-daemon-stream' : null,
    })
  },
  mirrorCamera: (() => {
    try {
      if (typeof window !== 'undefined') {
        const v = localStorage.getItem('fotolism_mirror_camera')
        return v !== null ? v === 'true' : true
      }
      return true
    } catch { return true }
  })(),
  setCameras: (cameras) => set({ availableCameras: cameras }),
  selectCamera: (id) => set({ selectedCameraId: id }),
  setMirrorCamera: (mirrorCamera) => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('fotolism_mirror_camera', String(mirrorCamera))
      }
    } catch { }
    set({ mirrorCamera })
  },

  // Device Provisioning State & Handlers
  deviceConfig: null,
  isDeviceActivated: false,
  loadDeviceConfig: async () => {
    try {
      const { api } = await import('../lib/api')
      const res = await api.device.getConfig()
      if (res?.success && res.data?.device_token) {
        set({ deviceConfig: res.data, isDeviceActivated: true, screen: 'idle' })
        return res.data
      }
    } catch (err) {
      console.warn('Failed to load device config:', err)
    }
    const hasExplicitScreen = typeof window !== 'undefined' && Boolean(window.location?.search && new URLSearchParams(window.location.search).get('screen'))
    set({
      deviceConfig: null,
      isDeviceActivated: false,
      ...(hasExplicitScreen ? {} : { screen: 'activate' }),
    })
    return null
  },
  setDeviceConfig: (deviceConfig) => {
    set({ deviceConfig, isDeviceActivated: Boolean(deviceConfig?.device_token) })
    import('../services/cloudSyncService').then(({ cloudSyncService }) => {
      cloudSyncService.setDeviceConfig(deviceConfig)
      if (deviceConfig?.device_token) {
        cloudSyncService.startWorker()
      } else {
        cloudSyncService.stopWorker()
      }
    }).catch(console.warn)
  },
  resetDeviceConfig: async () => {
    try {
      const { api } = await import('../lib/api')
      await api.device.resetConfig()
      const { cloudSyncService } = await import('../services/cloudSyncService')
      cloudSyncService.setDeviceConfig(null)
    } catch (err) {
      console.warn('Failed to reset device config:', err)
    }
    const hasExplicitScreen = typeof window !== 'undefined' && Boolean(window.location?.search && new URLSearchParams(window.location.search).get('screen'))
    set({
      deviceConfig: null,
      isDeviceActivated: false,
      ...(hasExplicitScreen ? {} : { screen: 'activate' }),
    })
  },
}))
