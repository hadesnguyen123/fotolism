import * as fs from 'node:fs'
import * as http from 'node:http'
import * as https from 'node:https'
import { URL } from 'node:url'
import { SessionDB, type UploadTaskRecord, type UploadTaskStatus } from './sessionDatabase.cjs'

export interface UploadProgressEvent {
  taskId: string
  sessionId: string
  fileName: string
  objectKey: string
  status: UploadTaskStatus
  sizeBytes: number
  uploadedBytes: number
  percent: number
  activeCount: number
  pendingCount: number
}

export interface WorkerStats {
  concurrency: number
  activeStreams: number
  pendingTasks: number
  uploadingTasks: number
  uploadedTasks: number
  failedTasks: number
  isProcessing: boolean
}

type ProgressListener = (event: UploadProgressEvent) => void

export class R2UploadWorker {
  private static instance: R2UploadWorker | null = null
  private concurrency: number = 4
  private cmsUrl: string = 'http://localhost:3000'
  private isRunning: boolean = false
  private activeUploads: Set<string> = new Set()
  private listeners: Set<ProgressListener> = new Set()
  private loopTimer: NodeJS.Timeout | null = null

  private constructor() {
    this.concurrency = 4
  }

  public static getInstance(): R2UploadWorker {
    if (!R2UploadWorker.instance) {
      R2UploadWorker.instance = new R2UploadWorker()
    }
    return R2UploadWorker.instance
  }

  public setConcurrency(concurrency: number): void {
    if ([1, 2, 4, 8].includes(concurrency)) {
      this.concurrency = concurrency
      console.log(`[R2 Upload Worker] Concurrency set to: ${concurrency}`)
      this.triggerProcessing()
    }
  }

  public getConcurrency(): number {
    return this.concurrency
  }

  public setCmsUrl(url: string): void {
    if (url && url.startsWith('http')) {
      this.cmsUrl = url.replace(/\/$/, '')
    }
  }

  public getCmsUrl(): string {
    return this.cmsUrl
  }

  public addListener(listener: ProgressListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notifyListeners(event: UploadProgressEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (err) {
        console.error('[R2 Upload Worker] Listener error:', err)
      }
    }
  }

  public start(): void {
    if (this.isRunning) return
    this.isRunning = true
    console.log(`[R2 Upload Worker] Started with concurrency ${this.concurrency}`)
    this.scheduleNextTick(500)
  }

  public stop(): void {
    this.isRunning = false
    if (this.loopTimer) {
      clearTimeout(this.loopTimer)
      this.loopTimer = null
    }
    console.log('[R2 Upload Worker] Stopped')
  }

  public triggerProcessing(): void {
    if (!this.isRunning) return
    if (this.loopTimer) {
      clearTimeout(this.loopTimer)
      this.loopTimer = null
    }
    setImmediate(() => this.processNextBatch())
  }

  private scheduleNextTick(delayMs = 1500): void {
    if (!this.isRunning) return
    if (this.loopTimer) clearTimeout(this.loopTimer)
    this.loopTimer = setTimeout(() => {
      this.processNextBatch()
    }, delayMs)
  }

  public getStats(): WorkerStats {
    const qStats = SessionDB.getUploadQueueStats()
    return {
      concurrency: this.concurrency,
      activeStreams: this.activeUploads.size,
      pendingTasks: qStats.pending,
      uploadingTasks: qStats.uploading,
      uploadedTasks: qStats.uploaded,
      failedTasks: qStats.failedRetryable + qStats.failedPermanent,
      isProcessing: this.activeUploads.size > 0,
    }
  }

