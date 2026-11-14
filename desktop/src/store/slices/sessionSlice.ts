import type { StateCreator } from 'zustand'
import type { FrameSize, GridLayoutItem } from '../../config/layouts'
import { ALL_LAYOUTS } from '../../config/layouts'
import type { ThemeItem } from '../../config/themes'
import { THEME_OPTIONS } from '../../config/themes'
import type { PlacedSticker } from './layoutThemeSlice'
import type { ColorFilterItem } from '../../config/filters'
import { COLOR_FILTERS } from '../../config/filters'
import { BEAUTY_PRESETS } from '../../services/beautyEngine'
import { loadSavedBeautyConfig } from './beautyCameraSlice'
import { LS_BEAUTY_CONFIG_KEY } from '../../lib/constants'
import type { SlotOffset } from '../../lib/canvasCompositor'

export interface CapturedPhoto {
    id: string
    rawPath: string
    enhancedPath: string
    compositedPath: string
    enhanceStatus?: 'pending' | 'processed' | 'failed'
    timestamp: number
}

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
    storageUrl?: string | null
    customerName?: string | null
    customerPhone?: string | null
    pinCode?: string | null
    paidAmount: number
    paidCopies: number
    paymentMethod: 'vietqr' | 'cash' | 'free' | null
    discountCodeUsed: string | null
    discountAmount: number
    hasPrinted?: boolean
    slotOffsets?: SlotOffset[]
}

export function generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export interface SessionSlice {
    session: SessionState | null
    startNewSession: (customSessionId?: string) => void
    addPhoto: (photo: CapturedPhoto) => void
    setSessionPhotos: (photos: CapturedPhoto[]) => void
    setSelfboothLibrary: (photos: CapturedPhoto[]) => void
    replaceSessionPhotoAt: (index: number, photo: CapturedPhoto) => void
    removeSessionPhotoAt: (index: number) => void
    clearSession: () => void
    setQr: (url: string, imagePath: string) => void
    setTimelapseUrl: (url: string | null, dataUrl?: string | null) => void
    setStorageUrl: (url: string | null) => void
    setCustomerInfo: (info: {
        customerName?: string | null
        customerPhone?: string | null
        pinCode?: string | null
    }) => void

    // Photobooth Session Timer (4 phút từ sau thanh toán tới màn review)
    photoboothSessionEndTime: number | null
    startPhotoboothSessionTimer: (seconds?: number) => void
    clearPhotoboothSessionTimer: () => void

    // Cloud Gallery session sync state
    isSyncingMedia: boolean
    mediaSyncDone: boolean
    mediaSyncError: string | null
    galleryUrl: string | null
    setIsSyncingMedia: (val: boolean) => void
    setMediaSyncDone: (val: boolean) => void
    setMediaSyncError: (err: string | null) => void
    setGalleryUrl: (url: string | null) => void
    compositeStripUrl: string | null
    setCompositeStripUrl: (url: string | null) => void
    slotOffsets: SlotOffset[]
    setSlotOffsets: (offsets: SlotOffset[]) => void
}

export const createSessionSlice: StateCreator<
    SessionSlice & {
        selectedFrameSize?: FrameSize
        selectedLayout?: GridLayoutItem
        selectedTheme?: ThemeItem
        selectedCopies?: number
        selectedFilter?: ColorFilterItem
        placedStickers?: PlacedSticker[]
    },
    [],
    [],
    SessionSlice
