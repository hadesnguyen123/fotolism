import { app, ipcMain, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { execSync, exec, spawn, ChildProcess } from 'child_process'
import { SessionDB } from '../sessionDatabase.cjs'
import {
    CANON_DAEMON_URL,
    CANON_DAEMON_PORT,
    AI_SERVICE_URL,
    HARDWARE_TIMEOUT_MS,
    LIVEVIEW_TIMEOUT_MS,
    DEVICE_QUERY_TIMEOUT_MS,
    CANON_VENDOR_ID,
    CANON_UTILITY_PATHS,
    DIGICAM_INSTALL_PATHS,
    getFotolismDir,
    runAsyncCommand,
} from './common.cjs'

let canonDaemonProc: ChildProcess | null = null

export async function checkCanonDaemon(): Promise<boolean> {
    try {
        const res = await fetch(`${CANON_DAEMON_URL}/status`, {
            signal: AbortSignal.timeout(400),
        })
        if (res.ok) {
            const data = (await res.json()) as any
            return Boolean(data.connected)
        }
    } catch {}
    return false
}

export async function ensureCanonDaemon(): Promise<boolean> {
    if (await checkCanonDaemon()) return true

    const daemonPaths = [
        path.join(__dirname, '../fotolism_canon_daemon.exe'),
        path.join(__dirname, '../../electron/fotolism_canon_daemon.exe'),
        path.join(app.getAppPath(), 'electron/fotolism_canon_daemon.exe'),
        'F:/Fotolism/desktop/electron/fotolism_canon_daemon.exe',
    ]
    const daemonExe = daemonPaths.find((p) => fs.existsSync(p))
    if (!daemonExe) {
        console.warn('[Canon Daemon] Daemon executable not found')
        return false
    }

    try {
        console.log(`[Canon Daemon] Launching high-speed daemon: ${daemonExe}`)
        canonDaemonProc = spawn(daemonExe, [], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
        })
        canonDaemonProc.unref()

        for (let i = 0; i < 15; i++) {
            await new Promise((r) => setTimeout(r, 200))
            if (await checkCanonDaemon()) {
                console.log(
                    `[Canon Daemon] Connected & listening on port ${CANON_DAEMON_PORT}`
                )
                return true
            }
        }
    } catch (err: any) {
        console.warn('[Canon Daemon] Spawn exception:', err.message)
    }
    return false
}

export function stopCanonDaemon() {
    try {
        fetch(`${CANON_DAEMON_URL}/quit`, {
            signal: AbortSignal.timeout(500),
        }).catch(() => {})
    } catch {}
    if (canonDaemonProc && canonDaemonProc.pid) {
        try {
            exec(`taskkill /F /PID ${canonDaemonProc.pid} 2>nul`, {
                windowsHide: true,
            })
        } catch {}
        canonDaemonProc = null
    }
}

function findCanonDriverSetupPath(): string | null {
    const candidates = [
        path.join(
            app.getAppPath(),
            'resources/drivers/EOSWebcamUtility/Setup.exe'
        ),
        path.join(
            process.resourcesPath || '',
            'resources/drivers/EOSWebcamUtility/Setup.exe'
        ),
        path.join(
            process.resourcesPath || '',
            'drivers/EOSWebcamUtility/Setup.exe'
        ),
        path.join(__dirname, '../resources/drivers/EOSWebcamUtility/Setup.exe'),
        path.join(
            __dirname,
            '../../resources/drivers/EOSWebcamUtility/Setup.exe'
        ),
        path.join(
            process.cwd(),
            'desktop/resources/drivers/EOSWebcamUtility/Setup.exe'
        ),
        path.join(
            process.cwd(),
            'resources/drivers/EOSWebcamUtility/Setup.exe'
        ),
    ]
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate
    }
    return null
}

