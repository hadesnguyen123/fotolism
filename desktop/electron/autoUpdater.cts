/**
 * @file autoUpdater.cts
 * Quản lý cơ chế tự động kiểm tra, tải và cài đặt bản cập nhật Fotolism từ GitHub Releases
 * ngay khi khởi động ứng dụng (trước khi mở màn hình Kiosk).
 * Đảm bảo bất biến offline-first: mất mạng hoặc lỗi tải sẽ tự bỏ qua sau timeout ngắn để Kiosk chạy bình thường.
 * Phụ thuộc: electron, electron-updater.
 */

import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

/** Thời gian tối đa chờ kiểm tra có bản cập nhật mới lúc khởi động (ms). */
const UPDATE_CHECK_TIMEOUT_MS = 6000

/**
 * Tạo cửa sổ splash tối giản hiển thị tiến trình tải bản cập nhật.
 * Chỉ mở khi đã xác nhận có phiên bản mới để tránh nhấp nháy màn hình lúc khởi động bình thường.
 */
function createUpdaterSplash(version: string): BrowserWindow {
    const win = new BrowserWindow({
        width: 440,
        height: 200,
        frame: false,
        resizable: false,
        movable: false,
        alwaysOnTop: true,
        backgroundColor: '#0d0d0d',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    })

    const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<style>
  body {
    margin: 0; height: 100vh; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 14px;
    background: #0d0d0d; color: #f5f2eb; font-family: "Segoe UI", sans-serif;
    border: 1px solid #2a2a2a; box-sizing: border-box; padding: 24px;
    user-select: none;
  }
  .title { font-size: 16px; font-weight: 600; letter-spacing: 0.3px; }
  .status { font-size: 13px; color: #b8b2a6; }
  .bar-wrap { width: 100%; height: 6px; background: #262626; border-radius: 999px; overflow: hidden; }
  .bar { width: 0%; height: 100%; background: #d4af37; transition: width 0.2s ease; }
</style>
</head>
<body>
  <div class="title">Fotolism — Cập nhật phiên bản ${version}</div>
  <div class="status" id="status">Đang tải bản cập nhật...</div>
  <div class="bar-wrap"><div class="bar" id="bar"></div></div>
</body>
</html>`

    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(
        () => {}
    )
    return win
}

/**
 * Kiểm tra và tự động cài đặt bản cập nhật từ GitHub Releases ngay khi khởi động app.
 *
 * @param onBeforeInstall Callback dừng các tiến trình con (Canon Daemon, AI Service) trước khi cài đè.
 * @returns true nếu đang tiến hành cài đặt & khởi động lại app; false nếu tiếp tục mở Kiosk bình thường.
 */
export async function checkAndInstallStartupUpdate(
    onBeforeInstall: () => void
): Promise<boolean> {
    if (
        !app.isPackaged ||
        process.env.NODE_ENV === 'development' ||
        process.env.DISABLE_AUTO_UPDATE === 'true'
    ) {
        return false
    }

    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.allowPrerelease = false

    return new Promise<boolean>((resolve) => {
        let settled = false
        let updateFound = false
        let splashWin: BrowserWindow | null = null

        const cleanup = () => {
            clearTimeout(checkTimer)
            autoUpdater.removeListener('update-available', onUpdateAvailable)
            autoUpdater.removeListener(
                'update-not-available',
                onUpdateNotAvailable
            )
            autoUpdater.removeListener('download-progress', onDownloadProgress)
            autoUpdater.removeListener('update-downloaded', onUpdateDownloaded)
            autoUpdater.removeListener('error', onError)
            if (splashWin && !splashWin.isDestroyed()) {
                splashWin.close()
                splashWin = null
            }
        }

        const finish = (installing: boolean) => {
            if (settled) return
            settled = true
            cleanup()
            resolve(installing)
        }

        const onUpdateAvailable = (info: { version: string }) => {
            updateFound = true
            clearTimeout(checkTimer)
            console.log(
                `[AutoUpdater] Tìm thấy phiên bản mới ${info.version}, bắt đầu tải...`
            )
            splashWin = createUpdaterSplash(info.version)
        }

        const onUpdateNotAvailable = () => {
            console.log('[AutoUpdater] Đang ở phiên bản mới nhất.')
            finish(false)
        }

        const onDownloadProgress = (progress: { percent: number }) => {
            const pct = Math.max(0, Math.min(100, Math.round(progress.percent)))
            if (splashWin && !splashWin.isDestroyed()) {
                splashWin.webContents
                    .executeJavaScript(
                        `document.getElementById('bar').style.width='${pct}%';document.getElementById('status').textContent='Đang tải bản cập nhật... ${pct}%';`
                    )
                    .catch(() => {})
            }
        }

        const onUpdateDownloaded = (info: { version: string }) => {
            console.log(
                `[AutoUpdater] Đã tải xong bản ${info.version}, tiến hành cài đặt & khởi động lại...`
            )
            if (splashWin && !splashWin.isDestroyed()) {
                splashWin.webContents
                    .executeJavaScript(
                        `document.getElementById('bar').style.width='100%';document.getElementById('status').textContent='Đang cài đặt và khởi động lại...';`
                    )
                    .catch(() => {})
            }
            try {
                onBeforeInstall()
            } catch (err) {
                console.warn('[AutoUpdater] Lỗi khi dừng tiến trình con:', err)
            }
            finish(true)
            // isSilent=true (cài âm thầm không hiện wizard), isForceRunAfter=true (tự mở lại Kiosk)
            setImmediate(() => {
                autoUpdater.quitAndInstall(true, true)
            })
        }

        const onError = (err: Error) => {
            console.warn(
                '[AutoUpdater] Bỏ qua cập nhật do lỗi (offline hoặc không kết nối được GitHub):',
                err?.message || err
            )
            finish(false)
        }

        // Hết thời gian chờ mà chưa thấy bản mới (mất mạng/chậm) thì vào Kiosk ngay
        const checkTimer = setTimeout(() => {
            if (!updateFound) {
                console.warn(
                    `[AutoUpdater] Quá ${UPDATE_CHECK_TIMEOUT_MS}ms kiểm tra cập nhật, tiếp tục khởi động Kiosk.`
                )
                finish(false)
            }
        }, UPDATE_CHECK_TIMEOUT_MS)

        autoUpdater.on('update-available', onUpdateAvailable)
        autoUpdater.on('update-not-available', onUpdateNotAvailable)
        autoUpdater.on('download-progress', onDownloadProgress)
        autoUpdater.on('update-downloaded', onUpdateDownloaded)
        autoUpdater.on('error', onError)

        autoUpdater.checkForUpdates().catch(onError)
    })
}
