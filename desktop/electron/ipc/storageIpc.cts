/**
 * @file storageIpc.cts
 * Quản lý lưu trữ tệp cục bộ (RAW, AI enhanced, final layout), hàng đợi đồng bộ Cloudflare R2 Outbox,
 * dọn dẹp ổ đĩa định kỳ và chuẩn hóa đường dẫn file trên môi trường Windows Kiosk.
 * Phụ thuộc: electron (app, ipcMain, shell, BrowserWindow), Node.js (path, fs), common.cts, SessionDB, r2UploadWorker, enhanceIntegrity.
 */

import { app, ipcMain, shell, BrowserWindow, nativeImage } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { getFotolismDir, SAVE_FOLDER_NAME, STORAGE_DRIVE_CANDIDATES } from './common.cjs'
import { SessionDB, type UploadTaskRecord } from '../sessionDatabase.cjs'
import { r2UploadWorker, type UploadProgressEvent } from '../r2UploadWorker.cjs'
import { assertEnhancedFile, enhancedFinalPath, rawSessionPath } from '../enhanceIntegrity.cjs'

/**
 * Tạo ảnh thumbnail nhẹ (~480px, ~35KB) để Gallery tải nhanh tức thì mà không ảnh hưởng ảnh gốc.
 */
function ensureLocalThumbnail(
    originalPath: string,
    sessionId: string,
    preferredFileName?: string
): { filePath: string; fileName: string } | null {
    try {
        if (!originalPath || !fs.existsSync(originalPath)) return null
        const baseDir = getFotolismDir()
        const localFolderName = sessionId.startsWith('session_')
            ? sessionId
            : `session_${sessionId}`
        const thumbDir = path.join(baseDir, 'sessions', localFolderName, 'thumbnails')
        if (!fs.existsSync(thumbDir)) {
            fs.mkdirSync(thumbDir, { recursive: true })
        }

        const rawName = preferredFileName || path.basename(originalPath)
        const baseName = rawName.replace(/\.[^.]+$/, '')
        const thumbFileName = `${baseName}.jpg`
        const thumbPath = path.join(thumbDir, thumbFileName)

        if (fs.existsSync(thumbPath) && fs.statSync(thumbPath).size > 0) {
            return { filePath: thumbPath, fileName: thumbFileName }
        }

        const img = nativeImage.createFromPath(originalPath)
        if (img.isEmpty()) return null
        const size = img.getSize()
        const resized = size.width > 480 ? img.resize({ width: 480 }) : img
        const jpegBuffer = resized.toJPEG(80)
        if (!jpegBuffer || jpegBuffer.length === 0) return null

        fs.writeFileSync(thumbPath, jpegBuffer)
        return { filePath: thumbPath, fileName: thumbFileName }
    } catch (err) {
        console.warn('[Storage IPC] Create thumbnail warning:', err)
        return null
    }
}

/**
 * Tự động dọn dẹp các tệp in ấn tạm thời (temp) và các thư mục phiên chụp cũ hơn số ngày lưu trữ chỉ định.
 * Đảm bảo ổ cứng Kiosk không bị đầy khi vận hành liên tục tại cửa hàng.
 *
 * @param retentionDays Số ngày lưu trữ tối đa của ảnh phiên chụp trên đĩa cục bộ (mặc định 15 ngày).
 */