function findDigiCamSetupPath(): string | null {
    const candidates = [
        path.join(
            app.getAppPath(),
            'resources/drivers/digiCamControl/digiCamControlsetup.exe'
        ),
        path.join(
            process.resourcesPath || '',
            'resources/drivers/digiCamControl/digiCamControlsetup.exe'
        ),
        path.join(
            process.resourcesPath || '',
            'drivers/digiCamControl/digiCamControlsetup.exe'
        ),
        path.join(
            __dirname,
            '../resources/drivers/digiCamControl/digiCamControlsetup.exe'
        ),
        path.join(
            __dirname,
            '../../resources/drivers/digiCamControl/digiCamControlsetup.exe'
        ),
        path.join(
            process.cwd(),
            'desktop/resources/drivers/digiCamControl/digiCamControlsetup.exe'
        ),
        path.join(
            process.cwd(),
            'resources/drivers/digiCamControl/digiCamControlsetup.exe'
        ),
    ]
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate
    }
    return null
}

/**
 * Lật gương ngang (Horizontal Flip) file ảnh JPEG trực tiếp trên đĩa
 * Đảm bảo 100% ảnh chụp xong từ máy ảnh Canon khớp chính xác với luồng soi gương trên màn hình Kiosk
 */
async function flipImageFile(targetPath: string): Promise<void> {
    return new Promise((resolve) => {
        try {
            if (!targetPath || !fs.existsSync(targetPath)) return resolve()
            if (process.platform === 'win32') {
                const escapedPath = targetPath.replace(/'/g, "''")
                const script = `Add-Type -AssemblyName System.Drawing; $fs = [System.IO.File]::OpenRead('${escapedPath}'); $bmp = [System.Drawing.Bitmap]::FromStream($fs); $fs.Close(); $bmp.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipX); $bmp.Save('${escapedPath}', [System.Drawing.Imaging.ImageFormat]::Jpeg); $bmp.Dispose()`
                exec(
                    `powershell -NoProfile -NonInteractive -Command "${script}"`,
                    (err) => {
                        if (err)
                            console.warn(
                                '[Canon Mirror] PowerShell flip error:',
                                err
                            )
                        resolve()
                    }
                )
            } else if (process.platform === 'darwin') {
                exec(`sips --flipHorizontal "${targetPath}"`, (err) => {
                    if (err)
                        console.warn('[Canon Mirror] sips flip error:', err)
                    resolve()
                })
            } else {
                resolve()
            }
        } catch {
            resolve()
        }
    })
}

export function registerCameraIpc(): void {
    ipcMain.handle('camera:list', async () => {
        const res = await fetch(`${AI_SERVICE_URL}/camera/list`)
        return res.json()
    })

    ipcMain.handle(
        'camera:capture',
        async (_event, payload: { cameraId: string; savePath: string }) => {
            const res = await fetch(`${AI_SERVICE_URL}/camera/capture`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            return res.json()
        }
    )

    ipcMain.handle('camera:get-driver-status', async () => {
        const setupPath = findCanonDriverSetupPath()
        const bundled = setupPath !== null
        const installed = CANON_UTILITY_PATHS.some((p) => fs.existsSync(p))
        const digiCamInstalled = DIGICAM_INSTALL_PATHS.some((p) =>
            fs.existsSync(p)
        )
        const digiCamSetupPath = findDigiCamSetupPath()

        let cameraConnected = false
        let cameraModel = ''

        try {
            const stdout = execSync(
                `powershell -NoProfile -Command "Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object InstanceId -match '${CANON_VENDOR_ID}' | Select-Object -ExpandProperty FriendlyName -First 1"`,
                { encoding: 'utf-8', timeout: DEVICE_QUERY_TIMEOUT_MS }
            ).trim()
            if (stdout) {
                cameraConnected = true
                cameraModel = stdout
            }
        } catch (_e) {}

        return {
            success: true,
            data: {
                bundled,
                installed,
                cameraConnected,
                cameraModel:
                    cameraModel ||
                    (cameraConnected ? 'Canon EOS Camera' : undefined),
                setupPath,
                digiCamInstalled,
                digiCamBundled: digiCamSetupPath !== null,
            },
        }
    })

    ipcMain.handle('camera:install-canon-driver', async () => {
        const setupPath = findCanonDriverSetupPath()
        if (!setupPath) {
            return {
                success: false,
                error: 'Không tìm thấy bộ cài driver Canon EOS.',
            }
        }
        try {
            const res = await shell.openPath(setupPath)
            if (res) return { success: false, error: res }
            return {
                success: true,
                data: {
                    message:
                        'Đã khởi chạy trình cài đặt Canon EOS Webcam Utility.',
                },
            }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    })

    ipcMain.handle('camera:install-digicam', async () => {
        const setupPath = findDigiCamSetupPath()
        if (!setupPath) {
            return {
                success: false,
                error: 'Không tìm thấy bộ cài digiCamControl trong thư mục resources.',
            }
        }
        try {
            const res = await shell.openPath(setupPath)
            if (res) return { success: false, error: res }
            return {
                success: true,
                data: {
                    message:
                        'Đã mở trình cài đặt digiCamControl trên màn hình của bạn. Vui lòng bấm Next để hoàn tất.',
                },
            }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    })

    ipcMain.handle('camera:canon-daemon-status', async () => {
        const isRunning = await checkCanonDaemon()
        return {
            success: true,
            data: { running: isRunning, url: CANON_DAEMON_URL },
        }
    })

    ipcMain.handle('camera:canon-diagnostics', async () => {
        try {
            const res = await fetch(`${CANON_DAEMON_URL}/api/diagnostics`, {
                signal: AbortSignal.timeout(1000),
            })
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
    })

    ipcMain.handle(
        'camera:edsdk-capture',
        async (
            _event,
            payload: {
                savePath?: string
                shotIndex?: number
                captureId?: string
                sessionId?: string
                slotIndex?: number
            }
        ) => {
            try {
                const sessionId = payload.sessionId || `session_${Date.now()}`
                const slotIndex = payload.slotIndex ?? payload.shotIndex ?? 0
                const captureId =
                    payload.captureId ||
                    `cap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`

                const daemonReady = await ensureCanonDaemon()
                if (!daemonReady) {
                    console.warn(
                        '[Canon Daemon] Canon camera not connected or daemon not ready.'
                    )
                    return {
                        success: false,
                        error: 'Máy ảnh Canon chưa kết nối hoặc chưa bật nguồn.',
                    }
                }

                if (daemonReady) {
                    try {
                        console.log(
                            `[Canon Daemon] Posting capture: ID=${captureId}, Session=${sessionId}, Slot=${slotIndex}`
                        )
                        const daemonRes = await fetch(
                            `${CANON_DAEMON_URL}/api/captures`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    captureId,
                                    sessionId,
                                    slotIndex,
                                }),
                                signal: AbortSignal.timeout(
                                    HARDWARE_TIMEOUT_MS
                                ),
                            }
                        )

                        if (daemonRes.ok) {
                            const result = (await daemonRes.json()) as any
                            const targetPath =
                                result.savedPath || payload.savePath
                            if (
                                result.success &&
                                targetPath &&
                                fs.existsSync(targetPath) &&
                                fs.statSync(targetPath).size > 1000
                            ) {
                                // Luôn luôn lật gương ảnh chụp xong (Horizontal Flip)
                                await flipImageFile(targetPath)

                                const buffer = fs.readFileSync(targetPath)
                                const sizeMb = (
                                    buffer.length /
                                    (1024 * 1024)
                                ).toFixed(1)

                                try {
                                    SessionDB.saveCapture({
                                        id: captureId,
                                        session_id: sessionId,
                                        slot_index: slotIndex,
                                        status: 'COMPLETED',
                                        file_path: targetPath,
                                        raw_file_path: targetPath,
                                        is_retake: 0,
                                        retake_count: 0,
                                        latency_ms: result.latencyMs,
                                        shutter_ms: result.shutterMs,
                                        transfer_ms: result.transferMs,
                                    })

                                    SessionDB.recordMediaFile({
                                        id: `media_${captureId}`,
                                        session_id: sessionId,
                                        capture_id: captureId,
                                        type: 'raw',
                                        file_path: targetPath,
                                        file_size: buffer.length,
                                    })
                                } catch (dbErr) {
                                    console.warn(
                                        '[SessionDB] SQLite record warning:',
                                        dbErr
                                    )
                                }

                                console.log(
                                    `[Canon Daemon] Shutter success! Saved: ${targetPath} (${sizeMb} MB) in ${result.latencyMs}ms (Idempotent: ${Boolean(result.idempotent)})`
                                )
                                return {
                                    success: true,
                                    data: {
                                        savedPath: targetPath,
                                        dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`,
                                        source:
                                            result.source ||
                                            'Canon EOS R100 (EDSDK Persistent Daemon 2.2)',
                                        resolution:
                                            result.resolution ||
                                            '24MP (Full Resolution)',
                                        fileSizeMb: sizeMb,
                                        latencyMs: result.latencyMs,
                                        shutterMs: result.shutterMs,
                                        transferMs: result.transferMs,
                                        captureId,
                                        sessionId,
                                        slotIndex,
                                        idempotent: Boolean(result.idempotent),
                                    },
                                }
                            } else if (result.error) {
                                console.warn(
                                    '[Canon Daemon] Daemon capture returned error:',
                                    result.error
                                )
                                try {
                                    SessionDB.saveCapture({
                                        id: captureId,
                                        session_id: sessionId,
                                        slot_index: slotIndex,
                                        status: result.status || 'FAILED',
                                        file_path: targetPath,
                                        is_retake: 0,
                                        retake_count: 0,
                                        latency_ms: result.latencyMs || 0,
                                    })
                                } catch {}
                                return {
                                    success: false,
                                    error: result.error,
                                    idempotent: Boolean(result.idempotent),
                                }
                            }
                        }
                    } catch (daemonErr: any) {
                        console.warn(
                            '[Canon Daemon] POST /api/captures failed, trying fallback:',
                            daemonErr.message
                        )
                    }
                }

                const savePath =
                    payload.savePath ||
                    path.join(
                        getFotolismDir(),
                        `fotolism_shot_${Date.now()}.jpg`
                    )
                const saveDir = path.join(savePath, '..')
                if (!fs.existsSync(saveDir))
                    fs.mkdirSync(saveDir, { recursive: true })

                const canonExePaths = [
                    path.join(__dirname, '../fotolism_canon_capture.exe'),
                    path.join(
                        __dirname,
                        '../../electron/fotolism_canon_capture.exe'
                    ),
                    path.join(
                        app.getAppPath(),
                        'electron/fotolism_canon_capture.exe'
                    ),
                ]
                const canonExe = canonExePaths.find((p) => fs.existsSync(p))

                const canonScriptPaths = [
                    path.join(__dirname, '../canon_edsdk_capture.ps1'),
                    path.join(
                        __dirname,
                        '../../electron/canon_edsdk_capture.ps1'
                    ),
                    path.join(
                        app.getAppPath(),
                        'electron/canon_edsdk_capture.ps1'
                    ),
                ]
                const canonScript = canonScriptPaths.find((p) =>
                    fs.existsSync(p)
                )

                if (canonExe || canonScript) {
                    try {
                        const captureCmd = canonExe
                            ? `"${canonExe}" -savePath "${savePath}"`
                            : `powershell -NoProfile -ExecutionPolicy Bypass -File "${canonScript}" -savePath "${savePath}"`
                        const { stdout } = await runAsyncCommand(
                            captureCmd,
                            HARDWARE_TIMEOUT_MS
                        )

                        if (
                            fs.existsSync(savePath) &&
                            fs.statSync(savePath).size > 1000
                        ) {
                            // Luôn luôn lật gương ảnh chụp xong (Horizontal Flip)
                            await flipImageFile(savePath)

                            const buffer = fs.readFileSync(savePath)
                            const sizeMb = (
                                buffer.length /
                                (1024 * 1024)
                            ).toFixed(1)
                            return {
                                success: true,
                                data: {
                                    savedPath: savePath,
                                    dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`,
                                    source: 'Canon EOS R100 (Native 64-bit EDSDK)',
                                    resolution: '24MP (Full Resolution)',
                                    fileSizeMb: sizeMb,
                                },
                            }
                        }

                        try {
                            const parsed = JSON.parse(stdout || '{}')
                            if (parsed && parsed.error)
                                return { success: false, error: parsed.error }
                        } catch {}

                        return {
                            success: false,
                            error: 'Không thể nhận được ảnh từ Canon EDSDK 64-bit.',
                        }
                    } catch (nativeErr: any) {
                        return {
                            success: false,
                            error:
                                nativeErr?.message ||
                                'Lỗi ngoại lệ khi gọi Canon EDSDK 64-bit.',
                        }
                    }
                }

                const digiCamExe = DIGICAM_INSTALL_PATHS.find((p) =>
                    fs.existsSync(p)
                )
                if (digiCamExe) {
                    const cmd = `"${digiCamExe}" /capturenoaf /wait 2000 /filename "${savePath}"`
                    const { stdout, stderr } = await runAsyncCommand(
                        cmd,
                        HARDWARE_TIMEOUT_MS
                    )
                    const cliOutput = stdout || stderr || ''

                    let fileReady =
                        fs.existsSync(savePath) &&
                        fs.statSync(savePath).size > 1000
                    if (!fileReady) {
                        for (let poll = 0; poll < 15; poll++) {
                            await new Promise((r) => setTimeout(r, 100))
                            if (
                                fs.existsSync(savePath) &&
                                fs.statSync(savePath).size > 1000
                            ) {
                                fileReady = true
                                break
                            }
                        }
                    }

                    if (fileReady) {
                        const buffer = fs.readFileSync(savePath)
                        const sizeMb = (buffer.length / (1024 * 1024)).toFixed(
                            1
                        )
                        return {
                            success: true,
                            data: {
                                savedPath: savePath,
                                dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`,
                                source: 'Canon EOS R100 (digiCamControl EDSDK)',
                                resolution: '24MP (Full Resolution)',
                                fileSizeMb: sizeMb,
                            },
                        }
                    }

                    if (cliOutput.includes('No connected device was found')) {
                        return {
                            success: false,
                            error: 'Chưa phát hiện máy ảnh Canon EOS R100 qua cổng USB! Hãy bật máy ảnh (ON), bấm nhẹ nút chụp để đánh thức nếu đang ngủ (sleep) hoặc cắm lại cáp USB.',
                        }
                    }

                    return {
                        success: false,
                        error: `Không thể chụp ảnh từ máy ảnh Canon: ${cliOutput.trim() || 'Máy ảnh không phản hồi lệnh chụp.'}`,
                    }
                }

                return {
                    success: false,
                    error: 'EDSDK chưa được cài đặt. Vui lòng cài đặt driver Canon EOS.',
                }
            } catch (err: any) {
                return { success: false, error: err.message }
            }
        }
    )

    ipcMain.handle('camera:edsdk-liveview-frame', async () => {
        try {
            const res = await fetch(`${AI_SERVICE_URL}/camera/edsdk-liveview`, {
                signal: AbortSignal.timeout(LIVEVIEW_TIMEOUT_MS),
            })
            if (res.ok) return await res.json()
            return { success: false, error: 'AI service unavailable' }
        } catch (_err) {
            return { success: false, error: 'EDSDK Live View chưa kết nối' }
        }
    })
}
