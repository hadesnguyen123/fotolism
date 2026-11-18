/**
 * @file appStore.ts
 * Kho trạng thái toàn cục (Zustand Global Store) của ứng dụng Kiosk Fotolism:
 * hợp nhất các slice điều hướng (navigation), bố cục (layout/theme), thanh toán (payment),
 * phiên chụp (session), camera làm đẹp (beauty) và quản trị viên (admin).
 * Phụ thuộc: zustand, ./slices/*.
 */

import { create } from 'zustand'

// ─── 1. Re-export toàn bộ Config tĩnh (Layouts, Themes, Stickers, Filters, Coupons) ──
export * from '../config/layouts'
export * from '../config/themes'
export type { PlacedSticker } from './slices/layoutThemeSlice'
export * from '../config/filters'
export * from '../config/coupons'

// ─── 2. Import & Re-export Types & Helper Slices ──
import type { NavigationSlice, AppScreen } from './slices/navigationSlice'
import { createNavigationSlice } from './slices/navigationSlice'

import type { LayoutThemeSlice } from './slices/layoutThemeSlice'
import { createLayoutThemeSlice } from './slices/layoutThemeSlice'

import type { PaymentSlice } from './slices/paymentSlice'
import { createPaymentSlice } from './slices/paymentSlice'

import type {
    SessionSlice,
    CapturedPhoto,
    SessionState,
} from './slices/sessionSlice'
import { createSessionSlice, generateSessionId } from './slices/sessionSlice'

import type {
    BeautyCameraSlice,
    BeautyConfig,
    BeautyPreset,
} from './slices/beautyCameraSlice'
import {
    createBeautyCameraSlice,
    loadSavedBeautyConfig,
    BEAUTY_PRESETS,
    DEFAULT_BEAUTY_CONFIG,
} from './slices/beautyCameraSlice'

import type {
    AdminSlice,
    EventConfig,
    BoothMode,
    CaptureMode,
} from './slices/adminSlice'
import {
    createAdminSlice,
    DEFAULT_EVENT_CONFIG,
    loadSavedEventConfig,
    loadSavedPrintScale,
} from './slices/adminSlice'

export type {
    AppScreen,
    CapturedPhoto,
    SessionState,
    BeautyConfig,
    BeautyPreset,
    EventConfig,
    BoothMode,
    CaptureMode,
    NavigationSlice,
    LayoutThemeSlice,
    PaymentSlice,
    SessionSlice,
    BeautyCameraSlice,
    AdminSlice,
}

export {
    generateSessionId,
    loadSavedBeautyConfig,
    BEAUTY_PRESETS,
    DEFAULT_BEAUTY_CONFIG,
    DEFAULT_EVENT_CONFIG,
    loadSavedEventConfig,
    loadSavedPrintScale,
}

// ─── 3. Global AppStore Interface (Full Backward Compatibility) ──
export type AppStore = NavigationSlice &
    LayoutThemeSlice &
    PaymentSlice &
    SessionSlice &
    BeautyCameraSlice &
    AdminSlice

// ─── 4. Zustand Store Composition ──
export const useAppStore = create<AppStore>()((...a) => ({
    ...createNavigationSlice(...a),
    ...createLayoutThemeSlice(...a),
    ...createPaymentSlice(...a),
    ...createSessionSlice(...a),
    ...createBeautyCameraSlice(...a),
    ...createAdminSlice(...a),
}))
