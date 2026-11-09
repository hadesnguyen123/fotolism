import { app, BrowserWindow, ipcMain, shell, screen } from 'electron'
import { join } from 'path'
import * as path from 'path'
import * as fs from 'fs'
import { execSync, exec, spawn, ChildProcess } from 'child_process'
import { SessionDB } from './sessionDatabase.cjs'

// ─── FOTOLISM ELECTRON BACKEND CONFIGURATION ─────────────────────────────────
const isDev = process.env.NODE_ENV === 'development'
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173'
const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? 'http://127.0.0.1:8000'

// ── Hardware & Timeout Constants ──
const HARDWARE_TIMEOUT_MS = 6000
const LIVEVIEW_TIMEOUT_MS = 2000
const DEVICE_QUERY_TIMEOUT_MS = 3000
const CANON_VENDOR_ID = 'VID_04A9'

/** Asynchronously executes a CLI command with strict timeout and force-kill protection */
function runAsyncCommand(cmd: string, timeoutMs: number = HARDWARE_TIMEOUT_MS): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let settled = false
    const child = exec(cmd, { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
      if (settled) return
      settled = true
      resolve({ stdout: stdout || '', stderr: stderr || (error ? error.message : '') })
    })

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        try {
          if (child.pid) {
            exec(`taskkill /F /T /PID ${child.pid} 2>nul`, { windowsHide: true })
          }
        } catch (_k) { }
        resolve({ stdout: '', stderr: 'Command timed out' })
      }
    }, timeoutMs + 200)

    child.on('close', () => clearTimeout(timer))
  })
}

// ── Known Installation Paths for Drivers & CLI Tools ──
const CANON_UTILITY_PATHS = [
  'C:\\Program Files\\Canon\\EOS Webcam Utility',
  'C:\\Program Files (x86)\\Canon\\EOS Webcam Utility',
]

const DIGICAM_INSTALL_PATHS = [
  'C:\\Program Files (x86)\\digiCamControl\\CameraControlCmd.exe',
  'C:\\Program Files\\digiCamControl\\CameraControlCmd.exe',
]

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

// ─── OVERHEAD MULTI-MONITOR DISPLAY MANAGER (FR-08) ─────────────────────────
let overheadWindow: BrowserWindow | null = null

function createOverheadWindow(displayId?: number) {
  const displays = screen.getAllDisplays()
  let targetDisplay = displays.find((d) => d.id === displayId)
  if (!targetDisplay) {
    targetDisplay = displays.find((d) => d.id !== screen.getPrimaryDisplay().id) || screen.getPrimaryDisplay()
  }

  if (overheadWindow && !overheadWindow.isDestroyed()) {
    try { overheadWindow.close() } catch { }
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
      preload: join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  })

  const overheadUrl = isDev
    ? `${VITE_DEV_SERVER_URL}?mode=overhead`
    : `file://${join(__dirname, '../dist/index.html')}?mode=overhead`

  overheadWindow.loadURL(overheadUrl)
  overheadWindow.on('closed', () => {
    overheadWindow = null
  })
}

// ─── FOTOLISM STORAGE DIRECTORY (ƯU TIÊN Ổ D:\) ──────────────────────────────
const SAVE_FOLDER_NAME = 'Fotolism_image'
const STORAGE_DRIVE_CANDIDATES = ['D:\\', 'F:\\']

