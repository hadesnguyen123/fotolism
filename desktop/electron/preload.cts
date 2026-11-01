import { contextBridge, ipcRenderer } from 'electron'

// Expose typed API từ main process sang renderer (React)
// Đây là bridge an toàn — renderer không có quyền node trực tiếp

type IpcResponse<T = unknown> = Promise<{ success: boolean; data?: T; error?: string }>

export interface EdsdkCapturePayload {
  savePath?: string
  shotIndex?: number
  captureId?: string
  sessionId?: string
  slotIndex?: number
}

const api = {
  // ── AI ───────────────────────────────────────────────────────────────────
  ai: {
    enhance: (imagePath: string, beautyLevel: number): IpcResponse =>
      ipcRenderer.invoke('ai:enhance', { imagePath, beautyLevel }),

    composite: (imagePath: string, framePath: string): IpcResponse =>
      ipcRenderer.invoke('ai:composite', { imagePath, framePath }),

    generateQr: (sessionId: string, imagePath: string): IpcResponse =>
      ipcRenderer.invoke('ai:generate-qr', { sessionId, imagePath }),
  },

  // ── Print ────────────────────────────────────────────────────────────────
  print: {
    send: (imagePath: string, copies: number): IpcResponse =>
      ipcRenderer.invoke('print:send', { imagePath, copies }),

    listPrinters: (): IpcResponse =>
      ipcRenderer.invoke('print:list-printers'),
  },

  // ── Camera (Fotolism 2.2 EDSDK & Reliability) ─────────────────────────────
  camera: {
    list: (): IpcResponse =>
      ipcRenderer.invoke('camera:list'),

    capture: (cameraId: string, savePath: string): IpcResponse =>
      ipcRenderer.invoke('camera:capture', { cameraId, savePath }),

    getDriverStatus: (): IpcResponse<{
      bundled: boolean
      installed: boolean
      cameraConnected: boolean
      cameraModel?: string
      setupPath?: string
      digiCamInstalled?: boolean
      digiCamBundled?: boolean
    }> => ipcRenderer.invoke('camera:get-driver-status'),

    installCanonDriver: (): IpcResponse<{ message?: string }> =>
      ipcRenderer.invoke('camera:install-canon-driver'),

    installDigiCam: (): IpcResponse<{ message?: string }> =>
      ipcRenderer.invoke('camera:install-digicam'),

    /** EDSDK: Kích hoạt chụp ảnh máy ảnh thật với Idempotency & Session Support */
    edsdkCapture: (
      payloadOrPath: EdsdkCapturePayload | string,
      maybeShotIndex?: number
    ): IpcResponse<{
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
    }> => {
      const payload: EdsdkCapturePayload =
        typeof payloadOrPath === 'string'
          ? { savePath: payloadOrPath, shotIndex: maybeShotIndex ?? 0, slotIndex: maybeShotIndex ?? 0 }
          : payloadOrPath
      return ipcRenderer.invoke('camera:edsdk-capture', payload)
    },

    /** EDSDK: Lấy 1 frame Live View chất lượng cao từ máy ảnh */
    edsdkLiveviewFrame: (): IpcResponse<{ dataUrl: string }> =>
      ipcRenderer.invoke('camera:edsdk-liveview-frame'),

    /** Canon Persistent Daemon Status */
    canonDaemonStatus: (): IpcResponse<{ running: boolean; url: string; state?: string }> =>
      ipcRenderer.invoke('camera:canon-daemon-status'),

    /** Canon Persistent Daemon Diagnostics (FR-09) */
    canonDiagnostics: (): IpcResponse<any> =>
      ipcRenderer.invoke('camera:canon-diagnostics'),
  },

  // ── Session & SQLite Persistence (FR-06) ──────────────────────────────────
  session: {
    create: (sessionData: any): IpcResponse<any> =>
      ipcRenderer.invoke('session:create', sessionData),

    get: (sessionId: string): IpcResponse<any> =>
      ipcRenderer.invoke('session:get', sessionId),

    update: (sessionId: string, updates: any): IpcResponse<any> =>
      ipcRenderer.invoke('session:update', { id: sessionId, updates }),

    getCaptures: (sessionId: string): IpcResponse<any[]> =>
      ipcRenderer.invoke('session:get-captures', sessionId),
  },

  // ── Multi-Monitor & Overhead (FR-08) ──────────────────────────────────────
  overhead: {
    getDisplays: (): IpcResponse<Array<{ id: number; bounds: any; isPrimary: boolean; label: string }>> =>
      ipcRenderer.invoke('overhead:get-displays'),

    toggle: (enabled: boolean, displayId?: number): IpcResponse<{ active: boolean; displayId?: number }> =>
      ipcRenderer.invoke('overhead:toggle', { enabled, displayId }),

    status: (): IpcResponse<{ active: boolean; displayId?: number }> =>
      ipcRenderer.invoke('overhead:status'),
  },

  // ── Config ───────────────────────────────────────────────────────────────
  config: {
    get: (key: string): IpcResponse =>
      ipcRenderer.invoke('config:get', key),

    set: (key: string, value: unknown): IpcResponse =>
      ipcRenderer.invoke('config:set', { key, value }),
  },

  // ── Device Provisioning (device_config.json) ──────────────────────────────
  device: {
    getConfig: (): IpcResponse<any> =>
      ipcRenderer.invoke('device:get-config'),

    saveConfig: (config: any): IpcResponse<any> =>
      ipcRenderer.invoke('device:save-config', config),

    resetConfig: (): IpcResponse<void> =>
      ipcRenderer.invoke('device:reset-config'),
  },

  // ── Storage (Downloads folder) ────────────────────────────────────────────
  storage: {
    getDownloadsPath: (): IpcResponse<{ path: string; baseDownloads: string }> =>
      ipcRenderer.invoke('storage:get-downloads-path'),

    savePhoto: (dataUrl: string, fileName: string): IpcResponse<{ savedPath: string }> =>
      ipcRenderer.invoke('storage:save-photo', { dataUrl, fileName }),

    openFolder: (targetPath?: string): IpcResponse =>
      ipcRenderer.invoke('storage:open-folder', targetPath),

    uploadDriveSession: (payload: {
      parentFolderId: string
      subfolderName: string
      files: Array<{ name: string; dataUrl: string }>
      webhookUrl?: string
    }): IpcResponse<{
      localDir: string
      cloudFolderUrl: string
      cloudFolderId: string
      subfolderName: string
      filesCount: number
    }> => ipcRenderer.invoke('storage:upload-drive-session', payload),

    testDriveWebhook: (webhookUrl: string): IpcResponse<{ message: string; statusCode?: number }> =>
      ipcRenderer.invoke('storage:test-webhook', webhookUrl),
  },
}

// Expose as 'fotolism' (new brand), keep 'joyBooth' alias for backward compat
contextBridge.exposeInMainWorld('fotolism', api)
contextBridge.exposeInMainWorld('joyBooth', api) // backward compat alias

// TypeScript type declaration cho renderer
export type FotolismAPI = typeof api
/** @deprecated Use FotolismAPI */
export type JoyBoothAPI = typeof api
