import { app, BrowserWindow, ipcMain, screen } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { spawn, exec, ChildProcess } from 'child_process'
import { AI_SERVICE_PORT, AI_SERVICE_URL, getFotolismDir } from './common.cjs'

const isDev = process.env.NODE_ENV === 'development'
const VITE_DEV_SERVER_URL =
    process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173'

let overheadWindow: BrowserWindow | null = null
let aiServiceProc: ChildProcess | null = null

export async function checkAiService(): Promise<boolean> {
    try {
        const res = await fetch(`${AI_SERVICE_URL}/health`, {
            signal: AbortSignal.timeout(500),
        })
        return res.ok
    } catch {}
    return false
}

export async function ensureAiService(): Promise<boolean> {
    if (await checkAiService()) return true

    const aiScriptPaths = [
        path.join(__dirname, '../../ai-service/main.py'),
        path.join(__dirname, '../ai-service/main.py'),
        path.join(app.getAppPath(), 'ai-service/main.py'),
        path.join(process.cwd(), 'desktop/ai-service/main.py'),
        'F:/Fotolism/desktop/ai-service/main.py',
    ]
    const aiScript = aiScriptPaths.find((p) => fs.existsSync(p))
    if (!aiScript) {
        console.warn('[AI Service] main.py not found in desktop/ai-service')
        return false
    }

    const aiDir = path.dirname(aiScript)
    try {
        console.log(`[AI Service] Spawning local FastAPI backend: ${aiScript}`)
        aiServiceProc = spawn('python', ['main.py'], {
            cwd: aiDir,
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
        })
        aiServiceProc.unref()

        for (let i = 0; i < 15; i++) {
            await new Promise((r) => setTimeout(r, 200))
            if (await checkAiService()) {
                console.log(
                    `[AI Service] Connected & listening on port ${AI_SERVICE_PORT}`
                )
                return true
            }
        }
    } catch (err: any) {
        console.warn('[AI Service] Spawn error:', err.message)
    }
    return false
}

export function stopAiService() {
    if (aiServiceProc && aiServiceProc.pid) {
        try {
            exec(`taskkill /F /T /PID ${aiServiceProc.pid} 2>nul`, {
                windowsHide: true,
            })
        } catch {}
        aiServiceProc = null
    }
}