  private async processNextBatch(): Promise<void> {
    if (!this.isRunning) return

    const availableSlots = this.concurrency - this.activeUploads.size
    if (availableSlots <= 0) {
      this.scheduleNextTick(2000)
      return
    }

    const tasks = SessionDB.getPendingUploadTasks(availableSlots)
    if (tasks.length === 0) {
      this.scheduleNextTick(3000)
      return
    }

    for (const task of tasks) {
      if (this.activeUploads.size >= this.concurrency) break
      if (this.activeUploads.has(task.id)) continue

      this.activeUploads.add(task.id)
      SessionDB.updateUploadTaskStatus(task.id, 'UPLOADING')

      // Xử lý upload stream không đồng bộ (không block thread)
      this.executeUpload(task)
        .catch((err) => {
          console.error(`[R2 Upload Worker] Task ${task.id} uncaught error:`, err)
        })
        .finally(() => {
          this.activeUploads.delete(task.id)
          this.triggerProcessing()
        })
    }

    this.scheduleNextTick(1500)
  }

  /**
   * Đọc stream từ ổ đĩa và PUT lên R2 Presigned URL
   * Không nạp toàn bộ 10MB vào RAM
   */
  private async executeUpload(task: UploadTaskRecord): Promise<void> {
    const fileName = task.file_path.split(/[\\/]/).pop() || task.image_id

    // 1. Kiểm tra file trên Local SSD
    if (!fs.existsSync(task.file_path)) {
      const err = `Tệp tin không tồn tại trên ổ đĩa SSD: ${task.file_path}`
      console.error(`[R2 Upload Worker] ${err}`)
      SessionDB.updateUploadTaskStatus(task.id, 'FAILED_PERMANENT', err, true)
      return
    }

    const stat = fs.statSync(task.file_path)
    const sizeBytes = stat.size || task.size_bytes

    // 2. Kiểm tra hoặc yêu cầu Presigned URL mới nếu thiếu hoặc sắp hết hạn
    let putUrl = task.presigned_url
    const now = Date.now()
    const isUrlExpired = !task.url_expires_at || task.url_expires_at <= now + 60 * 1000

    if (!putUrl || isUrlExpired) {
      try {
        putUrl = await this.requestPresignedUrl(task, fileName, sizeBytes)
      } catch (reqErr: any) {
        console.warn(`[R2 Upload Worker] Failed to obtain Presigned URL for ${task.id}:`, reqErr.message)
        const nextAttempts = task.attempts + 1
        const status = nextAttempts >= 5 ? 'FAILED_PERMANENT' : 'FAILED_RETRYABLE'
        SessionDB.updateUploadTaskStatus(task.id, status, `Lỗi xin Presigned URL: ${reqErr.message}`, true)
        return
      }
    }

    // 3. Tiến hành Stream Upload file trực tiếp lên R2
    try {
      this.notifyListeners({
        taskId: task.id,
        sessionId: task.session_id,
        fileName,
        objectKey: task.object_key,
        status: 'UPLOADING',
        sizeBytes,
        uploadedBytes: 0,
        percent: 0,
        activeCount: this.activeUploads.size,
        pendingCount: SessionDB.getUploadQueueStats().pending,
      })

      await this.streamPutFile(task.file_path, putUrl, sizeBytes, (uploadedBytes) => {
        const percent = Math.min(100, Math.round((uploadedBytes / sizeBytes) * 100))
        this.notifyListeners({
          taskId: task.id,
          sessionId: task.session_id,
          fileName,
          objectKey: task.object_key,
          status: 'UPLOADING',
          sizeBytes,
          uploadedBytes,
          percent,
          activeCount: this.activeUploads.size,
          pendingCount: SessionDB.getUploadQueueStats().pending,
        })
      })

      // 4. Xác nhận với CMS server
      await this.confirmUploadWithCms(task, fileName, sizeBytes)

      // 5. Đánh dấu thành công
      SessionDB.updateUploadTaskStatus(task.id, 'UPLOADED')
      console.log(`[R2 Upload Worker] Photo uploaded & confirmed: ${fileName} (${(sizeBytes / 1024 / 1024).toFixed(2)} MB)`)

      this.notifyListeners({
        taskId: task.id,
        sessionId: task.session_id,
        fileName,
        objectKey: task.object_key,
        status: 'UPLOADED',
        sizeBytes,
        uploadedBytes: sizeBytes,
        percent: 100,
        activeCount: Math.max(0, this.activeUploads.size - 1),
        pendingCount: SessionDB.getUploadQueueStats().pending,
      })
    } catch (putErr: any) {
      console.error(`[R2 Upload Worker] PUT failed for ${task.id} (${fileName}):`, putErr.message)
      const nextAttempts = task.attempts + 1
      const status: UploadTaskStatus = nextAttempts >= 5 ? 'FAILED_RETRYABLE' : 'FAILED_RETRYABLE'
      SessionDB.updateUploadTaskStatus(task.id, status, putErr.message, true)

      this.notifyListeners({
        taskId: task.id,
        sessionId: task.session_id,
        fileName,
        objectKey: task.object_key,
        status,
        sizeBytes,
        uploadedBytes: 0,
        percent: 0,
        activeCount: Math.max(0, this.activeUploads.size - 1),
        pendingCount: SessionDB.getUploadQueueStats().pending,
      })
    }
  }

