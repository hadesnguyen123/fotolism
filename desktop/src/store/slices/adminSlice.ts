import type { StateCreator } from 'zustand'
import {
  DEFAULT_EVENT_NAME,
  DEFAULT_ADMIN_PIN,
  DEFAULT_ACCOUNT_HOLDER,
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
  LS_EVENT_CONFIG_KEY,
} from '../../lib/constants'
import type { DeviceConfig } from '../../services/cloudSyncService'
import type { DiscountCoupon } from '../../config/coupons'
import { DEFAULT_DISCOUNT_COUPONS } from '../../config/coupons'

export type BoothMode = 'attended' | 'unattended'
export type CaptureMode = 'photobooth' | 'selfbooth'

export interface EventConfig {
  eventName: string
  eventLogo: string | null
  date: string
  operatorName: string
  countdownSeconds: number
  printEnabled: boolean
  printCopies: number
  qrEnabled: boolean
  captureMode: CaptureMode
  selfboothDurationSeconds: number
  paymentQrEnabled: boolean
  paymentRequiredForPhotobooth: boolean
  paymentRequiredForSelfbooth: boolean
  bankBin: string
  bankName: string
  accountNumber: string
  accountHolder: string
  price2x6: number
  price4x6: number
  extraCopyPrice2x6: number
  extraCopyPrice4x6: number
  discountCoupons: DiscountCoupon[]
  idleTimeoutSeconds: number
  timelapseEnabled: boolean
  timelapseSpeed: number
  gdriveEnabled: boolean
  gdriveFolderId: string
  gdriveFolderUrl: string
  gdriveWebhookUrl: string
  gdriveAutoSync: boolean
  saveDirectory: string
  adminPin: string
}

export const DEFAULT_EVENT_CONFIG: EventConfig = {
  eventName: DEFAULT_EVENT_NAME,
  eventLogo: null,
  date: new Date().toISOString().split('T')[0],
  operatorName: '',
  countdownSeconds: 8,
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
  timelapseEnabled: false,
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

export interface AdminSlice {
  boothMode: BoothMode
  setBoothMode: (mode: BoothMode) => void
  eventConfig: EventConfig
  setEventConfig: (config: Partial<EventConfig>) => void
  setCaptureMode: (mode: CaptureMode) => void
  setSelfboothDurationSeconds: (seconds: number) => void
  deviceConfig: DeviceConfig | null
  isDeviceActivated: boolean
  loadDeviceConfig: () => Promise<DeviceConfig | null>
  setDeviceConfig: (config: DeviceConfig | null) => void
  resetDeviceConfig: () => Promise<void>
}

export const createAdminSlice: StateCreator<
  AdminSlice & { setScreen?: (screen: any) => void },
  [],
  [],
  AdminSlice
> = (set) => ({
  boothMode: 'unattended',
  setBoothMode: (boothMode) => set({ boothMode }),

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

  setCaptureMode: (captureMode) =>
    set((state) => ({
      eventConfig: { ...state.eventConfig, captureMode },
    })),

  setSelfboothDurationSeconds: (selfboothDurationSeconds) =>
    set((state) => ({
      eventConfig: { ...state.eventConfig, selfboothDurationSeconds },
    })),

  deviceConfig: null,
  isDeviceActivated: false,
  loadDeviceConfig: async () => {
    try {
      const { api } = await import('../../lib/api')
      const res = await api.device.getConfig()
      if (res?.success && res.data?.device_token) {
        set({ deviceConfig: res.data, isDeviceActivated: true, ...(set as any)({ screen: 'idle' }) })
        return res.data
      }
    } catch (err) {
      console.warn('Failed to load device config:', err)
    }
    const hasExplicitScreen =
      typeof window !== 'undefined' &&
      Boolean(window.location?.search && new URLSearchParams(window.location.search).get('screen'))
    set({
      deviceConfig: null,
      isDeviceActivated: false,
      ...(hasExplicitScreen ? {} : { screen: 'activate' as any }),
    })
    return null
  },
  setDeviceConfig: (deviceConfig) => {
    set({ deviceConfig, isDeviceActivated: Boolean(deviceConfig?.device_token) })
    import('../../services/cloudSyncService')
      .then(({ cloudSyncService }) => {
        cloudSyncService.setDeviceConfig(deviceConfig)
        if (deviceConfig?.device_token) {
          cloudSyncService.startWorker()
        } else {
          cloudSyncService.stopWorker()
        }
      })
      .catch(console.warn)
  },
  resetDeviceConfig: async () => {
    try {
      const { api } = await import('../../lib/api')
      await api.device.resetConfig()
      const { cloudSyncService } = await import('../../services/cloudSyncService')
      cloudSyncService.setDeviceConfig(null)
    } catch (err) {
      console.warn('Failed to reset device config:', err)
    }
    const hasExplicitScreen =
      typeof window !== 'undefined' &&
      Boolean(window.location?.search && new URLSearchParams(window.location.search).get('screen'))
    set({
      deviceConfig: null,
      isDeviceActivated: false,
      ...(hasExplicitScreen ? {} : { screen: 'activate' as any }),
    })
  },
})
