/**
 * @file main.cts
 * Điểm khởi chạy chính (Main Process) của ứng dụng Electron Kiosk Fotolism:
 * quản lý vòng đời cửa sổ, khởi tạo các dịch vụ nền (Canon Daemon, AI Service, Outbox Worker),
 * khóa ứng dụng đơn thể (single instance lock) và đăng ký toàn bộ kênh giao tiếp IPC.
 * Phụ thuộc: electron, path, các module IPC trong ./ipc/.
 */

import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import {
    registerCameraIpc,
    ensureCanonDaemon,
    stopCanonDaemon,
} from './ipc/cameraIpc.cjs'
import { registerPrinterIpc } from './ipc/printerIpc.cjs'
import { registerStorageIpc, cleanupDiskStorage } from './ipc/storageIpc.cjs'
import { registerSessionIpc } from './ipc/sessionIpc.cjs'
import {
    registerWindowAndConfigIpc,
    ensureAiService,
    stopAiService,
} from './ipc/windowIpc.cjs'
import { checkAndInstallStartupUpdate } from './autoUpdater.cjs'

// ─── FOTOLISM ELECTRON BACKEND CONFIGURATION ─────────────────────────────────
// Luôn đặt SQLite SessionDB vào thư mục userData có quyền ghi, tránh lỗi "unable to open database file"
// khi app chạy từ thư mục cài đặt chỉ-đọc (Program Files / System32 sau Auto-Update).
if (!process.env.FOTOLISM_DB_PATH) {
    try {
        process.env.FOTOLISM_DB_PATH = join(
            app.getPath('userData'),
            'fotolism_sessions.db'
        )
    } catch {}
}
try {
    process.loadEnvFile?.(join(__dirname, '../.env'))
} catch {}
try {
    process.loadEnvFile?.(join(__dirname, '../.env.local'))
} catch {}

const isDev = process.env.NODE_ENV === 'development'
const KIOSK_MODE = process.env.VITE_KIOSK_MODE
const VITE_DEV_SERVER_URL =
    process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173'

/**
 * Lấy đường dẫn bản sao bền vững `kiosk-mode.json` nằm trong `%APPDATA%\fotolism-desktop`
 * (không bị trình gỡ cài đặt NSIS xóa khi Auto-Update).
 */
function getPersistentKioskModePath(): string | null {
    try {
        return join(app.getPath('appData'), 'fotolism-desktop', 'kiosk-mode.json')
    } catch {
        return null
    }
}

/**
 * Đồng bộ bản sao bền vững `kiosk-mode.json` trong `%APPDATA%\fotolism-desktop`
 * để luôn giữ đúng chế độ Photobooth/Selfbooth trước và sau mỗi lần Auto-Update.
 */
function syncPersistentKioskMode(mode: 'photobooth' | 'selfbooth'): void {
    const persistentPath = getPersistentKioskModePath()
    if (!persistentPath) return
    try {
        if (existsSync(persistentPath)) {
            const existing = JSON.parse(readFileSync(persistentPath, 'utf-8')) as {
                captureMode?: string
            }
            if (existing.captureMode === mode) return
        }
        mkdirSync(dirname(persistentPath), { recursive: true })
        writeFileSync(
            persistentPath,
            JSON.stringify({ captureMode: mode }),
            'utf-8'
        )
    } catch {
        // Không làm gián đoạn khởi động Kiosk nếu không ghi được bản sao dự phòng
    }
}

/**
 * Đọc chế độ Kiosk đã chọn khi cài đặt (từ `resources/kiosk-mode.json`, bản sao bền vững
 * `%APPDATA%\fotolism-desktop\kiosk-mode.json`, `userData/kiosk-mode.json`) hoặc biến môi trường dev.
 */
function resolveInstalledKioskMode(): 'photobooth' | 'selfbooth' | undefined {
    if (KIOSK_MODE === 'photobooth' || KIOSK_MODE === 'selfbooth') {
        return KIOSK_MODE
    }
    const persistentPath = getPersistentKioskModePath()
    let userDataModePath: string | null = null
    try {
        userDataModePath = join(app.getPath('userData'), 'kiosk-mode.json')
    } catch {
        userDataModePath = null
    }
    const candidates = [
        ...(process.resourcesPath
            ? [join(process.resourcesPath, 'kiosk-mode.json')]
            : []),
        ...(persistentPath ? [persistentPath] : []),
        ...(userDataModePath ? [userDataModePath] : []),
        join(app.getAppPath(), 'kiosk-mode.json'),
    ]
    for (const filePath of candidates) {
        try {
            if (!existsSync(filePath)) continue
            const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as {
                captureMode?: string
            }
            if (
                parsed.captureMode === 'photobooth' ||
                parsed.captureMode === 'selfbooth'
            ) {
                syncPersistentKioskMode(parsed.captureMode)
                return parsed.captureMode
            }
        } catch {
            // Bỏ qua file cấu hình lỗi định dạng
        }
    }
    return undefined
}

let mainWindow: BrowserWindow | null = null

/**
 * Khởi tạo cửa sổ BrowserWindow chính của Kiosk.
 * Cấu hình chế độ toàn màn hình không viền ở production và tải URL tương ứng.
 */
function createWindow() {
    const isSelfboothDev = isDev && KIOSK_MODE === 'selfbooth'
    mainWindow = new BrowserWindow({
        width: isSelfboothDev ? 540 : 1920,
        height: isSelfboothDev ? 960 : 1080,
        fullscreen: !isDev,
        frame: isDev,
        kiosk: !isDev,
        backgroundColor: '#0d0d0d',
        webPreferences: {
            preload: join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: !isDev,
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
                    console.warn(
                        `[Electron] Vite server not ready yet, retrying in 1s (${retries} retries left)...`
                    )
                    setTimeout(() => loadWithRetry(retries - 1), 1000)
                } else {
                    console.error(
                        '[Electron] Failed to connect to Vite dev server:',
                        err
                    )
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
ipcMain.on('app:get-kiosk-mode', (event) => {
    event.returnValue = resolveInstalledKioskMode() ?? null
})
ipcMain.handle('app:quit', () => {
    app.quit()
    return { success: true }
})
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

    app.whenReady().then(async () => {
        // Đồng bộ bản sao bền vững kiosk-mode.json vào %APPDATA%\fotolism-desktop TRƯỚC khi auto-update chạy
        resolveInstalledKioskMode()

        // Kiểm tra & tự cài bản cập nhật mới từ GitHub Releases trước khi vào màn hình Kiosk
        const isInstallingUpdate = await checkAndInstallStartupUpdate(() => {
            stopCanonDaemon()
            stopAiService()
        })
        if (isInstallingUpdate) return

        createWindow()
        // Khởi động Canon Daemon Persistent và AI Service trong nền ngay khi mở ứng dụng
        ensureCanonDaemon().catch((err) =>
            console.warn('[Canon Daemon] Init failed:', err)
        )
        ensureAiService().catch((err) =>
            console.warn('[AI Service] Init failed:', err)
        )
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