  /**
   * Xin Presigned PUT URL từ CMS API
   */
  private async requestPresignedUrl(
    task: UploadTaskRecord,
    fileName: string,
    sizeBytes: number
  ): Promise<string> {
    const res = await fetch(`${this.cmsUrl}/api/storage/upload-urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: task.session_id,
        files: [
          {
            fileName,
            type: task.is_final ? 'final' : 'original',
            sizeBytes,
            contentType: 'image/jpeg',
          },
        ],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`CMS returned HTTP ${res.status}: ${errText}`)
    }

    const data: any = await res.json()
    if (!data.success || !Array.isArray(data.urls) || data.urls.length === 0) {
      throw new Error(data.error || 'CMS không trả về Presigned URL hợp lệ')
    }

    const item = data.urls[0]
    const expiresAt = Date.now() + (item.expiresInSec || 900) * 1000

    SessionDB.setUploadTaskPresignedUrl(task.id, item.putUrl, expiresAt)
    return item.putUrl
  }

  /**
   * Xác nhận tải lên thành công với CMS
   */
  private async confirmUploadWithCms(
    task: UploadTaskRecord,
    fileName: string,
    sizeBytes: number
  ): Promise<void> {
    const res = await fetch(`${this.cmsUrl}/api/storage/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: task.session_id,
        objectKey: task.object_key,
        fileName,
        type: task.is_final ? 'final' : 'original',
        sizeBytes,
        checksum: task.checksum,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.warn(`[R2 Upload Worker] CMS confirm warning (HTTP ${res.status}):`, errText)
    }
  }

  /**
   * Stream file từ ổ SSD qua HTTP/HTTPS PUT với Header Content-Length & Content-Type
   */
  private streamPutFile(
    filePath: string,
    targetUrl: string,
    fileSize: number,
    onProgress: (bytes: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(targetUrl)
      const isHttps = parsedUrl.protocol === 'https:'
      const transport = isHttps ? https : http

      const req = transport.request(
        parsedUrl,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'image/jpeg',
            'Content-Length': fileSize,
          },
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve()
          } else {
            let body = ''
            res.on('data', (chunk) => (body += chunk))
            res.on('end', () => {
              reject(new Error(`R2 HTTP PUT failed with status ${res.statusCode}: ${body.slice(0, 300)}`))
            })
          }
        }
      )

      req.on('error', (err) => reject(err))

      const fileStream = fs.createReadStream(filePath)
      let sentBytes = 0

      fileStream.on('data', (chunk) => {
        sentBytes += chunk.length
        onProgress(sentBytes)
      })

      fileStream.on('error', (err) => {
        req.destroy(err)
        reject(err)
      })

      fileStream.pipe(req)
    })
  }
}

export const r2UploadWorker = R2UploadWorker.getInstance()

