import { create } from 'zustand'

export type LogCategory =
    'camera' | 'storage' | 'ai' | 'print' | 'config' | 'system'
export type LogStatus = 'error' | 'warning' | 'success'

export interface ApiLogEntry {
    id: string
    timestamp: number
    timeStr: string
    category: LogCategory
    action: string
    status: LogStatus
    message: string
    details?: string
}

interface LogStore {
    logs: ApiLogEntry[]
    activeToasts: ApiLogEntry[]
    isDrawerOpen: boolean
    unreadErrorCount: number
    addLog: (entry: {
        category: LogCategory
        action: string
        status?: LogStatus
        message: string
        details?: unknown
    }) => void
    dismissToast: (id: string) => void
    clearLogs: () => void
    setDrawerOpen: (open: boolean) => void
}

const MAX_LOG_HISTORY = 120
const TOAST_DURATION_MS = 8000

export const useLogStore = create<LogStore>((set, get) => ({
    logs: [],
    activeToasts: [],
    isDrawerOpen: false,
    unreadErrorCount: 0,

    addLog: ({ category, action, status = 'error', message, details }) => {
        const now = new Date()
        const timeStr =
            now.toTimeString().split(' ')[0] +
            '.' +
            String(now.getMilliseconds()).padStart(3, '0')
        const id = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`

        let formattedDetails: string | undefined
        if (details !== undefined && details !== null) {
            if (typeof details === 'string') {
                formattedDetails = details
            } else if (details instanceof Error) {
                formattedDetails = `${details.name}: ${details.message}\n${details.stack || ''}`
            } else {
                try {
                    formattedDetails = JSON.stringify(details, null, 2)
                } catch {
                    formattedDetails = String(details)
                }
            }
        }

        const newEntry: ApiLogEntry = {
            id,
            timestamp: Date.now(),
            timeStr,
            category,
            action,
            status,
            message,
            details: formattedDetails,
        }

        set((state) => {
            const updatedLogs = [newEntry, ...state.logs].slice(
                0,
                MAX_LOG_HISTORY
            )
            const shouldToast = status === 'error' || status === 'warning'
            const updatedToasts = shouldToast
                ? [newEntry, ...state.activeToasts].slice(0, 4)
                : state.activeToasts
            const unreadIncrement =
                status === 'error' || status === 'warning' ? 1 : 0

            return {
                logs: updatedLogs,
                activeToasts: updatedToasts,
                unreadErrorCount: state.unreadErrorCount + unreadIncrement,
            }
        })

        // Tự động ẩn toast thông báo sau TOAST_DURATION_MS
        if (status === 'error' || status === 'warning') {
            setTimeout(() => {
                get().dismissToast(id)
            }, TOAST_DURATION_MS)
        }
    },

    dismissToast: (id: string) => {
        set((state) => ({
            activeToasts: state.activeToasts.filter((t) => t.id !== id),
        }))
    },

    clearLogs: () => {
        set({
            logs: [],
            activeToasts: [],
            unreadErrorCount: 0,
        })
    },

    setDrawerOpen: (open: boolean) => {
        set((state) => ({
            isDrawerOpen: open,
            unreadErrorCount: open ? 0 : state.unreadErrorCount,
        }))
    },
}))

/**
 * Helper gọi nhanh từ bất kỳ file nào (kể cả ngoài React component)
 */
export const notifyApiError = (
    category: LogCategory,
    action: string,
    message: string,
    details?: unknown
) => {
    useLogStore.getState().addLog({
        category,
        action,
        status: 'error',
        message,
        details,
    })
}

export const notifyApiWarning = (
    category: LogCategory,
    action: string,
    message: string,
    details?: unknown
) => {
    useLogStore.getState().addLog({
        category,
        action,
        status: 'warning',
        message,
        details,
    })
}

export const notifyApiSuccess = (
    category: LogCategory,
    action: string,
    message: string,
    details?: unknown
) => {
    useLogStore.getState().addLog({
        category,
        action,
        status: 'success',
        message,
        details,
    })
}