> = (set, get) => ({
    session: null,
    photoboothSessionEndTime: null,
    isSyncingMedia: false,
    mediaSyncDone: false,
    mediaSyncError: null,
    galleryUrl: null,
    compositeStripUrl: null,
    slotOffsets: [],

    setIsSyncingMedia: (isSyncingMedia) => set({ isSyncingMedia }),
    setMediaSyncDone: (mediaSyncDone) => set({ mediaSyncDone }),
    setMediaSyncError: (mediaSyncError) => set({ mediaSyncError }),
    setGalleryUrl: (galleryUrl) => set({ galleryUrl }),
    setCompositeStripUrl: (compositeStripUrl) =>
        set((state: any) => ({
            compositeStripUrl,
            session: state.session
                ? { ...state.session, compositeStripUrl }
                : state.session,
        })),
    setSlotOffsets: (slotOffsets) =>
        set((state: any) => ({
            slotOffsets,
            session: state.session
                ? { ...state.session, slotOffsets }
                : state.session,
        })),

    startPhotoboothSessionTimer: (seconds = 150) =>
        set({ photoboothSessionEndTime: Date.now() + seconds * 1000 }),
    clearPhotoboothSessionTimer: () => set({ photoboothSessionEndTime: null }),

    startNewSession: (customSessionId?: string) => {
        const sId = customSessionId || generateSessionId()
        const defaultLayout = ALL_LAYOUTS[4][0]
        set({
            session: {
                sessionId: sId,
                photos: [],
                selectedFrameSize: '2x6',
                selectedLayout: defaultLayout,
                selectedTheme: THEME_OPTIONS[0],
                placedStickers: [],
                qrUrl: null,
                qrImagePath: null,
                timelapseUrl: null,
                storageUrl: null,
                customerName: null,
                customerPhone: null,
                pinCode: customSessionId || null,
                paidAmount: 0,
                paidCopies: 2,
                paymentMethod: null,
                discountCodeUsed: null,
                discountAmount: 0,
                slotOffsets: [],
            },
            photoboothSessionEndTime: null,
            isSyncingMedia: false,
            mediaSyncDone: false,
            mediaSyncError: null,
            galleryUrl: null,
            compositeStripUrl: null,
            slotOffsets: [],
            ...(set as any)({
                selectedFrameSize: '2x6',
                selectedCategory: 4,
                selectedLayout: defaultLayout,
                selectedCopies: 2,
                appliedCoupon: null,
                selectedTheme: THEME_OPTIONS[0],
                selectedFilter: COLOR_FILTERS[0],
                placedStickers: [],
            }),
        })
    },

    addPhoto: (photo) =>
        set((state: any) => {
            const s = state.session || {
                sessionId: generateSessionId(),
                photos: [],
                selectedFrameSize: state.selectedFrameSize || '2x6',
                selectedLayout: state.selectedLayout || ALL_LAYOUTS[4][0],
                selectedTheme: state.selectedTheme || THEME_OPTIONS[0],
                placedStickers: [],
                qrUrl: null,
                qrImagePath: null,
                timelapseUrl: null,
                storageUrl: null,
                customerName: null,
                customerPhone: null,
                pinCode: null,
                paidAmount: 0,
                paidCopies: state.selectedCopies || 2,
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
        set((state: any) => {
            const s = state.session || {
                sessionId: generateSessionId(),
                photos: [],
                selectedFrameSize: state.selectedFrameSize || '2x6',
                selectedLayout: state.selectedLayout || ALL_LAYOUTS[4][0],
                selectedTheme: state.selectedTheme || THEME_OPTIONS[0],
                placedStickers: [],
                qrUrl: null,
                qrImagePath: null,
                timelapseUrl: null,
                storageUrl: null,
                customerName: null,
                customerPhone: null,
                pinCode: null,
                paidAmount: 0,
                paidCopies: state.selectedCopies || 2,
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

    clearSession: () => {
        const currentSession = get().session
        if (typeof window !== 'undefined' && typeof URL !== 'undefined') {
            if (currentSession?.timelapseUrl?.startsWith('blob:')) {
                try {
                    URL.revokeObjectURL(currentSession.timelapseUrl)
                } catch {}
            }
        }

        const savedBeauty = loadSavedBeautyConfig()
        const hasCustom =
            typeof window !== 'undefined' &&
            localStorage.getItem(LS_BEAUTY_CONFIG_KEY)
        const naturalPreset = BEAUTY_PRESETS.find((p) => p.id === 'natural')
        const activeBeauty = hasCustom
            ? savedBeauty
            : {
                  slimFace: naturalPreset?.slimFace ?? 18,
                  vLine: naturalPreset?.vLine ?? 16,
                  bigEyes: naturalPreset?.bigEyes ?? 12,
                  skinSmoothing: naturalPreset?.skinSmoothing ?? 80,
                  whiteningTone: naturalPreset?.whiteningTone ?? 45,
                  rosyTone: naturalPreset?.rosyTone ?? 35,
                  glowClarity: naturalPreset?.glowClarity ?? 38,
                  brightnessAdjust: naturalPreset?.brightness ?? 104,
                  contrastAdjust: naturalPreset?.contrast ?? 94,
                  saturationAdjust: 100,
              }

        set({
            session: null,
            photoboothSessionEndTime: null,
            isSyncingMedia: false,
            mediaSyncDone: false,
            mediaSyncError: null,
            galleryUrl: null,
            compositeStripUrl: null,
            slotOffsets: [],
            ...(set as any)({
                appliedCoupon: null,
                selectedFrameSize: '2x6',
                selectedCategory: 4,
                selectedLayout: ALL_LAYOUTS[4][0],
                selectedCopies: 2,
                selectedTheme: THEME_OPTIONS[0],
                selectedFilter: COLOR_FILTERS[0],
                selectedBeautyPreset: 'natural',
                slimFace: activeBeauty.slimFace,
                vLine: activeBeauty.vLine ?? 16,
                bigEyes: activeBeauty.bigEyes ?? 12,
                skinSmoothing: activeBeauty.skinSmoothing,
                whiteningTone: activeBeauty.whiteningTone,
                rosyTone: activeBeauty.rosyTone,
                glowClarity: activeBeauty.glowClarity,
                brightnessAdjust: activeBeauty.brightnessAdjust,
                contrastAdjust: activeBeauty.contrastAdjust,
                placedStickers: [],
            }),
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

    setStorageUrl: (url) =>
        set((state) => ({
            session: state.session
                ? { ...state.session, storageUrl: url }
                : state.session,
        })),

    setCustomerInfo: (info) =>
        set((state) => ({
            session: state.session
                ? {
                      ...state.session,
                      sessionId:
                          info.pinCode && info.pinCode.trim().length > 0
                              ? info.pinCode.trim()
                              : state.session.sessionId,
                      customerName:
                          info.customerName !== undefined
                              ? info.customerName
                              : state.session.customerName,
                      customerPhone:
                          info.customerPhone !== undefined
                              ? info.customerPhone
                              : state.session.customerPhone,
                      pinCode:
                          info.pinCode !== undefined
                              ? info.pinCode
                              : state.session.pinCode,
                  }
                : null,
        })),
})
