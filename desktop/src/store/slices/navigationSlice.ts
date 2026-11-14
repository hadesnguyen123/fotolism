import type { StateCreator } from 'zustand'

export type AppScreen =
    | 'welcome'
    | 'activate'
    | 'idle'
    | 'select-layout'
    | 'confirm'
    | 'payment'
    | 'capture'
    | 'select-theme'
    | 'processing'
    | 'review'
    | 'admin'
    | 'selfbooth-setup'
    | 'selfbooth-select'

export type BoothMode = 'attended' | 'unattended'
export type CaptureMode = 'photobooth' | 'selfbooth'

export interface NavigationSlice {
    screen: AppScreen
    setScreen: (screen: AppScreen) => void
    isKioskLocked: boolean
    setIsKioskLocked: (locked: boolean) => void
    boothMode: BoothMode
    setBoothMode: (mode: BoothMode) => void
}

export const createNavigationSlice: StateCreator<
    any,
    [],
    [],
    NavigationSlice
> = (set) => ({
    screen: 'welcome',
    setScreen: (screen) => set({ screen }),
    isKioskLocked: false,
    setIsKioskLocked: (isKioskLocked) => set({ isKioskLocked }),
    boothMode: 'unattended',
    setBoothMode: (boothMode) => set({ boothMode }),
})