function getFotolismDir(): string {
  for (const drive of STORAGE_DRIVE_CANDIDATES) {
    if (fs.existsSync(drive)) {
      const targetPath = join(drive, SAVE_FOLDER_NAME)
      try {
        if (!fs.existsSync(targetPath)) fs.mkdirSync(targetPath, { recursive: true })
        return targetPath
      } catch (_err) {
        /* proceed to next drive candidate */
      }
    }
  }

  // Fallback nếu không có quyền ghi vào các ổ cứng chính
  const fallbackPath = join(app.getPath('downloads'), SAVE_FOLDER_NAME)
  if (!fs.existsSync(fallbackPath)) fs.mkdirSync(fallbackPath, { recursive: true })
  return fallbackPath
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

// AI Service Handlers
ipcMain.handle('ai:enhance', async (_event, payload: { imagePath: string; beautyLevel?: number; presetId?: string }) => {
  try {
    await ensureAiService()
    const res = await fetch(`${AI_SERVICE_URL}/enhance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imagePath: payload.imagePath,
        beautyLevel: payload.beautyLevel ?? 50,
        presetId: payload.presetId || 'korean_soft_beauty',
      }),
    })
    return res.json()
  } catch (err: any) {
    console.warn('[AI Service] Enhance IPC error:', err.message)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('ai:composite', async (_event, payload: { imagePath: string; framePath: string }) => {
  const res = await fetch(`${AI_SERVICE_URL}/composite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return res.json()
})

ipcMain.handle('ai:generate-qr', async (_event, payload: { sessionId: string; imagePath: string }) => {
  const res = await fetch(`${AI_SERVICE_URL}/qr/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return res.json()
})

// Print Handlers & Mutex Lock (Đảm bảo mỗi phiên chỉ in 1 lần, không ghi đè, không chạy đè lệnh in)
let isPrintSpoolerActive = false

ipcMain.handle('print:send', async (_event, payload: { imagePath: string; copies: number; printerName?: string }) => {
  if (isPrintSpoolerActive) {
    console.warn('[Print] BỊ CHẶN: Đang có một lệnh in khác đang xử lý trong Windows Spooler, tuyệt đối không ghi đè!')
    return { success: false, error: 'Máy in đang bận thực thi lệnh in trước, không được gửi đè lệnh in mới.' }
  }

  isPrintSpoolerActive = true
  let localTempFile = ''

  try {
    const copiesCount = Math.max(1, payload.copies || 1)
    const targetPrinter = payload.printerName && payload.printerName !== 'Default Windows Printer' && !payload.printerName.includes('SELPHY')
      ? payload.printerName
      : 'DS-RX1'

    console.log(`[Print] Bắt đầu gửi lệnh in ${copiesCount} bản tới máy in: "${targetPrinter}"`)

    const jobUniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

    // 1. Lưu file ảnh cần in ra thư mục tạm trên ổ cứng với ID duy nhất tuyệt đối (không bao giờ ghi đè)
    try {
      const isDataUrl = payload.imagePath.startsWith('data:')
      if (isDataUrl) {
        const base64Data = payload.imagePath.replace(/^data:image\/\w+;base64,/, '')
        localTempFile = path.join(app.getPath('temp'), `fotolism_print_${jobUniqueId}.jpg`)
        fs.writeFileSync(localTempFile, Buffer.from(base64Data, 'base64'))
      } else if (fs.existsSync(payload.imagePath)) {
        localTempFile = payload.imagePath
      } else {
        localTempFile = path.join(app.getPath('temp'), `fotolism_print_${jobUniqueId}.jpg`)
        fs.writeFileSync(localTempFile, Buffer.from(payload.imagePath, 'base64'))
      }
    } catch (err: any) {
      console.error('[Print] Lỗi chuẩn bị file ảnh in:', err)
      return { success: false, error: `Lỗi chuẩn bị file in: ${err.message}` }
    }

    // 2. Phương pháp: In trực tiếp qua Windows Spooler (.NET System.Drawing.Printing.PrintDocument)
    const psPrintSuccess = await new Promise<boolean>((resolve) => {
      const scriptPath = path.join(app.getPath('temp'), `print_job_${jobUniqueId}.ps1`)
      const safeImagePath = localTempFile.replace(/'/g, "''")
      const safePrinter = targetPrinter.replace(/'/g, "''")

      const psContent = `
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Drawing
  $printer = '${safePrinter}'
  $file = '${safeImagePath}'
  $copies = ${copiesCount}

  $doc = New-Object System.Drawing.Printing.PrintDocument
  $doc.PrinterSettings.PrinterName = $printer
  if (-not $doc.PrinterSettings.IsValid) {
    throw "Máy in '$printer' không khả dụng hoặc chưa kết nối!"
  }
  $doc.PrinterSettings.Copies = $copies
  $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
  $doc.OriginAtMargins = $false

  # Chọn khổ giấy chuẩn PR (4x6) cho máy in DNP/Dye-Sub
  $targetPaper = $null
  foreach ($ps in $doc.PrinterSettings.PaperSizes) {
    if ($ps.PaperName -eq 'PR (4x6)') {
      $targetPaper = $ps
      break
    }
  }
  if ($targetPaper -ne $null) {
    $doc.DefaultPageSettings.PaperSize = $targetPaper
  }

  $img = [System.Drawing.Image]::FromFile($file)
  if ($img.Width -gt $img.Height) {
    $doc.DefaultPageSettings.Landscape = $true
  } else {
    $doc.DefaultPageSettings.Landscape = $false
  }

  $doc.add_PrintPage({
    param($s, $ev)
    $ev.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $ev.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $ev.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $bounds = $ev.PageBounds
    $ev.Graphics.DrawImage($img, $bounds.X, $bounds.Y, $bounds.Width, $bounds.Height)
    $ev.HasMorePages = $false
  })

  $doc.Print()
  $img.Dispose()
  $doc.Dispose()
  Write-Output "PRINT_OK"
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
`
      try {
        fs.writeFileSync(scriptPath, psContent, 'utf-8')
        exec(`powershell -ExecutionPolicy Bypass -NoProfile -File "${scriptPath}"`, { timeout: 15000 }, (error, stdout, stderr) => {
          try { fs.unlinkSync(scriptPath) } catch { }
          if (!error && stdout.includes('PRINT_OK')) {
            console.log(`[Print] Lệnh in PowerShell tới "${targetPrinter}" THÀNH CÔNG!`)
            resolve(true)
          } else {
            console.warn(`[Print] PowerShell print warning:`, error || stderr)
            resolve(false)
          }
        })
      } catch (e) {
        console.warn('[Print] Không thể tạo file script PowerShell:', e)
        resolve(false)
      }
    })

    const jobId = `print-${Date.now()}`

    if (psPrintSuccess) {
      try {
        SessionDB.createPrintJob({
          id: jobId,
          session_id: 'direct-print',
          file_path: localTempFile,
          copies: copiesCount,
          status: 'SUCCESS',
          printer_name: targetPrinter,
          completed_at: new Date().toISOString(),
        })
      } catch { }

      return { success: true, data: { jobId } }
    }

    // 3. Phương pháp 2: Fallback qua Electron Hidden Window
    console.log('[Print] Chuyển sang fallback Electron print...')
    try {
      const printWindow = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      })

      const tempHtml = path.join(app.getPath('temp'), `print_page_${jobUniqueId}.html`)
      const htmlContent = `<!DOCTYPE html><html><head><style>@page{size:4in 6in;margin:0;}*{box-sizing:border-box;}html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#fff;}img{width:100vw;height:100vh;object-fit:fill;display:block;}</style></head><body><img src="${localTempFile.replace(/\\/g, '/')}" /></body></html>`
      fs.writeFileSync(tempHtml, htmlContent, 'utf-8')

      await printWindow.loadFile(tempHtml)
      await new Promise((r) => setTimeout(r, 400))

      return await new Promise((resolve) => {
        printWindow.webContents.print(
          {
            silent: true,
            printBackground: true,
            landscape: false,
            copies: copiesCount,
            margins: { marginType: 'none' },
            useDefaultPageSize: true,
            deviceName: targetPrinter,
          } as any,
          (success, failureReason) => {
            printWindow.close()
            try { fs.unlinkSync(tempHtml) } catch { }
            if (success) {
              resolve({ success: true, data: { jobId } })
            } else {
              resolve({ success: false, error: failureReason || 'In thất bại qua Windows Spooler' })
            }
          }
        )
      })
    } catch (fallbackErr: any) {
      return { success: false, error: fallbackErr.message || 'Lỗi in thất bại' }
    }
  } finally {
    isPrintSpoolerActive = false
    // Tự động dọn dẹp file in tạm thời trong %TEMP% sau 8 giây (để Windows Spooler kịp đọc xong)
    if (localTempFile && localTempFile.includes(app.getPath('temp')) && fs.existsSync(localTempFile)) {
      setTimeout(() => {
        try {
          if (fs.existsSync(localTempFile)) fs.unlinkSync(localTempFile)
        } catch { }
      }, 8000)
    }
  }
})

ipcMain.handle('print:list-printers', async () => {
  try {
    if (mainWindow && mainWindow.webContents) {
      const printers = await mainWindow.webContents.getPrintersAsync()
      if (printers && printers.length > 0) {
        return {
          success: true,
          data: {
            printers: printers.map((p) => ({
              name: p.name,
              isDefault: Boolean((p as any).isDefault || (p.options as any)?.['is-default']),
            })),
          },
        }
      }
    }
  } catch (err) {
    console.warn('getPrintersAsync error:', err)
  }

  try {
    const res = await fetch(`${AI_SERVICE_URL}/print/printers`)
    return res.json()
  } catch {
    return {
      success: true,
      data: {
        printers: [],
      },
    }
  }
})

// Camera Basic Handlers
ipcMain.handle('camera:list', async () => {
  const res = await fetch(`${AI_SERVICE_URL}/camera/list`)
  return res.json()
})

ipcMain.handle('camera:capture', async (_event, payload: { cameraId: string; savePath: string }) => {
  const res = await fetch(`${AI_SERVICE_URL}/camera/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return res.json()
})

// ─── CANON EOS DRIVER HELPER ─────────────────────────────────────────────────
function findCanonDriverSetupPath(): string | null {
  const candidates = [
    join(app.getAppPath(), 'resources/drivers/EOSWebcamUtility/Setup.exe'),
    join(process.resourcesPath || '', 'resources/drivers/EOSWebcamUtility/Setup.exe'),
    join(process.resourcesPath || '', 'drivers/EOSWebcamUtility/Setup.exe'),
    join(__dirname, '../resources/drivers/EOSWebcamUtility/Setup.exe'),
    join(__dirname, '../../resources/drivers/EOSWebcamUtility/Setup.exe'),
    join(process.cwd(), 'desktop/resources/drivers/EOSWebcamUtility/Setup.exe'),
    join(process.cwd(), 'resources/drivers/EOSWebcamUtility/Setup.exe'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function findDigiCamSetupPath(): string | null {
  const candidates = [
    join(app.getAppPath(), 'resources/drivers/digiCamControl/digiCamControlsetup.exe'),
    join(process.resourcesPath || '', 'resources/drivers/digiCamControl/digiCamControlsetup.exe'),
    join(process.resourcesPath || '', 'drivers/digiCamControl/digiCamControlsetup.exe'),
    join(__dirname, '../resources/drivers/digiCamControl/digiCamControlsetup.exe'),
    join(__dirname, '../../resources/drivers/digiCamControl/digiCamControlsetup.exe'),
    join(process.cwd(), 'desktop/resources/drivers/digiCamControl/digiCamControlsetup.exe'),
    join(process.cwd(), 'resources/drivers/digiCamControl/digiCamControlsetup.exe'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

ipcMain.handle('camera:get-driver-status', async () => {
  const setupPath = findCanonDriverSetupPath()
  const bundled = setupPath !== null
  const installed = CANON_UTILITY_PATHS.some((p) => fs.existsSync(p))

  // Kiểm tra digiCamControl (EDSDK Shutter Control)
  const digiCamInstalled = DIGICAM_INSTALL_PATHS.some((p) => fs.existsSync(p))
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
  } catch (_e) {
    /* ignore */
  }

  return {
    success: true,
    data: {
      bundled,
      installed,
      cameraConnected,
      cameraModel: cameraModel || (cameraConnected ? 'Canon EOS Camera' : undefined),
      setupPath,
      digiCamInstalled,
      digiCamBundled: digiCamSetupPath !== null,
    },
  }
})

ipcMain.handle('camera:install-canon-driver', async () => {
  const setupPath = findCanonDriverSetupPath()
  if (!setupPath) {
    return { success: false, error: 'Không tìm thấy bộ cài driver Canon EOS.' }
  }
  try {
    const res = await shell.openPath(setupPath)
    if (res) return { success: false, error: res }
    return { success: true, data: { message: 'Đã khởi chạy trình cài đặt Canon EOS Webcam Utility.' } }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('camera:install-digicam', async () => {
  const setupPath = findDigiCamSetupPath()
  if (!setupPath) {
    return { success: false, error: 'Không tìm thấy bộ cài digiCamControl trong thư mục resources.' }
  }
  try {
    const res = await shell.openPath(setupPath)
    if (res) return { success: false, error: res }
    return { success: true, data: { message: 'Đã mở trình cài đặt digiCamControl trên màn hình của bạn. Vui lòng bấm Next để hoàn tất.' } }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

// ─── CANON EDSDK PERSISTENT DAEMON (ZERO DELAY & PURE LIVEVIEW) ──────────────
const CANON_DAEMON_PORT = 8899
const CANON_DAEMON_URL = `http://127.0.0.1:${CANON_DAEMON_PORT}`
let canonDaemonProc: ChildProcess | null = null

async function checkCanonDaemon(): Promise<boolean> {
  try {
    const res = await fetch(`${CANON_DAEMON_URL}/status`, { signal: AbortSignal.timeout(400) })
    if (res.ok) {
      const data = (await res.json()) as any
      return Boolean(data.connected)
    }
  } catch { }
  return false
}

async function ensureCanonDaemon(): Promise<boolean> {
  if (await checkCanonDaemon()) return true

  const daemonPaths = [
    path.join(__dirname, '../electron/fotolism_canon_daemon.exe'),
    path.join(app.getAppPath(), 'electron/fotolism_canon_daemon.exe'),
    'F:/JoyBooth/desktop/electron/fotolism_canon_daemon.exe',
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

    // Chờ tối đa 3 giây để daemon mở kết nối máy ảnh và lắng nghe port
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 200))
      if (await checkCanonDaemon()) {
        console.log(`[Canon Daemon] Connected & listening on port ${CANON_DAEMON_PORT}`)
        return true
      }
    }
  } catch (err: any) {
    console.warn('[Canon Daemon] Spawn exception:', err.message)
  }
  return false
}

function stopCanonDaemon() {
  try {
    fetch(`${CANON_DAEMON_URL}/quit`, { signal: AbortSignal.timeout(500) }).catch(() => { })
  } catch { }
  if (canonDaemonProc && canonDaemonProc.pid) {
    try {
      exec(`taskkill /F /PID ${canonDaemonProc.pid} 2>nul`, { windowsHide: true })
    } catch { }
    canonDaemonProc = null
  }
}

// ─── AI SERVICE DAEMON SUPERVISOR (FASTAPI PORT 8000) ──────────────────────
const AI_SERVICE_PORT = 8000
let aiServiceProc: ChildProcess | null = null

async function checkAiService(): Promise<boolean> {
  try {
    const res = await fetch(`${AI_SERVICE_URL}/health`, { signal: AbortSignal.timeout(500) })
    return res.ok
  } catch { }
  return false
}

async function ensureAiService(): Promise<boolean> {
  if (await checkAiService()) return true

  const aiScriptPaths = [
    path.join(__dirname, '../ai-service/main.py'),
    path.join(app.getAppPath(), 'ai-service/main.py'),
    path.join(process.cwd(), 'ai-service/main.py'),
    'F:/JoyBooth/desktop/ai-service/main.py',
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
        console.log(`[AI Service] Connected & listening on port ${AI_SERVICE_PORT}`)
        return true
      }
    }
  } catch (err: any) {
    console.warn('[AI Service] Spawn error:', err.message)
  }
  return false
}

