import { app, ipcMain, shell, BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { getFotolismDir } from './common.cjs'
import { SessionDB, type UploadTaskRecord } from '../sessionDatabase.cjs'
import { r2UploadWorker, type UploadProgressEvent } from '../r2UploadWorker.cjs'

export function cleanupDiskStorage(retentionDays = 15): void {
  try {
    const tempDir = app.getPath('temp')
    const now = Date.now()

    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir)
      for (const file of files) {
        if (file.startsWith('fotolism_print_') || file.startsWith('print_job_') || file.startsWith('print_page_')) {
          try {
            const fullPath = path.join(tempDir, file)
            const stats = fs.statSync(fullPath)
            if (now - stats.mtimeMs > 2 * 3600 * 1000) {
              fs.unlinkSync(fullPath)
            }
          } catch {}
        }
      }
    }

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
        } catch {}
      }

      if (cleanedCount > 0) {
        console.log(`[Storage Retention] Đã tự động dọn dẹp ${cleanedCount} thư mục phiên chụp cũ hơn ${retentionDays} ngày.`)
      }
    }
  } catch (err) {
    console.warn('[Storage Retention] Lỗi trong quá trình dọn dẹp ổ đĩa:', err)
  }
}

export function registerStorageIpc(): void {
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
      const targetFile = path.join(dir, payload.fileName)
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
        const localSessionDir = path.join(getFotolismDir(), payload.subfolderName)
        if (!fs.existsSync(localSessionDir)) fs.mkdirSync(localSessionDir, { recursive: true })

        const savedFiles: string[] = []
        for (const item of payload.files) {
          if (!item.dataUrl) continue
          try {
            const targetFilePath = path.join(localSessionDir, item.name)
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

        const effectiveWebhook =
          payload.webhookUrl && payload.webhookUrl.trim().startsWith('http')
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
                    const targetFilePath = path.join(localSessionDir, f.name)
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

            const validFilesForWebhook = filesForWebhook.filter((f) => f.dataUrl && f.dataUrl.startsWith('data:'))
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
      } catch {}

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

  // ── FOTOLISM 3.0: CLOUDFLARE R2 UPLOAD WORKER IPC ──

  ipcMain.handle('storage:get-upload-status', async () => {
    try {
      const stats = r2UploadWorker.getStats()
      return { success: true, data: stats }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('storage:set-concurrency', async (_event, payload: { concurrency: number }) => {
    try {
      r2UploadWorker.setConcurrency(payload.concurrency)
      return { success: true, data: { concurrency: r2UploadWorker.getConcurrency() } }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('storage:retry-failed', async () => {
    try {
      const count = SessionDB.retryFailedUploadTasks()
      r2UploadWorker.triggerProcessing()
      return { success: true, data: { retriedCount: count } }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle(
    'storage:enqueue-r2-session',
    async (
      _event,
      payload: {
        sessionId: string
        customerName?: string
        sessionType?: string
        cmsUrl?: string
        files: Array<{
          imageId: string
          filePath: string
          isFinal?: boolean
          sizeBytes?: number
        }>
      }
    ) => {
      try {
        const { sessionId, customerName, sessionType = 'selfbooth', files, cmsUrl } = payload
        if (!sessionId || !Array.isArray(files) || files.length === 0) {
          return { success: false, error: 'Thiếu thông tin session hoặc danh sách file ảnh' }
        }

        if (cmsUrl) {
          r2UploadWorker.setCmsUrl(cmsUrl)
        }

        // 1. Kiểm tra và chuẩn bị danh sách files
        const filesPayload: Array<{
          fileName: string
          type: 'original' | 'final'
          sizeBytes: number
        }> = []

        const validFiles = files.filter((f) => fs.existsSync(f.filePath))
        for (const file of validFiles) {
          const stat = fs.statSync(file.filePath)
          const fileName = path.basename(file.filePath)
          filesPayload.push({
            fileName,
            type: file.isFinal ? 'final' : 'original',
            sizeBytes: stat.size,
          })
        }

        // 2. Yêu cầu CMS cấp Presigned PUT URLs theo batch
        const effectiveCms = cmsUrl || r2UploadWorker.getCmsUrl()
        const cmsRes = await fetch(`${effectiveCms}/api/storage/upload-urls`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            customerName,
            sessionType,
            files: filesPayload,
          }),
        })

        if (!cmsRes.ok) {
          const errText = await cmsRes.text()
          return {
            success: false,
            error: `CMS từ chối cấp Upload URLs (HTTP ${cmsRes.status}): ${errText}`,
          }
        }

        const cmsData: any = await cmsRes.json()
        if (!cmsData.success || !Array.isArray(cmsData.urls)) {
          return {
            success: false,
            error: cmsData.error || 'CMS không trả về danh sách URLs hợp lệ',
          }
        }

        // 3. Đưa vào SQLite UploadTasks Outbox Queue
        const urlMap = new Map<string, { putUrl: string; objectKey: string; expiresInSec: number }>()
        for (const u of cmsData.urls) {
          urlMap.set(u.fileName, {
            putUrl: u.putUrl,
            objectKey: u.objectKey,
            expiresInSec: u.expiresInSec || 900,
          })
        }

        const tasksToInsert: Array<Omit<UploadTaskRecord, 'created_at' | 'updated_at'>> = []
        for (const file of validFiles) {
          const fileName = path.basename(file.filePath)
          const urlInfo = urlMap.get(fileName)
          const stat = fs.statSync(file.filePath)

          tasksToInsert.push({
            id: `task_${sessionId}_${file.imageId}_${Date.now()}`,
            session_id: sessionId,
            image_id: file.imageId,
            file_path: file.filePath,
            object_key: urlInfo?.objectKey || `fotolism-photos/${sessionId}/${fileName}`,
            size_bytes: stat.size,
            is_final: file.isFinal ? 1 : 0,
            status: 'PENDING',
            attempts: 0,
            presigned_url: urlInfo?.putUrl,
            url_expires_at: urlInfo ? Date.now() + urlInfo.expiresInSec * 1000 : undefined,
          })
        }

        SessionDB.enqueueBatchUploadTasks(tasksToInsert)

        // 4. Khởi động worker xử lý nền ngay lập tức
        r2UploadWorker.triggerProcessing()

        return {
          success: true,
          data: {
            sessionId,
            folderKey: cmsData.folderKey,
            enqueuedCount: tasksToInsert.length,
          },
        }
      } catch (err: any) {
        console.error('[Storage IPC] Enqueue R2 session failed:', err)
        return { success: false, error: err.message }
      }
    }
  )

  // Khởi động Background Upload Worker và chuyển tiếp tiến trình về Renderer
  r2UploadWorker.addListener((progressEvent: UploadProgressEvent) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('storage:upload-progress', progressEvent)
      }
    }
  })
  r2UploadWorker.start()
}
