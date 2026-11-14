// Typed helper để gọi Fotolism desktop API qua preload IPC
// An toàn khi chạy trên trình duyệt (mock data tự động)
import {
    BRAND_NAME,
    APP_DOMAIN,
    SAVE_FOLDER_NAME,
    SAVE_ROOT_DIR,
    FILE_PREFIX_SHOT,
    FILE_PREFIX_FINAL,
    FILE_PREFIX_TIMELAPSE,
    DEFAULT_ACCOUNT_HOLDER,
} from './constants'

export type IpcResponse<T = unknown> = Promise<{
    success: boolean
    data?: T
    error?: string
}>

export interface EdsdkCapturePayload {
    savePath?: string
    shotIndex?: number
    captureId?: string
    sessionId?: string
    slotIndex?: number
}

export interface EdsdkCaptureResult {
    savedPath: string
    dataUrl: string
    source: string
    resolution: string
    latencyMs?: number
    shutterMs?: number
    transferMs?: number
    captureId?: string
    sessionId?: string
    slotIndex?: number
    idempotent?: boolean
}

export interface FotolismAPI {
    ai: {
        enhance: (
            imagePath: string,
            beautyLevel?: number,
            presetId?: string,
            styleId?: string,
            outputPath?: string
        ) => IpcResponse<{ enhancedPath: string }>
        composite: (
            imagePath: string,
            framePath: string
        ) => IpcResponse<{ compositedPath: string }>
        generateQr: (
            sessionId: string,
            imagePath: string
        ) => IpcResponse<{ qrDataUrl: string; downloadUrl: string }>
    }
    print: {
        send: (
            imagePath: string,
            copies: number
        ) => IpcResponse<{ jobId: string }>
        listPrinters: () => IpcResponse<{
            printers: Array<{ name: string; isDefault: boolean }>
        }>
    }
    camera: {
        list: () => IpcResponse<{
            cameras: Array<{ id: string; label: string }>
        }>
        capture: (
            cameraId: string,
            savePath: string
        ) => IpcResponse<{ savedPath: string }>
        getDriverStatus: () => IpcResponse<{
            bundled: boolean
            installed: boolean
            cameraConnected: boolean
            cameraModel?: string
            setupPath?: string
            digiCamInstalled?: boolean
            digiCamBundled?: boolean
        }>
        installCanonDriver: () => IpcResponse<{ message?: string }>
        installDigiCam: () => IpcResponse<{ message?: string }>
        /** EDSDK: Kích hoạt chụp ảnh máy ảnh thật với Idempotency & Session Support */
        edsdkCapture: (
            savePathOrPayload: string | EdsdkCapturePayload,
            shotIndex?: number
        ) => IpcResponse<EdsdkCaptureResult>
        /** EDSDK: Lấy 1 frame Live View chất lượng cao từ máy ảnh */
        edsdkLiveviewFrame: () => IpcResponse<{ dataUrl: string }>
        /** Canon Persistent Daemon Status */
        canonDaemonStatus: () => IpcResponse<{
            running: boolean
            url: string
            state?: string
        }>
        /** Canon Persistent Daemon Diagnostics (FR-09) */
        canonDiagnostics: () => IpcResponse<any>
    }
    session: {
        create: (sessionData: any) => IpcResponse<any>
        get: (sessionId: string) => IpcResponse<any>
        update: (sessionId: string, updates: any) => IpcResponse<any>
        getCaptures: (sessionId: string) => IpcResponse<any[]>
    }
    overhead: {
        getDisplays: () => IpcResponse<
            Array<{
                id: number
                bounds: any
                isPrimary: boolean
                label: string
            }>
        >
        toggle: (
            enabled: boolean,
            displayId?: number
        ) => IpcResponse<{ active: boolean; displayId?: number }>
        status: () => IpcResponse<{ active: boolean; displayId?: number }>
    }
    config: {
        get: (key: string) => IpcResponse
        set: (key: string, value: unknown) => IpcResponse
    }
    device: {
        getConfig: () => IpcResponse<any>
        saveConfig: (config: any) => IpcResponse<any>
        resetConfig: () => IpcResponse<void>
    }
    storage: {
        getDownloadsPath: () => IpcResponse<{
            path: string
            baseDownloads: string
        }>
        savePhoto: (
            dataUrl: string,
            fileName: string
        ) => IpcResponse<{ savedPath: string }>
        openFolder: (targetPath?: string) => IpcResponse
        getUploadStatus: (sessionId?: string) => IpcResponse<{
            concurrency: number
            activeStreams: number
            pendingTasks: number
            uploadingTasks: number
            uploadedTasks: number
            failedTasks: number
            isProcessing: boolean
        }>
        setConcurrency: (
            concurrency: number
        ) => IpcResponse<{ concurrency: number }>
        retryFailedUploads: () => IpcResponse<{ retriedCount: number }>
        enqueueR2Session: (payload: {
            sessionId: string
            customerName?: string
            sessionType?: string
            cmsUrl?: string
            files: Array<{
                imageId: string
                filePath: string
                isFinal?: boolean
                sizeBytes?: number
            }>
        }) => IpcResponse<{
            sessionId: string
            folderKey: string
            enqueuedCount: number
        }>
        finalizeSessionMedia: (payload: {
            sessionId: string
            customerName?: string
            sessionType?: string
            cmsUrl?: string
            compositeDataUrl?: string
            compositeFileName?: string
            pairedPrintDataUrl?: string
            pairedPrintFileName?: string
            shots: Array<{
                slotIndex: number
                rawPath?: string
                enhancedPath?: string
                rawPhotoUrl?: string
                enhancedPhotoUrl?: string
            }>
        }) => IpcResponse<{
            sessionId: string
            folderKey: string
            sessionDir: string
            rawDir: string
            finalDir: string
            compositePath?: string
            pairedPrintPath?: string
            enqueuedCount: number
            files: Array<{
                imageId: string
                filePath: string
                fileName: string
                isFinal: boolean
                sizeBytes: number
            }>
        }>
        onUploadProgress: (callback: (event: any) => void) => () => void
    }
}

