/**
 * @file windowIpc.cts
 * Quản lý vòng đời cửa sổ phụ Overhead Display, kết nối và điều phối tiến trình AI Service (FastAPI),
 * cùng các handler IPC phục vụ lưu/đọc cấu hình phần cứng Kiosk và xử lý ảnh AI.
 * Phụ thuộc: electron (app, BrowserWindow, ipcMain, screen), child_process, common.cts, aiEnhanceQueue.cts, enhanceIntegrity.cts.
 */

import { app, BrowserWindow, ipcMain, screen } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { spawn, exec, ChildProcess } from 'child_process'
import { AI_SERVICE_PORT, AI_SERVICE_URL, getFotolismDir } from './common.cjs'
import { AiEnhanceQueue } from '../aiEnhanceQueue.cjs'
import { assertEnhancedFile } from '../enhanceIntegrity.cjs'

const isDev = process.env.NODE_ENV === 'development'
const VITE_DEV_SERVER_URL =
    process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173'

let overheadWindow: BrowserWindow | null = null
let aiServiceProc: ChildProcess | null = null
const aiEnhanceQueue = new AiEnhanceQueue(2)

/**
 * Kiểm tra trạng thái hoạt động của tiến trình AI Service qua endpoint /health.
 * Dùng timeout ngắn (500ms) để phản hồi nhanh, không block luồng xử lý UI Kiosk.
 *
 * @returns true nếu AI service phản hồi HTTP OK, ngược lại false.
 */
export async function checkAiService(): Promise<boolean> {
    try {
        const res = await fetch(`${AI_SERVICE_URL}/health`, {
            signal: AbortSignal.timeout(500),
        })
        return res.ok
    } catch {}
    return false
}

/**
 * Đảm bảo tiến trình AI Service đang chạy; nếu chưa có sẽ tự động khởi chạy backend FastAPI.
 * Kiểm tra các đường dẫn có thể chứa main.py (môi trường dev, build đóng gói hoặc ổ cứng cố định).
 *
 * @returns true nếu AI service đã sẵn sàng nhận request, false nếu khởi động thất bại.
 */