export function createOverheadWindow(displayId?: number) {
    const displays = screen.getAllDisplays()
    let targetDisplay = displays.find((d) => d.id === displayId)
    if (!targetDisplay) {
        targetDisplay =
            displays.find((d) => d.id !== screen.getPrimaryDisplay().id) ||
            screen.getPrimaryDisplay()
    }

    if (overheadWindow && !overheadWindow.isDestroyed()) {
        try {
            overheadWindow.close()
        } catch {}
        overheadWindow = null
    }

    overheadWindow = new BrowserWindow({
        x: targetDisplay.bounds.x,
        y: targetDisplay.bounds.y,
        width: targetDisplay.bounds.width,
        height: targetDisplay.bounds.height,
        fullscreen: !isDev,
        frame: false,
        backgroundColor: '#000000',
        webPreferences: {
            preload: path.join(__dirname, '../preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
        },
    })

    const overheadUrl = isDev
        ? `${VITE_DEV_SERVER_URL}?mode=overhead`
        : `file://${path.join(__dirname, '../../dist/index.html')}?mode=overhead`

    overheadWindow.loadURL(overheadUrl)
    overheadWindow.on('closed', () => {
        overheadWindow = null
    })
}

const DEVICE_CONFIG_FILENAME = 'device_config.json'

export function registerWindowAndConfigIpc(): void {
    // Overhead Handlers
    ipcMain.handle('overhead:get-displays', () => {
        try {
            const primaryId = screen.getPrimaryDisplay().id
            const displays = screen.getAllDisplays().map((d) => ({
                id: d.id,
                label: `Màn hình ${d.id} (${d.bounds.width}x${d.bounds.height})${d.id === primaryId ? ' - Kiosk Chính' : ' - Overhead Phụ'}`,
                bounds: d.bounds,
                isPrimary: d.id === primaryId,
            }))
            return { success: true, data: displays }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    })

    ipcMain.handle(
        'overhead:toggle',
        (_event, payload: { enabled: boolean; displayId?: number }) => {
            try {
                if (payload.enabled) {
                    createOverheadWindow(payload.displayId)
                } else if (overheadWindow && !overheadWindow.isDestroyed()) {
                    try {
                        overheadWindow.close()
                    } catch {}
                    overheadWindow = null
                }
                return {
                    success: true,
                    data: {
                        active: Boolean(
                            overheadWindow && !overheadWindow.isDestroyed()
                        ),
                    },
                }
            } catch (err: any) {
                return { success: false, error: err.message }
            }
        }
    )

    ipcMain.handle('overhead:status', () => {
        return {
            success: true,
            data: {
                active: Boolean(
                    overheadWindow && !overheadWindow.isDestroyed()
                ),
            },
        }
    })

    // Config Handlers
    ipcMain.handle('config:get', async (_event, key: string) => {
        const res = await fetch(`${AI_SERVICE_URL}/config/${key}`)
        return res.json()
    })

    ipcMain.handle(
        'config:set',
        async (_event, payload: { key: string; value: unknown }) => {
            const res = await fetch(`${AI_SERVICE_URL}/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            return res.json()
        }
    )

    // Device Handlers
    ipcMain.handle('device:get-config', async () => {
        try {
            const primaryPath = path.join(
                getFotolismDir(),
                DEVICE_CONFIG_FILENAME
            )
            const fallbackPath = path.join(
                app.getPath('userData'),
                DEVICE_CONFIG_FILENAME
            )

            const targetPath = fs.existsSync(primaryPath)
                ? primaryPath
                : fs.existsSync(fallbackPath)
                  ? fallbackPath
                  : null

            if (targetPath) {
                const content = fs.readFileSync(targetPath, 'utf-8')
                const parsed = JSON.parse(content)
                return { success: true, data: parsed }
            }
            return { success: true, data: null }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    })

    ipcMain.handle('device:save-config', async (_event, config) => {
        try {
            const dir = getFotolismDir()
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
            const primaryPath = path.join(dir, DEVICE_CONFIG_FILENAME)
            fs.writeFileSync(
                primaryPath,
                JSON.stringify(config, null, 2),
                'utf-8'
            )

            try {
                const userDataDir = app.getPath('userData')
                if (!fs.existsSync(userDataDir))
                    fs.mkdirSync(userDataDir, { recursive: true })
                fs.writeFileSync(
                    path.join(userDataDir, DEVICE_CONFIG_FILENAME),
                    JSON.stringify(config, null, 2),
                    'utf-8'
                )
            } catch {}

            return { success: true, data: config }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    })

    ipcMain.handle('device:reset-config', async () => {
        try {
            const p1 = path.join(getFotolismDir(), DEVICE_CONFIG_FILENAME)
            if (fs.existsSync(p1)) fs.unlinkSync(p1)

            try {
                const p2 = path.join(
                    app.getPath('userData'),
                    DEVICE_CONFIG_FILENAME
                )
                if (fs.existsSync(p2)) fs.unlinkSync(p2)
            } catch {}

            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    })

    // AI Service Handlers
    ipcMain.handle(
        'ai:enhance',
        async (
            _event,
            payload: {
                imagePath: string
                beautyLevel?: number
                presetId?: string
                styleId?: string
            }
        ) => {
            try {
                await ensureAiService()
                const res = await fetch(`${AI_SERVICE_URL}/enhance`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imagePath: payload.imagePath,
                        beautyLevel: payload.beautyLevel ?? 50,
                        presetId: payload.presetId || 'korean_soft_beauty',
                        styleId: payload.styleId || 'natural',
                    }),
                    signal: AbortSignal.timeout(6000),
                })
                if (!res.ok) {
                    return {
                        success: false,
                        error: `AI Service HTTP ${res.status}`,
                    }
                }
                return await res.json()
            } catch (err: any) {
                return { success: false, error: err.message }
            }
        }
    )

    ipcMain.handle(
        'ai:composite',
        async (_event, payload: { imagePath: string; framePath: string }) => {
            const res = await fetch(`${AI_SERVICE_URL}/composite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            return res.json()
        }
    )

    ipcMain.handle(
        'ai:generate-qr',
        async (_event, payload: { sessionId: string; imagePath: string }) => {
            const res = await fetch(`${AI_SERVICE_URL}/qr`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            return res.json()
        }
    )
}