/** @deprecated Use FotolismAPI */
export type JoyBoothAPI = FotolismAPI

// Type-safe wrapper cho window.fotolism API
declare global {
    interface Window {
        fotolism?: FotolismAPI
        joyBooth?: FotolismAPI // backward compat alias
    }
}

const MOCK_SAVE_BASE = SAVE_ROOT_DIR

const mockSessions = new Map<string, any>()
const mockCaptures = new Map<string, any[]>()

// Fallback implementation khi chạy trong browser dev mode (không có Electron)
const defaultMockApi: FotolismAPI = {
    ai: {
        enhance: async (
            _imagePath: string,
            level?: number,
            _presetId?: string,
            _styleId?: string,
            outputPath?: string
        ) => ({
            success: true,
            data: {
                enhancedPath:
                    outputPath ||
                    `${MOCK_SAVE_BASE}/mock_enhanced_lvl${level ?? 50}.jpg`,
            },
        }),
        composite: async () => ({
            success: true,
            data: { compositedPath: `${MOCK_SAVE_BASE}/mock_composite.jpg` },
        }),
        generateQr: async (sessionId: string) => ({
            success: true,
            data: {
                qrDataUrl:
                    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="%23eee"/><text x="100" y="105" text-anchor="middle" font-size="14" fill="%23333">QR MOCK</text></svg>',
                downloadUrl: `https://${APP_DOMAIN}/d/${sessionId}`,
            },
        }),
    },
    print: {
        send: async () => ({
            success: true,
            data: { jobId: `mock-job-${Date.now()}` },
        }),
        listPrinters: async () => ({
            success: true,
            data: {
                printers: [],
            },
        }),
    },
    camera: {
        list: async () => ({
            success: true,
            data: {
                cameras: [
                    {
                        id: 'canon-edsdk',
                        label: 'Canon EOS R100 (EDSDK Persistent Daemon)',
                    },
                    { id: 'usb-webcam-1', label: 'USB 2.0 HD UVC Webcam' },
                ],
            },
        }),
        capture: async (_cameraId: string, savePath: string) => ({
            success: true,
            data: { savedPath: savePath },
        }),
        getDriverStatus: async () => {
            let isDaemonAlive = false
            try {
                const daemonRes = await fetch('http://127.0.0.1:8899/status', {
                    signal: AbortSignal.timeout(300),
                })
                if (daemonRes.ok) {
                    const json = await daemonRes.json()
                    isDaemonAlive = Boolean(json.connected)
                }
            } catch {}

            return {
                success: true,
                data: {
                    bundled: true,
                    installed: true,
                    cameraConnected: isDaemonAlive,
                    cameraModel: 'Canon EOS R100 (Direct USB-C EDSDK)',
                    digiCamInstalled: true,
                    digiCamBundled: true,
                },
            }
        },
        installCanonDriver: async () => ({
            success: true,
            data: { message: 'Canon EOS Utility đã được cấu hình.' },
        }),
        installDigiCam: async () => ({
            success: true,
            data: { message: 'Đã mở trình cài đặt digiCamControl.' },
        }),
        edsdkCapture: async (
            savePathOrPayload: string | EdsdkCapturePayload,
            maybeShotIndex?: number
        ) => {
            const payload: EdsdkCapturePayload =
                typeof savePathOrPayload === 'string'
                    ? {
                          savePath: savePathOrPayload,
                          shotIndex: maybeShotIndex ?? 0,
                          slotIndex: maybeShotIndex ?? 0,
                      }
                    : savePathOrPayload

            const captureId = payload.captureId || `cap_${Date.now()}`
            const sessionId = payload.sessionId || `session_${Date.now()}`
            const slotIndex = payload.slotIndex ?? payload.shotIndex ?? 0

            // 1. Gọi trực tiếp Canon EDSDK Persistent Daemon 2.2 POST /api/captures
            try {
                const daemonRes = await fetch(
                    'http://127.0.0.1:8899/api/captures',
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            captureId,
                            sessionId,
                            slotIndex,
                        }),
                        signal: AbortSignal.timeout(7000),
                    }
                )
                if (daemonRes.ok) {
                    const json = await daemonRes.json()
                    if (json && json.success) {
                        return {
                            success: true,
                            data: {
                                savedPath:
                                    json.savedPath ||
                                    payload.savePath ||
                                    `${MOCK_SAVE_BASE}/mock_raw_${captureId}.jpg`,
                                dataUrl: `http://127.0.0.1:8899/frame?t=${Date.now()}`,
                                source:
                                    json.source ||
                                    'Canon EOS R100 (EDSDK Persistent Daemon 2.2)',
                                resolution:
                                    json.resolution || '24MP (Full Resolution)',
                                latencyMs: json.latencyMs,
                                shutterMs: json.shutterMs,
                                transferMs: json.transferMs,
                                captureId,
                                sessionId,
                                slotIndex,
                                idempotent: Boolean(json.idempotent),
                            },
                        }
                    }
                    if (json && json.error) {
                        return { success: false, error: json.error }
                    }
                }
            } catch {}

            // 2. Fallback mock data
            return {
                success: true,
                data: {
                    savedPath:
                        payload.savePath ||
                        `${MOCK_SAVE_BASE}/mock_shot_${Date.now()}.jpg`,
                    dataUrl:
                        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="%23222"/><text x="300" y="200" text-anchor="middle" font-size="20" fill="%23fff">FOTOLISM 2.2 MOCK SHOT</text></svg>',
                    source: 'Mock EDSDK Browser Engine',
                    resolution: '24MP (Simulated)',
                    captureId,
                    sessionId,
                    slotIndex,
                    idempotent: false,
                },
            }
        },
        edsdkLiveviewFrame: async () => ({
            success: false,
            error: '[Mock] EDSDK Live View chưa khả dụng trong browser mode',
        }),
        canonDaemonStatus: async () => {
            try {
                const res = await fetch('http://127.0.0.1:8899/status', {
                    signal: AbortSignal.timeout(500),
                })
                if (res.ok) {
                    const data = (await res.json()) as any
                    return {
                        success: true,
                        data: {
                            running: Boolean(data.connected),
                            url: 'http://127.0.0.1:8899',
                            state: data.cameraState,
                        },
                    }
                }
            } catch {}
            return {
                success: true,
                data: {
                    running: false,
                    url: 'http://127.0.0.1:8899',
                    state: 'DISCONNECTED',
                },
            }
        },
        canonDiagnostics: async () => {
            try {
                const res = await fetch(
                    'http://127.0.0.1:8899/api/diagnostics',
                    { signal: AbortSignal.timeout(600) }
                )
                if (res.ok) {
                    const data = await res.json()
                    return { success: true, data }
                }
            } catch {}
            return {
                success: true,
                data: {
                    cameraState: 'DISCONNECTED',
                    connected: false,
                    evfReady: false,
                    evfFps: 0,
                    evfLatencyMs: 0,
                    activeLiveViewClients: 0,
                    reconnectCount: 0,
                    totalCaptures: 0,
                    failedCaptures: 0,
                    averageCaptureLatencyMs: 0,
                    recentLogs: [],
                },
            }
        },
    },
    session: {
        create: async (sessionData: any) => {
            mockSessions.set(sessionData.id, sessionData)
            return { success: true, data: sessionData }
        },
        get: async (sessionId: string) => {
            return { success: true, data: mockSessions.get(sessionId) || null }
        },
        update: async (sessionId: string, updates: any) => {
            const existing = mockSessions.get(sessionId) || {}
            mockSessions.set(sessionId, { ...existing, ...updates })
            return { success: true }
        },
        getCaptures: async (sessionId: string) => {
            return { success: true, data: mockCaptures.get(sessionId) || [] }
        },
    },
    overhead: {
        getDisplays: async () => ({
            success: true,
            data: [
                {
                    id: 1,
                    label: 'Màn hình chính 1 (1920x1080) - Kiosk Chính',
                    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
                    isPrimary: true,
                },
            ],
        }),
        toggle: async (enabled: boolean) => ({
            success: true,
            data: { active: enabled },
        }),
        status: async () => ({
            success: true,
            data: { active: false },
        }),
    },
    config: {
        get: async (_key: string) => ({ success: true, data: null }),
        set: async () => ({ success: true }),
    },
    device: {
        getConfig: async () => {
            if (
                typeof window !== 'undefined' &&
                window.fotolism?.device?.getConfig
            ) {
                return window.fotolism.device.getConfig()
            }
            const local =
                typeof localStorage !== 'undefined'
                    ? localStorage.getItem('fotolism_device_config')
                    : null
            return { success: true, data: local ? JSON.parse(local) : null }
        },
        saveConfig: async (config: any) => {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(
                    'fotolism_device_config',
                    JSON.stringify(config)
                )
            }
            if (
                typeof window !== 'undefined' &&
                window.fotolism?.device?.saveConfig
            ) {
                return window.fotolism.device.saveConfig(config)
            }
            return { success: true, data: config }
        },
        resetConfig: async () => {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem('fotolism_device_config')
            }
            if (
                typeof window !== 'undefined' &&
                window.fotolism?.device?.resetConfig
            ) {
                return window.fotolism.device.resetConfig()
            }
            return { success: true }
        },
    },
    storage: {
        getDownloadsPath: async () => ({
            success: true,
            data: { path: MOCK_SAVE_BASE, baseDownloads: '~/Downloads' },
        }),
        savePhoto: async (_dataUrl: string, fileName: string) => ({
            success: true,
            data: { savedPath: `${MOCK_SAVE_BASE}/_mock_${fileName}` },
        }),
        openFolder: async () => ({ success: true }),
        getUploadStatus: async () => ({
            success: true,
            data: {
                concurrency: 4,
                activeStreams: 0,
                pendingTasks: 0,
                uploadingTasks: 0,
                uploadedTasks: 12,
                failedTasks: 0,
                isProcessing: false,
            },
        }),
        setConcurrency: async (concurrency: number) => ({
            success: true,
            data: { concurrency },
        }),
        retryFailedUploads: async () => ({
            success: true,
            data: { retriedCount: 0 },
        }),
        enqueueR2Session: async (payload) => ({
            success: true,
            data: {
                sessionId: payload.sessionId,
                folderKey: `fotolism-photos/mock_${payload.sessionId}`,
                enqueuedCount: payload.files.length,
            },
        }),
        finalizeSessionMedia: async (payload) => ({
            success: true,
            data: {
                sessionId: payload.sessionId,
                folderKey: `fotolism-photos/mock_${payload.sessionId}`,
                sessionDir: `F:\\Fotolism_image\\sessions\\${payload.sessionId}`,
                rawDir: `F:\\Fotolism_image\\sessions\\${payload.sessionId}\\raw`,
                finalDir: `F:\\Fotolism_image\\sessions\\${payload.sessionId}\\final`,
                compositePath: `F:\\Fotolism_image\\sessions\\${payload.sessionId}\\final\\${payload.compositeFileName || 'fotolism_final.jpg'}`,
                pairedPrintPath: payload.pairedPrintFileName
                    ? `F:\\Fotolism_image\\sessions\\${payload.sessionId}\\final\\${payload.pairedPrintFileName}`
                    : undefined,
                enqueuedCount: payload.shots.length + 1,
                files: [],
            },
        }),
        onUploadProgress: () => () => {},
    },
}

