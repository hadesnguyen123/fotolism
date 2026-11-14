import { app, ipcMain, shell, BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { getFotolismDir } from './common.cjs'
import { SessionDB, type UploadTaskRecord } from '../sessionDatabase.cjs'
import { r2UploadWorker, type UploadProgressEvent } from '../r2UploadWorker.cjs'
import { assertEnhancedFile, enhancedFinalPath } from '../enhanceIntegrity.cjs'

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
                const targetFile = path.isAbsolute(payload.fileName)
                    ? payload.fileName
                    : path.join(dir, payload.fileName)
                const targetDir = path.dirname(targetFile)
                if (!fs.existsSync(targetDir))
                    fs.mkdirSync(targetDir, { recursive: true })
                const base64Data = payload.dataUrl.replace(
                    /^data:[^;]+;base64,/,
                    ''
                )
                const buffer = Buffer.from(base64Data, 'base64')
                fs.writeFileSync(targetFile, buffer)
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
        isFinal?: boolean
        sizeBytes?: number
    }>
}): Promise<{
    success: boolean
    data?: {
        sessionId: string
        folderKey: string
        enqueuedCount: number
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

        if (cmsUrl) {
            r2UploadWorker.setCmsUrl(cmsUrl)
        }

        // 1. Kiểm tra và chuẩn bị danh sách files
        const filesPayload: Array<{
            fileName: string
            type: 'original' | 'final'
            sizeBytes: number
        }> = []

        const validFiles = files
            .map((f) => ({ ...f, filePath: cleanFilePath(f.filePath) }))
            .filter((f) => f.filePath && fs.existsSync(f.filePath))

        for (const file of validFiles) {
            const stat = fs.statSync(file.filePath)
            const fileName = path.basename(file.filePath)
            filesPayload.push({
                fileName,
                type: file.isFinal ? 'final' : 'original',
                sizeBytes: stat.size,
            })
        }

        if (validFiles.length === 0) {
            return {
                success: false,
                error: 'Không tìm thấy file ảnh hợp lệ trên đĩa để tải lên R2',
            }
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
        const urlMap = new Map<
            string,
            { putUrl: string; objectKey: string; expiresInSec: number }
        >()
        for (const u of cmsData.urls) {
            urlMap.set(u.fileName, {
                putUrl: u.putUrl,
                objectKey: u.objectKey,
                expiresInSec: u.expiresInSec || 900,
            })
        }

        const tasksToInsert: Array<
            Omit<UploadTaskRecord, 'created_at' | 'updated_at'>
        > = []
        for (const file of validFiles) {
            const fileName = path.basename(file.filePath)
            const urlInfo = urlMap.get(fileName)
            const stat = fs.statSync(file.filePath)

            tasksToInsert.push({
                id: `task_${sessionId}_${file.imageId}_${Date.now()}`,
                session_id: sessionId,
                image_id: file.imageId,
                file_path: file.filePath,
                object_key:
                    urlInfo?.objectKey ||
                    `fotolism-photos/${sessionId}/${fileName}`,
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

        try {
            SessionDB.createSession({
                id: sessionId,
                status: 'ACTIVE',
                started_at: new Date().toISOString(),
                total_slots: validFiles.length,
                payment_status: 'PAID',
                print_copies: 1,
            })
        } catch {}

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

    ipcMain.handle(
        'storage:finalize-session-media',
        async (
            _event,
            payload: {
                sessionId: string
                customerName?: string
                sessionType?: string
                cmsUrl?: string
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
                    compositeDataUrl,
                    compositeFileName,
                    pairedPrintDataUrl,
                    pairedPrintFileName,
                    shots,
                } = payload

                const baseDir = getFotolismDir()
                const sessionsDir = path.join(baseDir, 'sessions')
                const sessionDir = path.join(sessionsDir, sessionId)
                const rawDir = path.join(sessionDir, 'raw')
                const finalDir = path.join(sessionDir, 'final')

                if (!fs.existsSync(rawDir))
                    fs.mkdirSync(rawDir, { recursive: true })
                if (!fs.existsSync(finalDir))
                    fs.mkdirSync(finalDir, { recursive: true })

                const finalFilesToEnqueue: Array<{
                    imageId: string
                    filePath: string
                    isFinal: boolean
                }> = []

                // Validate every source before writing or enqueueing any final file.
                for (const shot of shots || []) {
                    assertEnhancedFile(cleanFilePath(shot.rawPath), cleanFilePath(shot.enhancedPath))
                }

                // 1. Lưu các ảnh chụp đơn lẻ vào raw/ và final/
                if (Array.isArray(shots)) {
                    for (let i = 0; i < shots.length; i++) {
                        const s = shots[i]
                        const shotBaseName =
                            s.fileName || `fotolism_shot_${i + 1}.jpg`
                        const rawTarget = path.join(rawDir, shotBaseName)
                        const enhancedBaseName = shotBaseName.startsWith(
                            'fotolism_shot_'
                        )
                            ? shotBaseName.replace(
                                  'fotolism_shot_',
                                  'fotolism_enhanced_'
                              )
                            : `enhanced_${shotBaseName}`
                        const cleanRaw = cleanFilePath(s.rawPath)
                        const cleanEnh = cleanFilePath(s.enhancedPath)
                        const finalTarget = enhancedFinalPath(cleanEnh, finalDir, enhancedBaseName)

                        // Lưu raw file
                        if (cleanRaw && fs.existsSync(cleanRaw)) {
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

                        // Lưu final file (ảnh enhance bắt buộc)
                        if (cleanEnh && fs.existsSync(cleanEnh)) {
                            if (
                                path.resolve(cleanEnh) !==
                                path.resolve(finalTarget)
                            ) {
                                fs.copyFileSync(cleanEnh, finalTarget)
                            }
                        } else {
                            throw new Error(`Ảnh AI chưa sẵn sàng: ${shotBaseName}`)
                        }

                        if (!fs.existsSync(rawTarget) || !fs.existsSync(finalTarget)) {
                            throw new Error(`Ảnh chưa lưu đầy đủ: ${shotBaseName}`)
                        }
                        if (fs.existsSync(finalTarget)) {
                            finalFilesToEnqueue.push({
                                imageId: s.id || `shot_${i + 1}`,
                                filePath: finalTarget,
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

                // 3. Đẩy folder final này lên R2
                let r2Result = null
                if (finalFilesToEnqueue.length > 0) {
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
