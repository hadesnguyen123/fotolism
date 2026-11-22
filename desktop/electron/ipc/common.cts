/**
 * @file common.cts
 * Cấu hình hằng số phần cứng, cổng daemon, đường dẫn thư mục lưu trữ cục bộ
 * và hàm tiện ích thực thi lệnh shell an toàn cho toàn bộ tầng IPC Electron.
 * Phụ thuộc: electron app, Node.js path/fs/child_process.
 */

import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { exec } from 'child_process'

// Nạp biến môi trường ngay khi khởi tạo IPC helper (ưu tiên cấu hình ngoài app.asar khi chạy bản đóng gói)
const envCandidates = [
    path.join(__dirname, '../../.env'),
    path.join(__dirname, '../../.env.local'),
    ...(process.resourcesPath
        ? [path.join(process.resourcesPath, '.env')]
        : []),
    path.join(path.dirname(process.execPath), '.env'),
    ...(app ? [path.join(app.getPath('userData'), '.env')] : []),
]
for (const envPath of envCandidates) {
    try {
        if (fs.existsSync(envPath)) {
            process.loadEnvFile?.(envPath)
        }
    } catch {}
}

/** Thời gian chờ tối đa cho các lệnh thao tác phần cứng (ms). */
export const HARDWARE_TIMEOUT_MS = 6000
/** Thời gian chờ tối đa khi lấy khung hình LiveView (ms). */
export const LIVEVIEW_TIMEOUT_MS = 2000
/** Thời gian chờ tối đa khi truy vấn thông tin thiết bị qua PowerShell/WMI (ms). */
export const DEVICE_QUERY_TIMEOUT_MS = 3000
/** Mã định danh phần cứng (Vendor ID) của Canon qua cổng USB. */
export const CANON_VENDOR_ID = 'VID_04A9'

/** Địa chỉ & cổng lắng nghe của Canon EDSDK Native Daemon (mặc định localhost:8899 nếu không có .env). */
export const CANON_DAEMON_URL = (
    process.env.CANON_DAEMON_URL || 'http://127.0.0.1:8899'
).replace(/\/$/, '')
export const CANON_DAEMON_PORT = Number(
    (() => {
        try {
            return CANON_DAEMON_URL ? new URL(CANON_DAEMON_URL).port || '8899' : '8899'
        } catch {
            return '8899'
        }
    })()
)

/** Địa chỉ & cổng lắng nghe của Python FastAPI AI Service (mặc định localhost:8000 nếu không có .env). */
export const AI_SERVICE_URL = (
    process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000'
).replace(/\/$/, '')
export const AI_SERVICE_PORT = Number(
    (() => {
        try {
            return AI_SERVICE_URL ? new URL(AI_SERVICE_URL).port || '8000' : '8000'
        } catch {
            return '8000'
        }
    })()
)

/** Đường dẫn cài đặt EOS Webcam Utility có thể gây xung đột chiếm dụng camera EDSDK. */
export const CANON_UTILITY_PATHS = [
    'C:\\Program Files\\Canon\\EOS Webcam Utility',
    'C:\\Program Files (x86)\\Canon\\EOS Webcam Utility',
]

/** Đường dẫn digiCamControl CLI dùng làm giải pháp chụp dự phòng. */
export const DIGICAM_INSTALL_PATHS = [
    'C:\\Program Files (x86)\\digiCamControl\\CameraControlCmd.exe',
    'C:\\Program Files\\digiCamControl\\CameraControlCmd.exe',
]

export const SAVE_FOLDER_NAME = 'Fotolism_image'
/** Danh sách ổ đĩa ưu tiên lưu trữ ảnh Kiosk để giảm hao mòn ổ C hệ thống. */
export const STORAGE_DRIVE_CANDIDATES = ['D:\\', 'F:\\']

/**
 * Xác định thư mục lưu trữ ảnh của Kiosk trên ổ đĩa dữ liệu ưu tiên (D: hoặc F:).
 * Nếu không có ổ đĩa phụ, rơi về thư mục Downloads của người dùng để tránh crash.
 *
 * @returns Đường dẫn tuyệt đối của thư mục lưu ảnh gốc và sản phẩm.
 */
export function getFotolismDir(): string {
    for (const drive of STORAGE_DRIVE_CANDIDATES) {
        if (fs.existsSync(drive)) {
            const targetPath = path.join(drive, SAVE_FOLDER_NAME)
            try {
                if (!fs.existsSync(targetPath))
                    fs.mkdirSync(targetPath, { recursive: true })
                return targetPath
            } catch (_err) {
                /* proceed to next drive candidate */
            }
        }
    }

    const fallbackPath = path.join(app.getPath('downloads'), SAVE_FOLDER_NAME)
    if (!fs.existsSync(fallbackPath))
        fs.mkdirSync(fallbackPath, { recursive: true })
    return fallbackPath
}

/**
 * Thực thi lệnh hệ thống bất đồng bộ kèm cơ chế timeout và cưỡng chế tắt tiến trình con (tree kill).
 * Ngăn chặn tiến trình zombie treo hệ điều hành Kiosk khi phần cứng không phản hồi.
 *
 * @param cmd Chuỗi lệnh command-line cần chạy.
 * @param timeoutMs Thời gian chờ tối đa tính bằng mili-giây.
 * @returns Kết quả gồm stdout và stderr từ lệnh thực thi.
 */
export function runAsyncCommand(
    cmd: string,
    timeoutMs: number = HARDWARE_TIMEOUT_MS
): Promise<{ stdout: string; stderr: string }> {

    return new Promise((resolve) => {
        let settled = false
        const child = exec(
            cmd,
            { timeout: timeoutMs, windowsHide: true },
            (error, stdout, stderr) => {
                if (settled) return
                settled = true
                resolve({
                    stdout: stdout || '',
                    stderr: stderr || (error ? error.message : ''),
                })
            }
        )

        const timer = setTimeout(() => {
            if (!settled) {
                settled = true
                try {
                    if (child.pid) {
                        exec(`taskkill /F /T /PID ${child.pid} 2>nul`, {
                            windowsHide: true,
                        })
                    }
                } catch (_k) {}
                resolve({ stdout: '', stderr: 'Command timed out' })
            }
        }, timeoutMs + 200)

        child.on('close', () => clearTimeout(timer))
    })
}