export const mockApi: FotolismAPI = defaultMockApi

// Re-export brand helpers for convenience
export {
    BRAND_NAME,
    APP_DOMAIN,
    SAVE_FOLDER_NAME,
    SAVE_ROOT_DIR,
    FILE_PREFIX_SHOT,
    FILE_PREFIX_FINAL,
    FILE_PREFIX_TIMELAPSE,
    DEFAULT_ACCOUNT_HOLDER,
}

// Global API resolver: electron context bridge hoặc browser fallback
export const isBrowser =
    typeof window !== 'undefined' && !window.fotolism && !window.joyBooth

export function getActiveApi(): FotolismAPI {
    if (typeof window !== 'undefined' && (window.fotolism || window.joyBooth)) {
        return (window.fotolism || window.joyBooth)!
    }
    return defaultMockApi
}

/**
 * Fotolism API Bridge:
 * Tự động ủy quyền (dynamic proxy) sang `window.fotolism` khi chạy trong Electron,
 * hoặc fallback về `defaultMockApi` khi chạy trên trình duyệt / unit test.
 */
export const fotolismApi: FotolismAPI = new Proxy({} as FotolismAPI, {
    get(_target, prop) {
        const active = getActiveApi()
        return (active as any)[prop]
    },
})

export const api: FotolismAPI = fotolismApi