export function cleanupDiskStorage(retentionDays = 15): void {
    try {
        const tempDir = app.getPath('temp')
        const now = Date.now()

        if (fs.existsSync(tempDir)) {
            const files = fs.readdirSync(tempDir)
            for (const file of files) {
                if (
                    file.startsWith('fotolism_print_') ||
                    file.startsWith('print_job_') ||
                    file.startsWith('print_page_')
                ) {
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
                console.log(
                    `[Storage Retention] Đã tự động dọn dẹp ${cleanedCount} thư mục phiên chụp cũ hơn ${retentionDays} ngày.`
                )
            }
        }
    } catch (err) {
        console.warn(
            '[Storage Retention] Lỗi trong quá trình dọn dẹp ổ đĩa:',
            err
        )
    }
}

/**
 * Chuẩn hóa chuỗi đường dẫn URI (file:///) về đường dẫn tệp Windows hợp lệ.
 *
 * @param p Chuỗi đường dẫn hoặc file URL từ frontend.
 * @returns Đường dẫn tệp cục bộ đã chuẩn hóa.
 */
export function cleanFilePath(p?: string): string {
    if (!p) return ''
    let cleaned = p.trim()
    if (cleaned.startsWith('file:///')) {
        cleaned = cleaned.slice(8)
    } else if (cleaned.startsWith('file://')) {
        cleaned = cleaned.slice(7)
    }
    if (/^\/[a-zA-Z]:/.test(cleaned)) {
        cleaned = cleaned.slice(1)
    }
    return path.normalize(decodeURIComponent(cleaned))
}

/**
 * Kiểm tra đường dẫn có nằm trong thư mục lưu trữ ảnh Kiosk hợp lệ hay không.
 */
function isWithinKioskStorage(targetAbs: string): boolean {
    const normalizedTarget = path.resolve(targetAbs).toLowerCase()
    const allowedRoots = [
        path.resolve(getFotolismDir()).toLowerCase(),
        ...STORAGE_DRIVE_CANDIDATES.map((d) =>
            path.resolve(path.join(d, SAVE_FOLDER_NAME)).toLowerCase()
        ),
    ]
    return allowedRoots.some(
        (root) => normalizedTarget === root || normalizedTarget.startsWith(`${root}${path.sep}`)
    )
}

interface PrefetchedR2Url {
    putUrl: string
    objectKey: string
    expiresAt: number
}

const selfboothPrefetchedUrls = new Map<string, Map<string, PrefetchedR2Url>>()

/**
 * Đăng ký các kênh IPC lưu trữ (lưu ảnh chụp, lưu khung hoàn thiện, tạo session R2 outbox, mở thư mục).
 */
export function registerStorageIpc(): void {
    ipcMain.handle('storage:get-downloads-path', async () => {
        try {
            const dir = getFotolismDir()
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
            return {
                success: true,
                data: { path: dir, baseDownloads: app.getPath('downloads') },
            }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    })

    ipcMain.handle(
        'storage:save-photo',
        async (_event, payload: { dataUrl: string; fileName: string }) => {
            try {
                const dir = getFotolismDir()
                const cleanedName = cleanFilePath(payload.fileName) || payload.fileName
                const targetFile = path.isAbsolute(cleanedName)
                    ? cleanedName
                    : path.join(dir, cleanedName)
                const targetDir = path.dirname(targetFile)
                if (!fs.existsSync(targetDir))
                    fs.mkdirSync(targetDir, { recursive: true })
                const base64Data = (payload.dataUrl || '').replace(
                    /^data:[^;]+;base64,/,
                    ''
                )
                const buffer = Buffer.from(base64Data, 'base64')
                if (buffer.length < 100) {
                    return {
                        success: false,
                        error: 'Dữ liệu ảnh trống hoặc không hợp lệ',
                    }
                }
                const tmpFile = `${targetFile}.tmp.${Date.now()}`
                fs.writeFileSync(tmpFile, buffer)
                fs.renameSync(tmpFile, targetFile)
                if (!fs.existsSync(targetFile) || fs.statSync(targetFile).size < 100) {
                    return {
                        success: false,
                        error: 'Không xác minh được tệp ảnh vừa lưu',
                    }
                }
                return { success: true, data: { savedPath: targetFile } }
            } catch (err: any) {
                return { success: false, error: err.message }
            }
        }
    )

    ipcMain.handle(
        'storage:open-folder',
        async (_event, targetPath?: string) => {
            try {
                const folderToOpen = targetPath || getFotolismDir()
                if (!fs.existsSync(folderToOpen))
                    fs.mkdirSync(folderToOpen, { recursive: true })
                await shell.openPath(folderToOpen)
                return { success: true }
            } catch (err: any) {
                return { success: false, error: err.message }
            }
        }
    )

    // ── FOTOLISM 3.0: CLOUDFLARE R2 UPLOAD WORKER IPC ──

    ipcMain.handle('storage:get-upload-status', async (_event, sessionId?: string) => {
        try {
            const stats = r2UploadWorker.getStats()
            if (sessionId) {
                const tasks = SessionDB.getUploadTasksForSession(sessionId)
                stats.pendingTasks = tasks.filter(t => t.status === 'PENDING' || t.status === 'FAILED_RETRYABLE').length
                stats.uploadingTasks = tasks.filter(t => t.status === 'UPLOADING').length
                stats.activeStreams = stats.uploadingTasks
                stats.failedTasks = tasks.filter(t => t.status === 'FAILED_PERMANENT').length
                stats.uploadedTasks = tasks.filter(t => t.status === 'UPLOADED').length
                stats.totalTasks = tasks.length
                stats.isProcessing = stats.uploadingTasks > 0
            }
            return { success: true, data: stats }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    })

    ipcMain.handle(
        'storage:set-concurrency',
        async (_event, payload: { concurrency: number }) => {
            try {
                r2UploadWorker.setConcurrency(payload.concurrency)
                return {
                    success: true,
                    data: { concurrency: r2UploadWorker.getConcurrency() },
                }
            } catch (err: any) {
                return { success: false, error: err.message }
            }
        }
    )

    ipcMain.handle('storage:retry-failed', async () => {
        try {
            const count = SessionDB.retryFailedUploadTasks()
            r2UploadWorker.triggerProcessing()
            return { success: true, data: { retriedCount: count } }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    })

    async function enqueueR2SessionInternal(payload: {
    sessionId: string
    customerName?: string
    sessionType?: string
    cmsUrl?: string
    files: Array<{
        imageId: string
        filePath: string
        targetFileName?: string
        isFinal?: boolean
        sizeBytes?: number
    }>
}): Promise<{
    success: boolean
    data?: {
        sessionId: string
        folderKey?: string
        enqueuedCount: number
        offlineQueued?: boolean
    }
    error?: string
}> {
    try {
        const {
            sessionId,
            customerName,
            sessionType = 'selfbooth',
            files,
            cmsUrl,
        } = payload
        if (!sessionId || !Array.isArray(files) || files.length === 0) {
            return {
                success: false,
                error: 'Thiếu thông tin session hoặc danh sách file ảnh',
            }
        }
        if (
            sessionType !== 'selfbooth' &&
            sessionId.replace(/^session_/i, '').trim() === '1234'
        ) {
            return {
                success: true,
                data: {
                    sessionId,
                    enqueuedCount: 0,
                    offlineQueued: true,
                },
            }
        }

        if (cmsUrl) {
            r2UploadWorker.setCmsUrl(cmsUrl)
        }

        // 1. Kiểm tra, tự sinh thumbnail nhẹ cho ảnh gốc và chuẩn bị danh sách files
        const filesPayload: Array<{
            fileName: string
            type: 'original' | 'final' | 'thumbnail'
            sizeBytes: number
            contentType: string
        }> = []

        const normalizedValid = files
            .map((f) => ({
                ...f,
                filePath: cleanFilePath(f.filePath),
                isThumbnail: f.imageId.endsWith('_thumb'),
            }))
            .filter((f) => f.filePath && fs.existsSync(f.filePath))

        // Tra cứu sẵn các task đã UPLOADED/UPLOADING của phiên để không xin lại URL và không đẩy trùng lần 2
        const existingTasksById = new Map<string, UploadTaskRecord>()
        try {
            for (const t of SessionDB.getUploadTasksForSession(sessionId)) {
                existingTasksById.set(t.id, t)
            }
        } catch {}
        const prefetchedMap = selfboothPrefetchedUrls.get(sessionId)

        const validFiles: Array<{
            imageId: string
            filePath: string
            targetName: string
            isFinal?: boolean
            isThumbnail?: boolean
            uploadType: 'original' | 'final' | 'thumbnail'
        }> = []
        const seenTaskIds = new Set<string>()
        const urlMap = new Map<
            string,
            { putUrl: string; objectKey: string; expiresInSec: number }
        >()

        for (const file of normalizedValid) {
            const uploadType: 'original' | 'final' | 'thumbnail' = file.isThumbnail
                ? 'thumbnail'
                : file.isFinal
                  ? 'final'
                  : 'original'
            const targetName =
                file.targetFileName || path.basename(file.filePath)
            const mainTaskId = `task_${sessionId}_${file.imageId}`
            const existingMain = existingTasksById.get(mainTaskId)

            if (!seenTaskIds.has(file.imageId)) {
                seenTaskIds.add(file.imageId)
                // Bỏ qua nếu ảnh này đã được đẩy xong hoặc đang đẩy lên R2 trong lúc chụp (tránh nhân đôi ảnh Selfbooth)
                const alreadyHandled =
                    existingMain &&
                    (existingMain.status === 'UPLOADED' ||
                        existingMain.status === 'UPLOADING')
                if (!alreadyHandled) {
                    const stat = fs.statSync(file.filePath)
                    validFiles.push({ ...file, targetName, uploadType })
                    const prefetched =
                        prefetchedMap?.get(`${uploadType}:${targetName}`) ||
                        prefetchedMap?.get(targetName)
                    if (
                        prefetched &&
                        prefetched.expiresAt > Date.now() + 30000
                    ) {
                        urlMap.set(`${uploadType}:${targetName}`, {
                            putUrl: prefetched.putUrl,
                            objectKey: prefetched.objectKey,
                            expiresInSec: Math.max(
                                60,
                                Math.floor(
                                    (prefetched.expiresAt - Date.now()) / 1000
                                )
                            ),
                        })
                    } else {
                        filesPayload.push({
                            fileName: targetName,
                            type: uploadType,
                            sizeBytes: stat.size,
                            contentType: targetName
                                .toLowerCase()
                                .endsWith('.webp')
                                ? 'image/webp'
                                : 'image/jpeg',
                        })
                    }
                }
            }

            if (uploadType === 'original') {
                const thumbId = `${file.imageId}_thumb`
                const thumbTaskId = `task_${sessionId}_${thumbId}`
                const existingThumb = existingTasksById.get(thumbTaskId)
                const thumbAlreadyHandled =
                    existingThumb &&
                    (existingThumb.status === 'UPLOADED' ||
                        existingThumb.status === 'UPLOADING')

                if (!seenTaskIds.has(thumbId) && !thumbAlreadyHandled) {
                    const thumb = ensureLocalThumbnail(
                        file.filePath,
                        sessionId,
                        targetName
                    )
                    if (thumb) {
                        seenTaskIds.add(thumbId)
                        const thumbStat = fs.statSync(thumb.filePath)
                        validFiles.push({
                            imageId: thumbId,
                            filePath: thumb.filePath,
                            targetName: thumb.fileName,
                            isFinal: false,
                            isThumbnail: true,
                            uploadType: 'thumbnail',
                        })
                        const prefetchedThumb = prefetchedMap?.get(
                            `thumbnail:${thumb.fileName}`
                        )
                        if (
                            prefetchedThumb &&
                            prefetchedThumb.expiresAt > Date.now() + 30000
                        ) {
                            urlMap.set(`thumbnail:${thumb.fileName}`, {
                                putUrl: prefetchedThumb.putUrl,
                                objectKey: prefetchedThumb.objectKey,
                                expiresInSec: Math.max(
                                    60,
                                    Math.floor(
                                        (prefetchedThumb.expiresAt -
                                            Date.now()) /
                                            1000
                                    )
                                ),
                            })
                        } else {
                            filesPayload.push({
                                fileName: thumb.fileName,
                                type: 'thumbnail',
                                sizeBytes: thumbStat.size,
                                contentType: 'image/jpeg',
                            })
                        }
                    }
                }
            }
        }

        if (validFiles.length === 0) {
            r2UploadWorker.triggerProcessing()
            return {
                success: true,
                data: {
                    sessionId,
                    enqueuedCount: 0,
                    offlineQueued: false,
                },
            }
        }

        let existingSession = SessionDB.getSession(sessionId)
        if (!existingSession) {
            try {
                existingSession = SessionDB.createSession({
                    id: sessionId,
                    status: 'ACTIVE',
                    started_at: new Date().toISOString(),
                    total_slots: validFiles.length,
                    payment_status: 'PAID',
                    print_copies: 1,
                })
            } catch {
                existingSession = SessionDB.getSession(sessionId)
            }
        }
        const sessionDate = existingSession?.started_at || new Date().toISOString()

        // 2. Chia batch tối đa 50 file/lượt xin Presigned PUT URLs (chỉ cho những file chưa có URL pre-fetch)
        const effectiveCms = cmsUrl || r2UploadWorker.getCmsUrl()
        let cmsFolderKey: string | undefined
        const URL_BATCH_SIZE = 50
        for (let i = 0; i < filesPayload.length; i += URL_BATCH_SIZE) {
            const batchFiles = filesPayload.slice(i, i + URL_BATCH_SIZE)
            try {
                const cmsRes = await fetch(`${effectiveCms}/api/storage/upload-urls`, {
                    method: 'POST',
                    signal: AbortSignal.timeout(15000),
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId,
                        customerName,
                        sessionType,
                        date: sessionDate,
                        files: batchFiles,
                    }),
                })

                if (cmsRes.ok) {
                    const cmsData: any = await cmsRes.json()
                    if (cmsData?.success && Array.isArray(cmsData.urls)) {
                        cmsFolderKey = cmsFolderKey || cmsData.folderKey
                        for (const u of cmsData.urls) {
                            urlMap.set(`${u.type}:${u.fileName}`, {
                                putUrl: u.putUrl,
                                objectKey: u.objectKey,
                                expiresInSec: u.expiresInSec || 900,
                            })
                        }
                    } else {
                        console.warn(
                            '[Storage IPC] CMS upload-urls returned invalid payload, falling back to offline queue:',
                            cmsData?.error
                        )
                    }
                } else {
                    const errText = await cmsRes.text().catch(() => '')
                    console.warn(
                        `[Storage IPC] CMS upload-urls HTTP ${cmsRes.status}, falling back to offline queue:`,
                        errText
                    )
                }
            } catch (cmsErr: any) {
                console.warn(
                    '[Storage IPC] Cannot reach CMS upload-urls, queuing offline in SQLite:',
                    cmsErr?.message || cmsErr
                )
            }
        }

        // 3. Luôn đưa vào SQLite UploadTasks Outbox Queue trước khi trả về (idempotent theo sessionId + imageId)
        const tasksToInsert: Array<
            Omit<UploadTaskRecord, 'created_at' | 'updated_at'>
        > = []
        for (const file of validFiles) {
            const fileName = file.targetName
            const urlInfo =
                urlMap.get(`${file.uploadType}:${fileName}`) ||
                urlMap.get(fileName)
            const stat = fs.statSync(file.filePath)

            tasksToInsert.push({
                id: `task_${sessionId}_${file.imageId}`,
                session_id: sessionId,
                image_id: file.imageId,
                file_path: file.filePath,
                object_key:
                    urlInfo?.objectKey ||
                    `fotolism-photos/${sessionId}/${file.isThumbnail ? 'thumbnails/' : ''}${fileName}`,
                size_bytes: stat.size,
                is_final: file.isFinal ? 1 : 0,
                status: 'PENDING',
                attempts: 0,
                presigned_url: urlInfo?.putUrl,
                url_expires_at: urlInfo
                    ? Date.now() + urlInfo.expiresInSec * 1000
                    : undefined,
            })
        }

        SessionDB.enqueueBatchUploadTasks(tasksToInsert)

        // 4. Khởi động worker xử lý nền ngay lập tức
        r2UploadWorker.triggerProcessing()

        return {
            success: true,
            data: {
                sessionId,
                folderKey: cmsFolderKey,
                enqueuedCount: tasksToInsert.length,
                offlineQueued: urlMap.size === 0,
            },
        }
    } catch (err: any) {
        console.error('[Storage IPC] Enqueue R2 session failed:', err)
        return { success: false, error: err.message }
    }
}

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
        ) => enqueueR2SessionInternal(payload)
    )

    // Đọc file ảnh cục bộ sang Data URL để Renderer vẽ Canvas không bị tainted bởi file://
    ipcMain.handle(
        'storage:read-image-data-url',
        async (_event, filePath: string) => {
            try {
                const resolved = cleanFilePath(filePath)
                if (!resolved || !fs.existsSync(resolved)) {
                    return {
                        success: false,
                        error: 'Không tìm thấy tệp ảnh cục bộ',
                    }
                }
                const ext = path.extname(resolved).toLowerCase()
                const mime =
                    ext === '.png'
                        ? 'image/png'
                        : ext === '.webp'
                          ? 'image/webp'
                          : 'image/jpeg'
                const base64 = fs.readFileSync(resolved).toString('base64')
                return {
                    success: true,
                    data: `data:${mime};base64,${base64}`,
                }
            } catch (err: any) {
                return { success: false, error: err.message }
            }
        }
    )

    // Xóa thẳng tệp ảnh cục bộ trong thư mục Fotolism khi người dùng xóa ô ảnh trên màn hình chụp
    ipcMain.handle(
        'storage:delete-file',
        async (_event, filePath: string) => {
            try {
                const resolved = cleanFilePath(filePath)
                if (!resolved) return { success: false, error: 'Đường dẫn không hợp lệ' }
                const targetAbs = path.resolve(resolved)
                if (!isWithinKioskStorage(targetAbs)) {
                    return { success: false, error: 'Từ chối xóa tệp ngoài thư mục Kiosk' }
                }
                if (fs.existsSync(targetAbs)) {
                    fs.unlinkSync(targetAbs)
                }
                return { success: true }
            } catch (err: any) {
                return { success: false, error: err.message }
            }
        }
    )

    // Xác minh tệp ảnh cục bộ tồn tại thật và có dung lượng hợp lệ (> 1KB)
    ipcMain.handle(
        'storage:verify-file',
        async (_event, filePath: string) => {
            try {
                const resolved = cleanFilePath(filePath)
                if (!resolved || !fs.existsSync(resolved)) {
                    return {
                        success: true,
                        data: { exists: false, sizeBytes: 0, resolvedPath: resolved },
                    }
                }
                const stat = fs.statSync(resolved)
                return {
                    success: true,
                    data: {
                        exists: stat.isFile() && stat.size > 1000,
                        sizeBytes: stat.size,
                        resolvedPath: resolved,
                    },
                }
            } catch (err: any) {
                return { success: false, error: err.message }
            }
        }
    )

    // Sao chép tệp ảnh cục bộ theo cơ chế atomic (.tmp -> rename) trong phạm vi thư mục Kiosk
    ipcMain.handle(
        'storage:copy-file',
        async (_event, payload: { srcPath: string; destPath: string }) => {
            let tmpPath = ''
            try {
                const srcResolved = cleanFilePath(payload?.srcPath)
                const destResolved = cleanFilePath(payload?.destPath)
                if (!srcResolved || !destResolved) {
                    return { success: false, error: 'Đường dẫn nguồn hoặc đích không hợp lệ' }
                }
                const srcAbs = path.resolve(srcResolved)
                const destAbs = path.resolve(destResolved)
                if (!isWithinKioskStorage(srcAbs) || !isWithinKioskStorage(destAbs)) {
                    return { success: false, error: 'Từ chối sao chép ngoài thư mục Kiosk' }
                }
                if (!fs.existsSync(srcAbs) || fs.statSync(srcAbs).size <= 1000) {
                    return { success: false, error: 'Tệp nguồn không tồn tại hoặc bị hỏng' }
                }
                const destDir = path.dirname(destAbs)
                if (!fs.existsSync(destDir)) {
                    fs.mkdirSync(destDir, { recursive: true })
                }
                tmpPath = `${destAbs}.copy.${Date.now()}.tmp`
                fs.copyFileSync(srcAbs, tmpPath)
                fs.renameSync(tmpPath, destAbs)
                tmpPath = ''
                const stat = fs.statSync(destAbs)
                if (!stat.isFile() || stat.size <= 1000) {
                    return { success: false, error: 'Tệp sao chép không hợp lệ' }
                }
                return {
                    success: true,
                    data: { savedPath: destAbs, sizeBytes: stat.size },
                }
            } catch (err: any) {
                if (tmpPath && fs.existsSync(tmpPath)) {
                    try { fs.unlinkSync(tmpPath) } catch {}
                }
                return { success: false, error: err.message }
            }
        }
    )

    // Chép ảnh backup có logo Fotolism tương ứng 3 loại khung vào thư mục session theo cơ chế atomic
    ipcMain.handle(
        'storage:save-backup-slot',
        async (
            _event,
            payload: {
                variant: '2x6_4' | '4x6_4' | '4x6_9'
                destPath: string
            }
        ) => {
            let tmpPath = ''
            try {
                const fileName = `backup_${payload?.variant || '4x6_4'}.jpg`
                const srcCandidates = [
                    path.join(app.getAppPath(), 'dist', 'backup-slots', fileName),
                    path.join(app.getAppPath(), 'public', 'backup-slots', fileName),
                    ...(process.resourcesPath
                        ? [path.join(process.resourcesPath, 'backup-slots', fileName)]
                        : []),
                    path.join(__dirname, '../../dist/backup-slots', fileName),
                    path.join(__dirname, '../../public/backup-slots', fileName),
                ]
                const srcFile = srcCandidates.find((p) => p && fs.existsSync(p))
                if (!srcFile) {
                    return {
                        success: false,
                        error: `Không tìm thấy ảnh backup ${fileName}`,
                    }
                }
                const destResolved = cleanFilePath(payload?.destPath)
                if (!destResolved) {
                    return { success: false, error: 'Đường dẫn đích backup không hợp lệ' }
                }
                const destAbs = path.resolve(destResolved)
                if (!isWithinKioskStorage(destAbs)) {
                    return { success: false, error: 'Từ chối lưu backup ngoài thư mục Kiosk' }
                }
                const bytes = fs.readFileSync(srcFile)
                if (bytes.length <= 1000) {
                    return { success: false, error: 'Tệp ảnh backup bị hỏng hoặc rỗng' }
                }
                const destDir = path.dirname(destAbs)
                if (!fs.existsSync(destDir)) {
                    fs.mkdirSync(destDir, { recursive: true })
                }
                tmpPath = `${destAbs}.bak.${Date.now()}.tmp`
                fs.writeFileSync(tmpPath, bytes)
                fs.renameSync(tmpPath, destAbs)
                tmpPath = ''
                return {
                    success: true,
                    data: { savedPath: destAbs, sizeBytes: bytes.length },
                }
            } catch (err: any) {
                if (tmpPath && fs.existsSync(tmpPath)) {
                    try { fs.unlinkSync(tmpPath) } catch {}
                }
                return { success: false, error: err.message }
            }
        }
    )

    // Pre-fetch trước tối đa 50 Presigned PUT URLs đầu phiên Selfbooth (1 request duy nhất tới CMS)
    ipcMain.handle(
        'storage:prefetch-selfbooth-urls',
        async (
            _event,
            payload: {
                sessionId: string
                customerName?: string
                cmsUrl?: string
                startIndex?: number
                count?: number
            }
        ) => {
            try {
                const {
                    sessionId,
                    customerName,
                    cmsUrl,
                    startIndex = 1,
                    count = 50,
                } = payload
                if (!sessionId) {
                    return { success: false, error: 'Thiếu sessionId' }
                }
                if (cmsUrl) {
                    r2UploadWorker.setCmsUrl(cmsUrl)
                }

                let existingSession = SessionDB.getSession(sessionId)
                if (!existingSession) {
                    try {
                        existingSession = SessionDB.createSession({
                            id: sessionId,
                            status: 'ACTIVE',
                            started_at: new Date().toISOString(),
                            total_slots: count,
                            payment_status: 'PAID',
                            print_copies: 0,
                        })
                    } catch {
                        existingSession = SessionDB.getSession(sessionId)
                    }
                }
                const sessionDate =
                    existingSession?.started_at || new Date().toISOString()

                const safeCount = Math.max(1, Math.min(50, count))
                const filesPayload: Array<{
                    fileName: string
                    type: 'original' | 'thumbnail'
                    contentType?: string
                }> = []
                for (let i = startIndex; i < startIndex + safeCount; i++) {
                    filesPayload.push({
                        fileName: `fotolism_enhanced_self_${i}.jpg`,
                        type: 'original',
                        contentType: 'image/jpeg',
                    })
                    filesPayload.push({
                        fileName: `fotolism_enhanced_self_${i}.jpg`,
                        type: 'thumbnail',
                        contentType: 'image/jpeg',
                    })
                }

                const effectiveCms = cmsUrl || r2UploadWorker.getCmsUrl()
                const cmsRes = await fetch(
                    `${effectiveCms}/api/storage/upload-urls`,
                    {
                        method: 'POST',
                        signal: AbortSignal.timeout(15000),
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            sessionId,
                            customerName,
                            sessionType: 'selfbooth',
                            date: sessionDate,
                            files: filesPayload,
                        }),
                    }
                )

                if (!cmsRes.ok) {
                    const errText = await cmsRes.text().catch(() => '')
                    return {
                        success: false,
                        error: `CMS HTTP ${cmsRes.status}: ${errText}`,
                    }
                }

                const cmsData: any = await cmsRes.json()
                if (!cmsData?.success || !Array.isArray(cmsData.urls)) {
                    return {
                        success: false,
                        error: cmsData?.error || 'Payload upload-urls không hợp lệ',
                    }
                }

                let sessionMap = selfboothPrefetchedUrls.get(sessionId)
                if (!sessionMap) {
                    sessionMap = new Map<string, PrefetchedR2Url>()
                    selfboothPrefetchedUrls.set(sessionId, sessionMap)
                }
                const now = Date.now()
                for (const u of cmsData.urls) {
                    sessionMap.set(`${u.type}:${u.fileName}`, {
                        putUrl: u.putUrl,
                        objectKey: u.objectKey,
                        expiresAt: now + (u.expiresInSec || 900) * 1000,
                    })
                }

                return {
                    success: true,
                    data: {
                        sessionId,
                        folderKey: cmsData.folderKey,
                        prefetchedCount: cmsData.urls.length,
                    },
                }
            } catch (err: any) {
                console.warn(
                    '[Storage IPC] Prefetch selfbooth URLs fallback offline:',
                    err?.message || err
                )
                return { success: false, error: err?.message || String(err) }
            }
        }
    )

    // Đẩy ngay 1 ảnh vào hàng đợi R2 (tận dụng URL đã pre-fetch nếu còn hạn)
    ipcMain.handle(
        'storage:enqueue-r2-single',
        async (
            _event,
            payload: {
                sessionId: string
                customerName?: string
                sessionType?: string
                cmsUrl?: string
                imageId: string
                filePath: string
                targetFileName?: string
                isFinal?: boolean
            }
        ) => {
            try {
                const {
                    sessionId,
                    customerName,
                    sessionType = 'selfbooth',
                    cmsUrl,
                    imageId,
                    filePath,
                    targetFileName,
                    isFinal = false,
                } = payload
                const resolvedPath = cleanFilePath(filePath)
                if (!sessionId || !resolvedPath || !fs.existsSync(resolvedPath)) {
                    return {
                        success: false,
                        error: 'Không tìm thấy tệp ảnh để đưa vào hàng đợi R2',
                    }
                }

                if (cmsUrl) {
                    r2UploadWorker.setCmsUrl(cmsUrl)
                }

                const lookupName = targetFileName || path.basename(resolvedPath)
                const sessionMap = selfboothPrefetchedUrls.get(sessionId)
                const cachedUrl =
                    sessionMap?.get(
                        `${isFinal ? 'final' : 'original'}:${lookupName}`
                    ) || sessionMap?.get(lookupName)

                // Tạo thumbnail nhẹ song song cho ảnh gốc để Gallery hiển thị tức thì
                const thumbInfo = !isFinal
                    ? ensureLocalThumbnail(resolvedPath, sessionId, lookupName)
                    : null
                const cachedThumbUrl = thumbInfo
                    ? sessionMap?.get(`thumbnail:${thumbInfo.fileName}`)
                    : undefined

                // Chỉ dùng URL pre-fetch khi còn hạn tối thiểu 30 giây
                if (cachedUrl && cachedUrl.expiresAt > Date.now() + 30000) {
                    const stat = fs.statSync(resolvedPath)
                    const tasksToQueue: Array<
                        Omit<UploadTaskRecord, 'created_at' | 'updated_at'>
                    > = [
                        {
                            id: `task_${sessionId}_${imageId}`,
                            session_id: sessionId,
                            image_id: imageId,
                            file_path: resolvedPath,
                            object_key: cachedUrl.objectKey,
                            size_bytes: stat.size,
                            is_final: isFinal ? 1 : 0,
                            status: 'PENDING',
                            attempts: 0,
                            presigned_url: cachedUrl.putUrl,
                            url_expires_at: cachedUrl.expiresAt,
                        },
                    ]

                    if (thumbInfo) {
                        const thumbStat = fs.statSync(thumbInfo.filePath)
                        const thumbObjectKey =
                            cachedThumbUrl?.objectKey ||
                            cachedUrl.objectKey.replace(
                                /\/originals\/([^/]+)$/,
                                `/thumbnails/${thumbInfo.fileName}`
                            )
                        tasksToQueue.push({
                            id: `task_${sessionId}_${imageId}_thumb`,
                            session_id: sessionId,
                            image_id: `${imageId}_thumb`,
                            file_path: thumbInfo.filePath,
                            object_key: thumbObjectKey,
                            size_bytes: thumbStat.size,
                            is_final: 0,
                            status: 'PENDING',
                            attempts: 0,
                            presigned_url:
                                cachedThumbUrl &&
                                cachedThumbUrl.expiresAt > Date.now() + 30000
                                    ? cachedThumbUrl.putUrl
                                    : undefined,
                            url_expires_at: cachedThumbUrl?.expiresAt,
                        })
                    }

                    SessionDB.enqueueBatchUploadTasks(tasksToQueue)
                    r2UploadWorker.triggerProcessing()
                    return {
                        success: true,
                        data: {
                            sessionId,
                            enqueuedCount: tasksToQueue.length,
                            usedPrefetch: true,
                        },
                    }
                }

                // Fallback khi chưa prefetch / hết hạn / offline
                return enqueueR2SessionInternal({
                    sessionId,
                    customerName,
                    sessionType,
                    cmsUrl,
                    files: [
                        {
                            imageId,
                            filePath: resolvedPath,
                            isFinal,
                        },
                    ],
                })
            } catch (err: any) {
                return { success: false, error: err?.message || String(err) }
            }
        }
    )

    ipcMain.handle(
        'storage:finalize-session-media',
        async (
            _event,
            payload: {
                sessionId: string
                customerName?: string
                sessionType?: string
                cmsUrl?: string
                skipCloudUpload?: boolean
                compositeDataUrl?: string
                compositeFileName: string // e.g. fotolism_final_4x6.jpg
                pairedPrintDataUrl?: string
                pairedPrintFileName?: string // e.g. fotolism_final_2x6_paired_4x6.jpg
                shots: Array<{
                    id: string
                    rawPath?: string
                    enhancedPath?: string
                    dataUrl?: string
                    fileName: string // e.g. fotolism_shot_1.jpg
                }>
            }
        ) => {
            try {
                const {
                    sessionId,
                    customerName,
                    sessionType = 'photobooth',
                    cmsUrl,
                    skipCloudUpload,
                    compositeDataUrl,
                    compositeFileName,
                    pairedPrintDataUrl,
                    pairedPrintFileName,
                    shots,
                } = payload

                const baseDir = getFotolismDir()
                const sessionsDir = path.join(baseDir, 'sessions')
                const localFolderName = sessionId.startsWith('session_')
                    ? sessionId
                    : `session_${sessionId}`
                const sessionDir = path.join(sessionsDir, localFolderName)
                const rawDir = path.join(sessionDir, 'raw')
                const finalDir = path.join(sessionDir, 'final')

                if (!fs.existsSync(rawDir))
                    fs.mkdirSync(rawDir, { recursive: true })
                if (!fs.existsSync(finalDir))
                    fs.mkdirSync(finalDir, { recursive: true })

                const finalFilesToEnqueue: Array<{
                    imageId: string
                    filePath: string
                    targetFileName?: string
                    isFinal: boolean
                }> = []

                // Kiểm tra tính toàn vẹn ảnh AI (lỗi AI không được chặn chụp/in; nếu thiếu AI sẽ fallback dùng ảnh gốc)
                for (const shot of shots || []) {
                    try {
                        assertEnhancedFile(
                            cleanFilePath(shot.rawPath),
                            cleanFilePath(shot.enhancedPath)
                        )
                    } catch (aiCheckErr: any) {
                        console.warn(
                            '[Storage IPC] AI integrity fallback to raw:',
                            aiCheckErr?.message || aiCheckErr
                        )
                    }
                }

                // 1. Lưu các ảnh chụp đơn lẻ vào raw/ và final/
                if (Array.isArray(shots)) {
                    for (let i = 0; i < shots.length; i++) {
                        const s = shots[i]
                        const shotBaseName =
                            s.fileName || `fotolism_shot_${i + 1}.jpg`
                        const enhancedBaseName = shotBaseName.startsWith(
                            'fotolism_shot_'
                        )
                            ? shotBaseName.replace(
                                  'fotolism_shot_',
                                  'fotolism_enhanced_'
                              )
                            : shotBaseName.startsWith('fotolism_self_')
                              ? shotBaseName.replace(
                                    'fotolism_self_',
                                    'fotolism_enhanced_self_'
                                )
                              : `enhanced_${shotBaseName}`
                        const cleanRaw = cleanFilePath(s.rawPath)
                        const cleanEnh = cleanFilePath(s.enhancedPath)
                        const hasRawFile = Boolean(cleanRaw && fs.existsSync(cleanRaw))
                        const rawTarget = hasRawFile
                            ? rawSessionPath(cleanRaw, rawDir, shotBaseName)
                            : path.join(rawDir, shotBaseName)
                        const hasEnhFile = Boolean(cleanEnh && fs.existsSync(cleanEnh))
                        const finalTarget = hasEnhFile
                            ? enhancedFinalPath(cleanEnh, finalDir, enhancedBaseName)
                            : path.join(finalDir, enhancedBaseName)

                        // Lưu raw file (nếu đã nằm trong thư mục raw/ của session thì giữ nguyên 1 tệp duy nhất)
                        if (hasRawFile) {
                            if (
                                path.resolve(cleanRaw) !==
                                path.resolve(rawTarget)
                            ) {
                                fs.copyFileSync(cleanRaw, rawTarget)
                            }
                        } else if (s.dataUrl && s.dataUrl.startsWith('data:')) {
                            const rawBuf = Buffer.from(
                                s.dataUrl.replace(/^data:[^;]+;base64,/, ''),
                                'base64'
                            )
                            fs.writeFileSync(rawTarget, rawBuf)
                        }

                        // Lưu final file (ưu tiên ảnh AI enhance, fallback sang ảnh gốc nếu AI gặp sự cố)
                        if (hasEnhFile) {
                            if (
                                path.resolve(cleanEnh) !==
                                path.resolve(finalTarget)
                            ) {
                                fs.copyFileSync(cleanEnh, finalTarget)
                            }
                        } else if (fs.existsSync(rawTarget)) {
                            fs.copyFileSync(rawTarget, finalTarget)
                        } else {
                            throw new Error(`Không tìm thấy ảnh gốc hay ảnh AI: ${shotBaseName}`)
                        }

                        if (!fs.existsSync(finalTarget)) {
                            throw new Error(`Ảnh chưa lưu đầy đủ: ${shotBaseName}`)
                        }
                        if (fs.existsSync(finalTarget)) {
                            finalFilesToEnqueue.push({
                                imageId: s.id || `shot_${i + 1}`,
                                filePath: finalTarget,
                                targetFileName: enhancedBaseName,
                                isFinal: false,
                            })
                        }
                    }
                }

                // 2. Lưu ảnh hoàn tất sau khi chọn khung dán sticker, bộ lọc (Full resolution, KHÔNG NÉN)
                let finalCompositeTarget: string | null = null
                if (compositeDataUrl) {
                    finalCompositeTarget = path.join(
                        finalDir,
                        compositeFileName || 'fotolism_final.jpg'
                    )
                    if (compositeDataUrl.startsWith('data:')) {
                        const compBuf = Buffer.from(
                            compositeDataUrl.replace(/^data:[^;]+;base64,/, ''),
                            'base64'
                        )
                        fs.writeFileSync(finalCompositeTarget, compBuf)
                    } else {
                        const cleanSrc = cleanFilePath(compositeDataUrl)
                        if (
                            cleanSrc &&
                            fs.existsSync(cleanSrc) &&
                            path.resolve(cleanSrc) !==
                                path.resolve(finalCompositeTarget)
                        ) {
                            fs.copyFileSync(cleanSrc, finalCompositeTarget)
                        }
                    }

                    if (fs.existsSync(finalCompositeTarget)) {
                        finalFilesToEnqueue.push({
                            imageId: 'final_composite',
                            filePath: finalCompositeTarget,
                            isFinal: true,
                        })
                    }
                }

                // 2b. Lưu bản in ghép đôi 4x6 (cho 2x6) hoặc bản in scale chuẩn để kiểm tra in ấn sau này
                let finalPairedTarget: string | null = null
                if (pairedPrintDataUrl) {
                    finalPairedTarget = path.join(
                        finalDir,
                        pairedPrintFileName ||
                            (compositeFileName
                                ? compositeFileName.replace(
                                      '.jpg',
                                      '_paired_4x6.jpg'
                                  )
                                : 'fotolism_final_paired_4x6.jpg')
                    )
                    if (pairedPrintDataUrl.startsWith('data:')) {
                        const pairedBuf = Buffer.from(
                            pairedPrintDataUrl.replace(/^data:[^;]+;base64,/, ''),
                            'base64'
                        )
                        fs.writeFileSync(finalPairedTarget, pairedBuf)
                    } else {
                        const cleanSrc = cleanFilePath(pairedPrintDataUrl)
                        if (
                            cleanSrc &&
                            fs.existsSync(cleanSrc) &&
                            path.resolve(cleanSrc) !==
                                path.resolve(finalPairedTarget)
                        ) {
                            fs.copyFileSync(cleanSrc, finalPairedTarget)
                        }
                    }

                    if (fs.existsSync(finalPairedTarget)) {
                        finalFilesToEnqueue.push({
                            imageId: 'final_paired_print',
                            filePath: finalPairedTarget,
                            isFinal: true,
                        })
                    }
                }

                // 3. Đẩy folder final này lên R2 (bỏ qua nếu là phiên test 1234 của Photobooth; Selfbooth luôn đẩy)
                const isTest1234 =
                    Boolean(skipCloudUpload) ||
                    (sessionType !== 'selfbooth' &&
                        sessionId.replace(/^session_/i, '').trim() === '1234')
                let r2Result = null
                if (isTest1234) {
                    console.log(
                        `[Storage IPC] Phiên test (${sessionId}): đã lưu ảnh local vào ${finalDir}, bỏ qua đẩy lên Cloud R2.`
                    )
                } else if (finalFilesToEnqueue.length > 0) {
                    r2Result = await enqueueR2SessionInternal({
                        sessionId,
                        customerName,
                        sessionType,
                        cmsUrl,
                        files: finalFilesToEnqueue,
                    })
                    if (!r2Result.success) throw new Error(r2Result.error || 'Không thể tạo hàng đợi upload')
                } else {
                    throw new Error('Không có ảnh để upload')
                }

                return {
                    success: true,
                    data: {
                        sessionId,
                        sessionDir,
                        rawDir,
                        finalDir,
                        compositePath: finalCompositeTarget,
                        pairedPrintPath: finalPairedTarget,
                        finalFilesCount: finalFilesToEnqueue.length,
                        r2Result,
                    },
                }
            } catch (err: any) {
                console.error(
                    '[Storage IPC] Finalize session media error:',
                    err
                )
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