export async function ensureAiService(): Promise<boolean> {
    if (await checkAiService()) return true

    // Ưu tiên 1: Chạy binary tự chứa fotolism_ai_service.exe (bản cài All-in-one, không cần Python)
    const aiExePaths = [
        ...(process.resourcesPath
            ? [path.join(process.resourcesPath, 'ai-service/fotolism_ai_service.exe')]
            : []),
        path.join(
            __dirname,
            '../../ai-service/dist/fotolism_ai_service/fotolism_ai_service.exe'
        ),
    ]
    const aiExe = aiExePaths.find((p) => fs.existsSync(p))

    if (aiExe) {
        try {
            console.log(`[AI Service] Spawning bundled binary: ${aiExe}`)
            aiServiceProc = spawn(aiExe, [], {
                cwd: path.dirname(aiExe),
                detached: true,
                stdio: 'ignore',
                windowsHide: true,
                env: {
                    ...process.env,
                    PYTHONIOENCODING: 'utf-8',
                },
            })
            aiServiceProc.unref()

            for (let i = 0; i < 40; i++) {
                await new Promise((r) => setTimeout(r, 250))
                if (await checkAiService()) {
                    console.log(
                        `[AI Service] Bundled binary connected & listening on port ${AI_SERVICE_PORT}`
                    )
                    return true
                }
            }
        } catch (err: any) {
            console.warn('[AI Service] Bundled binary spawn error:', err.message)
        }
        return false
    }

    // Ưu tiên 2 (Dev / fallback): chạy main.py bằng Python cục bộ
    const aiScriptPaths = [
        ...(process.resourcesPath
            ? [path.join(process.resourcesPath, 'ai-service/main.py')]
            : []),
        path.join(__dirname, '../../ai-service/main.py'),
        path.join(__dirname, '../ai-service/main.py'),
        path.join(app.getAppPath(), 'ai-service/main.py'),
        path.join(process.cwd(), 'desktop/ai-service/main.py'),
        'F:/Fotolism/desktop/ai-service/main.py',
    ]
    const aiScript = aiScriptPaths.find((p) => fs.existsSync(p))
    if (!aiScript) {
        console.warn('[AI Service] Neither bundled exe nor main.py found')
        return false
    }

    const aiDir = path.dirname(aiScript)
    const pythonCandidates = [
        process.env.FOTOLISM_PYTHON_PATH,
        'C:\\Fotolism\\ai-env\\Scripts\\python.exe',
    ].filter((p): p is string => Boolean(p))
    const pythonExe = pythonCandidates.find((p) => fs.existsSync(p)) || 'python'

    try {
        console.log(
            `[AI Service] Spawning local FastAPI backend (${pythonExe}): ${aiScript}`
        )
        aiServiceProc = spawn(pythonExe, ['main.py'], {
            cwd: aiDir,
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
            env: {
                ...process.env,
                PYTHONIOENCODING: 'utf-8',
            },
        })
        aiServiceProc.unref()

        for (let i = 0; i < 30; i++) {
            await new Promise((r) => setTimeout(r, 250))
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

/**
 * Cưỡng chế dừng tiến trình AI Service và toàn bộ tiến trình con (tree kill) khi ứng dụng đóng.
 */
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

/**
 * Khởi tạo hoặc tái tạo cửa sổ hiển thị phụ trên trần/màn hình ngoài (Overhead Display).
 * Tự động chọn màn hình phụ khác với màn hình chính của Kiosk nếu không chỉ định displayId.
 *
 * @param displayId ID màn hình Windows đích để hiển thị cửa sổ overhead.
 */
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
            webSecurity: !isDev,
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

/**
 * Đăng ký các kênh IPC phục vụ màn hình phụ Overhead, cấu hình thiết bị Kiosk và giao tiếp AI Service.
 */
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
                outputPath?: string
                beautyLevel?: number
                presetId?: string
                styleId?: string
                cropAspect?: string
            }
        ) => {
            try {
                const effectiveCropAspect =
                    payload.cropAspect ||
                    (payload.outputPath &&
                    path
                        .basename(payload.outputPath)
                        .startsWith('fotolism_enhanced_self_')
                        ? '3:4'
                        : undefined)

                const cleanImagePath = path.resolve(payload.imagePath.replace(/^file:\/+/i, ''))

                // Natural capture preserves the original JPEG bytes and avoids Python startup/inference.
                if (
                    (payload.beautyLevel ?? 50) === 0 &&
                    (!payload.styleId || payload.styleId === 'natural') &&
                    !effectiveCropAspect
                ) {
                    if (!fs.existsSync(cleanImagePath)) throw new Error('Không tìm thấy ảnh gốc')
                    const target = payload.outputPath ? path.resolve(payload.outputPath) : cleanImagePath
                    if (target !== cleanImagePath) {
                        fs.mkdirSync(path.dirname(target), { recursive: true })
                        await fs.promises.copyFile(cleanImagePath, target)
                    }
                    return { success: true, data: { enhancedPath: target } }
                }
                const key = JSON.stringify([
                    cleanImagePath,
                    payload.outputPath, payload.beautyLevel ?? 50,
                    payload.presetId || 'white_pink_v2', payload.styleId || 'natural',
                    effectiveCropAspect || '',
                ])
                return await aiEnhanceQueue.run(key, async () => {
                if (!(await ensureAiService())) throw new Error('AI Service chưa sẵn sàng')
                const res = await fetch(`${AI_SERVICE_URL}/enhance`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imagePath: cleanImagePath,
                        outputPath: payload.outputPath,
                        beautyLevel: payload.beautyLevel ?? 50,
                        presetId: payload.presetId || 'white_pink_v2',
                        styleId: payload.styleId || 'natural',
                        cropAspect: effectiveCropAspect,
                    }),
                    // Starts only once this job reaches the front of the queue.
                    signal: AbortSignal.timeout(180000),
                })
                if (!res.ok) {
                    return {
                        success: false,
                        error: `AI Service HTTP ${res.status}`,
                    }
                }
                const result = await res.json() as {
                    success?: boolean
                    error?: string
                    data?: { status?: string; enhancedPath?: string; message?: string }
                }
                if (!result.success || result.data?.status !== 'processed' || !result.data?.enhancedPath) {
                    return { success: false, error: result.error || result.data?.message || 'AI chưa xử lý ảnh thành công' }
                }

                // Retry ngắn khi Windows Defender/AV tạm khóa file vừa os.replace gây EBUSY/EPERM/stat lỗi tức thời
                let lastVerifyErr: any = null
                for (let attempt = 1; attempt <= 5; attempt++) {
                    try {
                        if (
                            !fs.existsSync(result.data.enhancedPath) ||
                            fs.statSync(result.data.enhancedPath).size === 0
                        ) {
                            throw new Error('AI chưa lưu xong file ảnh')
                        }
                        assertEnhancedFile(cleanImagePath, result.data.enhancedPath)
                        lastVerifyErr = null
                        break
                    } catch (verifyErr: any) {
                        lastVerifyErr = verifyErr
                        const code = verifyErr?.code
                        const isTransientLock =
                            code === 'EBUSY' ||
                            code === 'EPERM' ||
                            code === 'EACCES' ||
                            verifyErr?.message === 'AI chưa lưu xong file ảnh'
                        if (!isTransientLock || attempt === 5) break
                        await new Promise((r) => setTimeout(r, 100 * attempt))
                    }
                }
                if (lastVerifyErr) {
                    throw lastVerifyErr
                }
                return result
                })
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
