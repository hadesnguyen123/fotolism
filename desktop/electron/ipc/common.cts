import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { exec } from 'child_process'

export const HARDWARE_TIMEOUT_MS = 6000
export const LIVEVIEW_TIMEOUT_MS = 2000
export const DEVICE_QUERY_TIMEOUT_MS = 3000
export const CANON_VENDOR_ID = 'VID_04A9'

export const CANON_DAEMON_PORT = 8899
export const CANON_DAEMON_URL = `http://127.0.0.1:${CANON_DAEMON_PORT}`

export const AI_SERVICE_PORT = 8000
export const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? `http://127.0.0.1:${AI_SERVICE_PORT}`

export const CANON_UTILITY_PATHS = [
  'C:\\Program Files\\Canon\\EOS Webcam Utility',
  'C:\\Program Files (x86)\\Canon\\EOS Webcam Utility',
]

export const DIGICAM_INSTALL_PATHS = [
  'C:\\Program Files (x86)\\digiCamControl\\CameraControlCmd.exe',
  'C:\\Program Files\\digiCamControl\\CameraControlCmd.exe',
]

export const SAVE_FOLDER_NAME = 'Fotolism_image'
export const STORAGE_DRIVE_CANDIDATES = ['D:\\', 'F:\\']

export function getFotolismDir(): string {
  for (const drive of STORAGE_DRIVE_CANDIDATES) {
    if (fs.existsSync(drive)) {
      const targetPath = path.join(drive, SAVE_FOLDER_NAME)
      try {
        if (!fs.existsSync(targetPath)) fs.mkdirSync(targetPath, { recursive: true })
        return targetPath
      } catch (_err) {
        /* proceed to next drive candidate */
      }
    }
  }

  const fallbackPath = path.join(app.getPath('downloads'), SAVE_FOLDER_NAME)
  if (!fs.existsSync(fallbackPath)) fs.mkdirSync(fallbackPath, { recursive: true })
  return fallbackPath
}

export function runAsyncCommand(cmd: string, timeoutMs: number = HARDWARE_TIMEOUT_MS): Promise<{ stdout: string; stderr: string }> {
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
        } catch (_k) {}
        resolve({ stdout: '', stderr: 'Command timed out' })
      }
    }, timeoutMs + 200)

    child.on('close', () => clearTimeout(timer))
  })
}
