import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerCameraIpc, ensureCanonDaemon, stopCanonDaemon } from './ipc/cameraIpc.cjs'
import { registerPrinterIpc } from './ipc/printerIpc.cjs'
import { registerStorageIpc, cleanupDiskStorage } from './ipc/storageIpc.cjs'
import { registerSessionIpc } from './ipc/sessionIpc.cjs'
import { registerWindowAndConfigIpc, ensureAiService, stopAiService } from './ipc/windowIpc.cjs'

// ─── FOTOLISM ELECTRON BACKEND CONFIGURATION ─────────────────────────────────
const isDev = process.env.NODE_ENV === 'development'
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: !isDev,
    frame: isDev,
    kiosk: !isDev,
    backgroundColor: '#0d0d0d',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  })

  if (isDev) {
    const loadWithRetry = async (retries = 15) => {
      if (!mainWindow) return
      try {
        await mainWindow.loadURL(VITE_DEV_SERVER_URL)
        mainWindow.webContents.openDevTools({ mode: 'detach' })
      } catch (err) {
        if (retries > 0) {
          console.warn(`[Electron] Vite server not ready yet, retrying in 1s (${retries} retries left)...`)
          setTimeout(() => loadWithRetry(retries - 1), 1000)
        } else {
          console.error('[Electron] Failed to connect to Vite dev server:', err)
        }
      }
    }
    loadWithRetry()
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─── Register All Modular IPC Subsystems ────────────────────────────────────
registerCameraIpc()
registerPrinterIpc(() => mainWindow)
registerStorageIpc()
registerSessionIpc()
registerWindowAndConfigIpc()

// ─── App Lifecycle & Single Instance Lock ──────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    createWindow()
    // Khởi động Canon Daemon Persistent và AI Service trong nền ngay khi mở ứng dụng
    ensureCanonDaemon().catch((err) => console.warn('[Canon Daemon] Init failed:', err))
    ensureAiService().catch((err) => console.warn('[AI Service] Init failed:', err))
    // Chạy tác vụ dọn dẹp ổ đĩa ngầm sau 10 giây khi khởi động
    setTimeout(() => cleanupDiskStorage(15), 10000)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('will-quit', () => {
    stopCanonDaemon()
    stopAiService()
  })

  app.on('window-all-closed', () => {
    stopCanonDaemon()
    stopAiService()
    if (process.platform !== 'darwin') app.quit()
  })
}