function stopAiService() {
  if (aiServiceProc && aiServiceProc.pid) {
    try {
      exec(`taskkill /F /T /PID ${aiServiceProc.pid} 2>nul`, { windowsHide: true })
    } catch { }
    aiServiceProc = null
  }
}

ipcMain.handle('camera:canon-daemon-status', async () => {
  const isRunning = await checkCanonDaemon()
  return { success: true, data: { running: isRunning, url: CANON_DAEMON_URL } }
})

// ─── CANON PERSISTENT DAEMON DIAGNOSTICS (FR-09) ────────────────────────────
ipcMain.handle('camera:canon-diagnostics', async () => {
  try {
    const res = await fetch(`${CANON_DAEMON_URL}/api/diagnostics`, { signal: AbortSignal.timeout(1000) })
    if (res.ok) {
      const data = await res.json()
      return { success: true, data }
    }
  } catch { }
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

// ─── EDSDK HARDWARE CAPTURE (FOTOLISM 2.2 IDEMPOTENCY & SESSIONS) ───────────
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
      const captureId = payload.captureId || `cap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`

      // 1. Chụp qua Canon Daemon Persistent (FR-01, FR-02, FR-03, FR-05)
      const daemonReady = await ensureCanonDaemon()
      if (!daemonReady) {
        console.warn('[Canon Daemon] Canon camera not connected or daemon not ready.')
        return {
          success: false,
          error: 'Máy ảnh Canon chưa kết nối hoặc chưa bật nguồn.',
        }
      }

      if (daemonReady) {
        try {
          console.log(`[Canon Daemon] Posting capture: ID=${captureId}, Session=${sessionId}, Slot=${slotIndex}`)
          const daemonRes = await fetch(`${CANON_DAEMON_URL}/api/captures`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ captureId, sessionId, slotIndex }),
            signal: AbortSignal.timeout(HARDWARE_TIMEOUT_MS),
          })

          if (daemonRes.ok) {
            const result = (await daemonRes.json()) as any
            const targetPath = result.savedPath || payload.savePath
            if (result.success && targetPath && fs.existsSync(targetPath) && fs.statSync(targetPath).size > 1000) {
              const buffer = fs.readFileSync(targetPath)
              const sizeMb = (buffer.length / (1024 * 1024)).toFixed(1)

              // Lưu trạng thái chụp vào SQLite persistent session storage (FR-06)
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
                console.warn('[SessionDB] SQLite record warning:', dbErr)
              }

              console.log(
                `[Canon Daemon] Shutter success! Saved: ${targetPath} (${sizeMb} MB) in ${result.latencyMs}ms (Idempotent: ${Boolean(result.idempotent)})`
              )
              return {
                success: true,
                data: {
                  savedPath: targetPath,
                  dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`,
                  source: result.source || 'Canon EOS R100 (EDSDK Persistent Daemon 2.2)',
                  resolution: result.resolution || '24MP (Full Resolution)',
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
              console.warn('[Canon Daemon] Daemon capture returned error:', result.error)
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
              } catch { }
              return { success: false, error: result.error, idempotent: Boolean(result.idempotent) }
            }
          }
        } catch (daemonErr: any) {
          console.warn('[Canon Daemon] POST /api/captures failed, trying legacy route:', daemonErr.message)
        }
      }

      // Fallback: Legacy /capture route if daemon running older revision or direct file path
      const savePath = payload.savePath || join(getFotolismDir(), `fotolism_shot_${Date.now()}.jpg`)
      const saveDir = join(savePath, '..')
      if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true })

      // 2. Fallback: Trực tiếp gọi native Canon EDSDK 64-bit EXE (KHÔNG truyền -noaf vì EOS R100 cần Halfway AF để nhả màn trập)
      const canonExePaths = [
        path.join(__dirname, '../electron/fotolism_canon_capture.exe'),
        path.join(app.getAppPath(), 'electron/fotolism_canon_capture.exe'),
        'F:/JoyBooth/desktop/electron/fotolism_canon_capture.exe',
      ]
      const canonExe = canonExePaths.find((p) => fs.existsSync(p))

      const canonScriptPaths = [
        path.join(__dirname, '../electron/canon_edsdk_capture.ps1'),
        path.join(app.getAppPath(), 'electron/canon_edsdk_capture.ps1'),
        'F:/JoyBooth/desktop/electron/canon_edsdk_capture.ps1',
      ]
      const canonScript = canonScriptPaths.find((p) => fs.existsSync(p))

      if (canonExe || canonScript) {
        try {
          const captureCmd = canonExe
            ? `"${canonExe}" -savePath "${savePath}"`
            : `powershell -NoProfile -ExecutionPolicy Bypass -File "${canonScript}" -savePath "${savePath}"`
          const { stdout } = await runAsyncCommand(captureCmd, HARDWARE_TIMEOUT_MS)

          if (fs.existsSync(savePath) && fs.statSync(savePath).size > 1000) {
            const buffer = fs.readFileSync(savePath)
            const sizeMb = (buffer.length / (1024 * 1024)).toFixed(1)
            console.log(`[EDSDK Native 64-bit] Shutter triggered successfully! Saved: ${savePath} (${sizeMb} MB)`)
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

          // Parse JSON output nếu có thông báo lỗi từ script
          try {
            const parsed = JSON.parse(stdout || '{}')
            if (parsed && parsed.error) {
              console.warn('[EDSDK Native] Error:', parsed.error)
              return {
                success: false,
                error: parsed.error,
              }
            }
          } catch { }

          return {
            success: false,
            error: 'Không thể nhận được ảnh từ Canon EDSDK 64-bit.',
          }
        } catch (nativeErr: any) {
          console.warn('[EDSDK Native] Exception:', nativeErr)
          return {
            success: false,
            error: nativeErr?.message || 'Lỗi ngoại lệ khi gọi Canon EDSDK 64-bit.',
          }
        }
      }

      // 3. Fallback dự phòng: Thử qua digiCamControl CLI (EDSDK 32-bit cũ)
      const digiCamExe = DIGICAM_INSTALL_PATHS.find((p) => fs.existsSync(p))
      if (digiCamExe) {
        // Dùng flag /wait 2000 để digiCamControl có đủ 2 giây chuyển file ảnh 24MP qua USB về đĩa trước khi thoát
        const cmd = `"${digiCamExe}" /capturenoaf /wait 2000 /filename "${savePath}"`
        const { stdout, stderr } = await runAsyncCommand(cmd, HARDWARE_TIMEOUT_MS)
        const cliOutput = stdout || stderr || ''

        // Đợi file ghi hoàn tất vào ổ cứng (chống race condition USB buffer)
        let fileReady = fs.existsSync(savePath) && fs.statSync(savePath).size > 1000
        if (!fileReady) {
          for (let poll = 0; poll < 15; poll++) {
            await new Promise((r) => setTimeout(r, 100))
            if (fs.existsSync(savePath) && fs.statSync(savePath).size > 1000) {
              fileReady = true
              break
            }
          }
        }

        if (fileReady) {
          const buffer = fs.readFileSync(savePath)
          const sizeMb = (buffer.length / (1024 * 1024)).toFixed(1)
          console.log(`[EDSDK] Shutter triggered successfully! Saved: ${savePath} (${sizeMb} MB)`)
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
            error:
              'Chưa phát hiện máy ảnh Canon EOS R100 qua cổng USB! Hãy bật máy ảnh (ON), bấm nhẹ nút chụp để đánh thức nếu đang ngủ (sleep) hoặc cắm lại cáp USB.',
          }
        }

        return {
          success: false,
          error: `Không thể chụp ảnh từ máy ảnh Canon: ${cliOutput.trim() || 'Máy ảnh không phản hồi lệnh chụp.'}`,
        }
      }

      // 3. Thử qua gPhoto2 CLI (nếu có cài trên Windows)
      try {
        await runAsyncCommand(`gphoto2 --capture-image-and-download --filename "${savePath}"`, HARDWARE_TIMEOUT_MS)
        if (fs.existsSync(savePath) && fs.statSync(savePath).size > 1000) {
          const buffer = fs.readFileSync(savePath)
          return {
            success: true,
            data: {
              savedPath: savePath,
              dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`,
              source: 'gphoto2',
              resolution: 'full-24mp',
            },
          }
        }
      } catch (_gErr) {
        /* ignore */
      }

      return {
        success: false,
        error: 'EDSDK chưa được cài đặt. Vui lòng cài digiCamControl từ resources/drivers/digiCamControl.',
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

// EDSDK: Lấy 1 frame Live View chất lượng cao
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

// ─── SQLITE PERSISTENT SESSION HANDLERS (FR-06) ─────────────────────────────
ipcMain.handle('session:create', (_event, sessionData) => {
  try {
    const record = SessionDB.createSession(sessionData)
    return { success: true, data: record }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('session:get', (_event, sessionId: string) => {
  try {
    const record = SessionDB.getSession(sessionId)
    return { success: true, data: record }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('session:update', (_event, payload: { id: string; updates: any }) => {
  try {
    SessionDB.updateSession(payload.id, payload.updates)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('session:get-captures', (_event, sessionId: string) => {
  try {
    const records = SessionDB.getCaptures(sessionId)
    return { success: true, data: records }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

// ─── OVERHEAD MULTI-MONITOR IPC HANDLERS (FR-08) ────────────────────────────
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

ipcMain.handle('overhead:toggle', (_event, payload: { enabled: boolean; displayId?: number }) => {
  try {
    if (payload.enabled) {
      createOverheadWindow(payload.displayId)
    } else if (overheadWindow && !overheadWindow.isDestroyed()) {
      try { overheadWindow.close() } catch { }
      overheadWindow = null
    }
    return { success: true, data: { active: Boolean(overheadWindow && !overheadWindow.isDestroyed()) } }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('overhead:status', () => {
  return { success: true, data: { active: Boolean(overheadWindow && !overheadWindow.isDestroyed()) } }
})

// ─── Config Handlers ─────────────────────────────────────────────────────────
ipcMain.handle('config:get', async (_event, key: string) => {
  const res = await fetch(`${AI_SERVICE_URL}/config/${key}`)
  return res.json()
})

ipcMain.handle('config:set', async (_event, payload: { key: string; value: unknown }) => {
  const res = await fetch(`${AI_SERVICE_URL}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return res.json()
})

// ─── Device Provisioning & Configuration Handlers ───────────────────────────
const DEVICE_CONFIG_FILENAME = 'device_config.json'

function getDeviceConfigPath(): string {
  const fotolismDir = getFotolismDir()
  if (fs.existsSync(fotolismDir)) {
    return join(fotolismDir, DEVICE_CONFIG_FILENAME)
  }
  return join(app.getPath('userData'), DEVICE_CONFIG_FILENAME)
}

ipcMain.handle('device:get-config', async () => {
  try {
    const primaryPath = join(getFotolismDir(), DEVICE_CONFIG_FILENAME)
    const fallbackPath = join(app.getPath('userData'), DEVICE_CONFIG_FILENAME)

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
    const primaryPath = join(dir, DEVICE_CONFIG_FILENAME)
    fs.writeFileSync(primaryPath, JSON.stringify(config, null, 2), 'utf-8')

    try {
      const userDataDir = app.getPath('userData')
      if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true })
      fs.writeFileSync(join(userDataDir, DEVICE_CONFIG_FILENAME), JSON.stringify(config, null, 2), 'utf-8')
    } catch { }

    return { success: true, data: config }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('device:reset-config', async () => {
  try {
    const p1 = join(getFotolismDir(), DEVICE_CONFIG_FILENAME)
    if (fs.existsSync(p1)) fs.unlinkSync(p1)

    try {
      const p2 = join(app.getPath('userData'), DEVICE_CONFIG_FILENAME)
      if (fs.existsSync(p2)) fs.unlinkSync(p2)
    } catch { }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

// ─── Storage Handlers (Fotolism_image folder) ─────────────────────────────────
ipcMain.handle('storage:get-downloads-path', async () => {
  try {
    const dir = getFotolismDir()
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return { success: true, data: { path: dir, baseDownloads: app.getPath('downloads') } }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('storage:save-photo', async (_event, payload: { dataUrl: string; fileName: string }) => {
  try {
    const dir = getFotolismDir()
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const base64Data = payload.dataUrl.replace(/^data:[^;]+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')
    const targetFile = join(dir, payload.fileName)
    fs.writeFileSync(targetFile, buffer)
    return { success: true, data: { savedPath: targetFile } }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('storage:open-folder', async (_event, targetPath?: string) => {
  try {
    const folderToOpen = targetPath || getFotolismDir()
    if (!fs.existsSync(folderToOpen)) fs.mkdirSync(folderToOpen, { recursive: true })
    await shell.openPath(folderToOpen)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle(
  'storage:upload-drive-session',
  async (
    _event,
    payload: {
      parentFolderId: string
      subfolderName: string
      files: Array<{ name: string; dataUrl: string }>
      webhookUrl?: string
    }
  ) => {
    try {
      const localSessionDir = join(getFotolismDir(), payload.subfolderName)
      if (!fs.existsSync(localSessionDir)) fs.mkdirSync(localSessionDir, { recursive: true })

      const savedFiles: string[] = []
      for (const item of payload.files) {
        if (!item.dataUrl) continue
        try {
          const targetFilePath = join(localSessionDir, item.name)
          if (item.dataUrl.startsWith('data:')) {
            const base64Data = item.dataUrl.replace(/^data:[^;]+;base64,/, '')
            const buffer = Buffer.from(base64Data, 'base64')
            fs.writeFileSync(targetFilePath, buffer)
            savedFiles.push(targetFilePath)
          } else if (fs.existsSync(item.dataUrl)) {
            fs.copyFileSync(item.dataUrl, targetFilePath)
            savedFiles.push(targetFilePath)
          }
        } catch (fileErr) {
          console.warn('Cannot write session file:', item.name, fileErr)
        }
      }

      let cloudFolderUrl = `https://drive.google.com/drive/folders/${payload.parentFolderId}`
      let cloudFolderId = payload.parentFolderId

      const effectiveWebhook = (payload.webhookUrl && payload.webhookUrl.trim().startsWith('http'))
        ? payload.webhookUrl.trim()
        : 'https://script.google.com/macros/s/AKfycbw2koNyt_6qjUzZn9waLYL4eDv_YbRrp7PuZoPHgJoFZVETOKEnMdo_nbfyHm9BzvI1/exec'

      if (effectiveWebhook) {
        try {
          const filesForWebhook = payload.files.map((f) => {
            let dataUrl = f.dataUrl
            if (!dataUrl.startsWith('data:')) {
              try {
                const mimeType = f.name.endsWith('.webm') ? 'video/webm' : 'image/jpeg'
                if (fs.existsSync(dataUrl)) {
                  const buf = fs.readFileSync(dataUrl)
                  dataUrl = `data:${mimeType};base64,${buf.toString('base64')}`
                } else {
                  const targetFilePath = join(localSessionDir, f.name)
                  if (fs.existsSync(targetFilePath)) {
                    const buf = fs.readFileSync(targetFilePath)
                    dataUrl = `data:${mimeType};base64,${buf.toString('base64')}`
                  }
                }
              } catch (readErr) {
                console.warn('Failed to read file for webhook base64:', f.name, readErr)
              }
            }
            return { name: f.name, dataUrl }
          })

          const validFilesForWebhook = filesForWebhook.filter(
            (f) => f.dataUrl && f.dataUrl.startsWith('data:')
          )

          console.log(
            `[Google Drive Webhook] Uploading ${validFilesForWebhook.length}/${filesForWebhook.length} valid files to Webhook: ${effectiveWebhook}`
          )

          const res = await fetch(effectiveWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'create_session_folder',
              parentFolderId: payload.parentFolderId,
              folderName: payload.subfolderName,
              files: validFilesForWebhook,
            }),
            redirect: 'follow',
          })

          if (!res.ok) {
            const errText = await res.text()
            console.error(`[Google Drive Webhook] Server returned HTTP ${res.status}:`, errText.slice(0, 200))
            return {
              success: false,
              error: `Webhook phản hồi lỗi HTTP ${res.status}. Vui lòng kiểm tra quyền truy cập trên Google Apps Script.`,
            }
          }

          const resJson: any = await res.json()
          if (!resJson || !resJson.success || !resJson.folderUrl) {
            console.error('[Google Drive Webhook] Invalid response from script:', resJson)
            return {
              success: false,
              error: resJson?.error || 'Không nhận được đường link thư mục từ Google Drive Webhook.',
            }
          }

          cloudFolderUrl = resJson.folderUrl
          cloudFolderId = resJson.folderId || cloudFolderId
          console.log(`[Google Drive Webhook] Upload SUCCESS! Cloud Folder URL: ${cloudFolderUrl}`)
        } catch (netErr: any) {
          console.error('[Google Drive Webhook] Network / Upload error:', netErr.message)
          return {
            success: false,
            error: `Lỗi kết nối Webhook: ${netErr.message}`,
          }
        }
      }

      return {
        success: true,
        data: {
          localDir: localSessionDir,
          cloudFolderUrl,
          cloudFolderId,
          subfolderName: payload.subfolderName,
          filesCount: savedFiles.length,
        },
      }
    } catch (err: any) {
      console.error('Upload drive session failed:', err)
      return { success: false, error: err.message }
    }
  }
)

ipcMain.handle('storage:test-webhook', async (_event, webhookUrl: string) => {
  try {
    if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
      return { success: false, error: 'URL Webhook không hợp lệ.' }
    }
    const res = await fetch(webhookUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'test_connection',
        timestamp: new Date().toISOString(),
      }),
    })

    if (res.status === 401 || res.status === 403) {
      return {
        success: false,
        statusCode: res.status,
        error: `Lỗi HTTP ${res.status}: Webhook đang bị chặn quyền truy cập. Trong Google Apps Script > Quản lý bản triển khai > Chỉnh sửa > Hãy chọn 'Người có quyền truy cập: Bất kỳ ai' (Anyone).`,
      }
    }

    const text = await res.text()
    let json: any = null
    try {
      json = JSON.parse(text)
    } catch { }

    if (json && json.success) {
      return {
        success: true,
        statusCode: res.status,
        message: 'Kết nối Webhook thành công! Google Drive đã sẵn sàng nhận ảnh.',
      }
    }

    if (res.ok) {
      return {
        success: true,
        statusCode: res.status,
        message: 'Webhook phản hồi 200 OK. Đã xác nhận quyền "Bất kỳ ai" thành công!',
      }
    }

    return {
      success: false,
      statusCode: res.status,
      error: `Webhook phản hồi mã lỗi HTTP ${res.status}. Vui lòng kiểm tra mã Apps Script.`,
    }
  } catch (err: any) {
    return {
      success: false,
      error: `Lỗi kết nối Webhook: ${err.message}`,
    }
  }
})

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


/**
 * Tự động dọn dẹp ổ đĩa (Disk Storage Retention Policy):
 * 1. Xóa các file in tạm rác (%TEMP%\fotolism_print_*.jpg, print_job_*.ps1) cũ hơn 2 giờ.
 * 2. Xóa các thư mục session ảnh cũ hơn 15 ngày tại F:\Fotolism_image\sessions\ để tránh đầy ổ cứng SSD.
 */
function cleanupDiskStorage(retentionDays = 15): void {
  try {
    const tempDir = app.getPath('temp')
    const now = Date.now()

    // 1. Quét dọn temp folder
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir)
      for (const file of files) {
        if (file.startsWith('fotolism_print_') || file.startsWith('print_job_') || file.startsWith('print_page_')) {
          try {
            const fullPath = path.join(tempDir, file)
            const stats = fs.statSync(fullPath)
            if (now - stats.mtimeMs > 2 * 3600 * 1000) { // Cũ hơn 2 tiếng
              fs.unlinkSync(fullPath)
            }
          } catch { }
        }
      }
    }

    // 2. Quét dọn sessions cũ trên SSD (F:\Fotolism_image\sessions)
    const sessionsBase = 'F:\\Fotolism_image\\sessions'
    if (fs.existsSync(sessionsBase)) {
      const sessionDirs = fs.readdirSync(sessionsBase)
      const cutoffMs = now - retentionDays * 24 * 3600 * 1000
      let cleanedCount = 0

      for (const dirName of sessionDirs) {
        try {
          const dirPath = path.join(sessionsBase, dirName)
          const stats = fs.statSync(dirPath)
          if (stats.isDirectory() && stats.mtimeMs < cutoffMs) {
            fs.rmSync(dirPath, { recursive: true, force: true })
            cleanedCount++
          }
        } catch { }
      }

      if (cleanedCount > 0) {
        console.log(`[Storage Retention] Đã tự động dọn dẹp ${cleanedCount} thư mục phiên chụp cũ hơn ${retentionDays} ngày.`)
      }
    }
  } catch (err) {
    console.warn('[Storage Retention] Lỗi trong quá trình dọn dẹp ổ đĩa:', err)
  }
}

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
