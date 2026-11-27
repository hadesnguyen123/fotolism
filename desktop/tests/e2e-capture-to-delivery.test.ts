/**
 * @file e2e-capture-to-delivery.test.ts
 * Bộ kiểm thử tích hợp End-to-End toàn bộ luồng Kiosk Fotolism:
 * Chụp ảnh -> Xác thực AI Enhance -> Phục hồi file final/ (chống tạo ảnh gốc thứ 5) ->
 * Hàng đợi SQLite Outbox -> Upload Cloudflare R2 (HTTP PUT thật) -> Xác nhận CMS (/api/storage/confirm) ->
 * Cổng sẵn sàng Gallery (/api/gallery/:token) cho khách quét QR nhận ảnh, kèm phục hồi rớt mạng và SQLite fallback.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import * as http from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

const tempRoot = vi.hoisted(() => {
    const p = require('node:path')
    const o = require('node:os')
    const f = require('node:fs')
    const dir = f.mkdtempSync(p.join(o.tmpdir(), 'fotolism_e2e_'))
    process.env.FOTOLISM_DB_PATH = p.join(dir, 'fotolism_sessions.db')
    return dir
})

import { SessionDB } from '../dist-electron/sessionDatabase.cjs'
import { r2UploadWorker } from '../dist-electron/r2UploadWorker.cjs'
import {
    assertEnhancedFile,
    enhancedFinalPath,
    rawSessionPath,
} from '../dist-electron/enhanceIntegrity.cjs'
import {
    buildGalleryUrl,
    formatLocalSessionFolder,
    hashPinTo10Digits,
} from '../src/lib/pinUtils'

/** Sinh buffer JPEG giả lập có header/footer hợp lệ (> 2KB) và nội dung khác nhau theo nhãn. */
function makeDistinctJpeg(label: string, sizeBytes = 4096): Buffer {
    const buf = Buffer.alloc(sizeBytes, 0x20)
    // JPEG SOI + APP0
    buf[0] = 0xff
    buf[1] = 0xd8
    buf[2] = 0xff
    buf[3] = 0xe0
    buf.write(label, 8, 'utf-8')
    // JPEG EOI
    buf[sizeBytes - 2] = 0xff
    buf[sizeBytes - 1] = 0xd9
    return buf
}

interface StoredGalleryItem {
    objectKey: string
    fileName: string
    type: string
    sizeBytes: number
    status: 'READY'
}

describe('Fotolism Kiosk — E2E Capture to Customer QR Delivery Suite', () => {
    let server: http.Server
    let baseUrl = ''
    const uploadedBlobs = new Map<string, Buffer>()
    const galleryByToken = new Map<string, StoredGalleryItem[]>()
    let failNextPutForKey: string | null = null
    let putRequestCount = 0

    beforeAll(async () => {
        server = http.createServer((req, res) => {
            const urlObj = new URL(req.url || '/', 'http://127.0.0.1')

            // 1. Mock R2 Presigned PUT endpoint
            if (req.method === 'PUT' && urlObj.pathname.startsWith('/r2-put/')) {
                const key = decodeURIComponent(
                    urlObj.pathname.slice('/r2-put/'.length)
                )
                const chunks: Buffer[] = []
                req.on('data', (c) => chunks.push(Buffer.from(c)))
                req.on('end', () => {
                    putRequestCount++
                    if (failNextPutForKey && key.includes(failNextPutForKey)) {
                        failNextPutForKey = null
                        res.writeHead(503, { 'Content-Type': 'text/plain' })
                        res.end('Simulated transient R2 503')
                        return
                    }
                    uploadedBlobs.set(key, Buffer.concat(chunks))
                    res.writeHead(200)
                    res.end('OK')
                })
                return
            }

            // 2. Mock CMS /api/storage/presign
            if (
                req.method === 'POST' &&
                urlObj.pathname === '/api/storage/presign'
            ) {
                const chunks: Buffer[] = []
                req.on('data', (c) => chunks.push(Buffer.from(c)))
                req.on('end', () => {
                    const body = JSON.parse(
                        Buffer.concat(chunks).toString('utf-8')
                    )
                    const sessionId = String(body.sessionId || 'unknown')
                    const files = Array.isArray(body.files) ? body.files : []
                    const urls = files.map((f: any) => {
                        const objectKey = `fotolism-photos/${sessionId}/${f.type || 'original'}/${f.fileName}`
                        return {
                            fileName: f.fileName,
                            type: f.type || 'original',
                            objectKey,
                            putUrl: `${baseUrl}/r2-put/${encodeURIComponent(objectKey)}`,
                            expiresInSec: 900,
                        }
                    })
                    res.writeHead(200, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({ success: true, urls }))
                })
                return
            }

            // 3. Mock CMS /api/storage/confirm
            if (
                req.method === 'POST' &&
                urlObj.pathname === '/api/storage/confirm'
            ) {
                const chunks: Buffer[] = []
                req.on('data', (c) => chunks.push(Buffer.from(c)))
                req.on('end', () => {
                    const body = JSON.parse(
                        Buffer.concat(chunks).toString('utf-8')
                    )
                    const rawSessionId = String(body.sessionId || '')
                    const pin = rawSessionId.replace(/^session_/, '')
                    const token = hashPinTo10Digits(pin)
                    const list = galleryByToken.get(token) || []
                    const incoming = Array.isArray(body.files)
                        ? body.files
                        : body.objectKey
                          ? [body]
                          : []
                    for (const f of incoming) {
                        const objKey = String(f.objectKey || '')
                        if (
                            objKey &&
                            !list.some((item) => item.objectKey === objKey)
                        ) {
                            list.push({
                                objectKey: objKey,
                                fileName: String(
                                    f.fileName || path.basename(objKey)
                                ),
                                type: String(f.type || 'original'),
                                sizeBytes: Number(f.sizeBytes || 0),
                                status: 'READY',
                            })
                        }
                    }
                    galleryByToken.set(token, list)
                    res.writeHead(200, { 'Content-Type': 'application/json' })
                    res.end(
                        JSON.stringify({
                            success: true,
                            confirmedCount: incoming.length,
                        })
                    )
                })
                return
            }

            // 4. Mock CMS /api/gallery/:token (Customer QR + CMS Readiness Gate)
            if (
                req.method === 'GET' &&
                urlObj.pathname.startsWith('/api/gallery/')
            ) {
                const token = urlObj.pathname.slice('/api/gallery/'.length)
                const photos = galleryByToken.get(token) || []
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(
                    JSON.stringify({
                        success: true,
                        photos,
                        syncStatus: {
                            isComplete: photos.length > 0,
                            total: photos.length,
                        },
                    })
                )
                return
            }

            res.writeHead(404)
            res.end('Not found')
        })

        await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', () => {
                const addr = server.address() as { port: number }
                baseUrl = `http://127.0.0.1:${addr.port}`
                r2UploadWorker.setCmsUrl(baseUrl)
                r2UploadWorker.start()
                resolve()
            })
        })
    })

    afterAll(async () => {
        r2UploadWorker.stop()
        await new Promise<void>((resolve) => server.close(() => resolve()))
        try {
            fs.rmSync(tempRoot, { recursive: true, force: true })
        } catch {}
    })

    /** Chờ toàn bộ UploadTasks của 1 session đạt trạng thái UPLOADED (hoặc hết hạn timeout). */
    async function waitForSessionUploadComplete(
        sessionId: string,
        timeoutMs = 10000
    ) {
        const deadline = Date.now() + timeoutMs
        while (Date.now() < deadline) {
            const tasks = SessionDB.getUploadTasksForSession(sessionId)
            if (
                tasks.length > 0 &&
                tasks.every((t) => t.status === 'UPLOADED')
            ) {
                return tasks
            }
            await new Promise((r) => setTimeout(r, 80))
        }
        return SessionDB.getUploadTasksForSession(sessionId)
    }

    it('E2E-01: Photobooth 4x6 — Capture 4 shots -> AI Enhance -> Finalize -> R2 Upload -> CMS Confirm -> Customer QR Gallery', async () => {
        const pin = '0099'
        const sessionId = formatLocalSessionFolder(pin)
        const rawDir = path.join(tempRoot, 'sessions', sessionId, 'raw')
        const finalDir = path.join(tempRoot, 'sessions', sessionId, 'final')
        fs.mkdirSync(rawDir, { recursive: true })
        fs.mkdirSync(finalDir, { recursive: true })

        SessionDB.createSession({
            id: sessionId,
            status: 'ACTIVE',
            started_at: new Date().toISOString(),
            total_slots: 4,
            layout_id: 'layout_4x6_4',
            payment_status: 'PAID',
            print_copies: 2,
        })

        // 1. Tạo 4 ảnh RAW (Canon 24MP) & 4 ảnh AI Enhanced trong final/ + 1 ảnh ghép final_4x6
        const enhancedPayloads: Record<string, Buffer> = {}
        const rawPayloads: Record<string, Buffer> = {}
        const baseTs = Date.now()

        const tasksToQueue = []
        for (let i = 1; i <= 4; i++) {
            const rawPath = path.join(
                rawDir,
                `fotolism_shot_${i}_${baseTs + i}.jpg`
            )
            const enhFileName = `fotolism_enhanced_${i}_${baseTs + i}.jpg`
            const enhPath = path.join(finalDir, enhFileName)

            const rawBuf = makeDistinctJpeg(`RAW_SHOT_${i}_LANDSCAPE_24MP`, 4096)
            const enhBuf = makeDistinctJpeg(
                `AI_ENHANCED_SHOT_${i}_WHITE_PINK_V2`,
                5120
            )
            fs.writeFileSync(rawPath, rawBuf)
            fs.writeFileSync(enhPath, enhBuf)

            rawPayloads[enhFileName] = rawBuf
            enhancedPayloads[enhFileName] = enhBuf

            // Xác thực toàn vẹn AI và đường dẫn final/ (không sinh file trùng)
            expect(() => assertEnhancedFile(rawPath, enhPath)).not.toThrow()
            expect(rawSessionPath(rawPath, rawDir, `fotolism_shot_${i}.jpg`)).toBe(
                rawPath
            )
            expect(
                enhancedFinalPath(enhPath, finalDir, `fotolism_enhanced_${i}.jpg`)
            ).toBe(enhPath)

            const objectKey = `fotolism-photos/${sessionId}/original/fotolism_enhanced_${i}.jpg`
            tasksToQueue.push({
                id: `task_${sessionId}_shot_${i}`,
                session_id: sessionId,
                image_id: `shot_${i}`,
                file_path: enhPath,
                object_key: objectKey,
                size_bytes: enhBuf.length,
                is_final: 0,
                status: 'PENDING' as const,
                attempts: 0,
                presigned_url: `${baseUrl}/r2-put/${encodeURIComponent(objectKey)}`,
                url_expires_at: Date.now() + 900_000,
            })
        }

        // 2. Ảnh ghép thành phẩm final_4x6.jpg
        const compositePath = path.join(finalDir, 'fotolism_final_4x6.jpg')
        const compositeBuf = makeDistinctJpeg('FINAL_COMPOSITE_4X6_600DPI', 8192)
        fs.writeFileSync(compositePath, compositeBuf)
        const compositeKey = `fotolism-photos/${sessionId}/final/fotolism_final_4x6.jpg`
        tasksToQueue.push({
            id: `task_${sessionId}_final_composite`,
            session_id: sessionId,
            image_id: 'final_composite',
            file_path: compositePath,
            object_key: compositeKey,
            size_bytes: compositeBuf.length,
            is_final: 1,
            status: 'PENDING' as const,
            attempts: 0,
            presigned_url: `${baseUrl}/r2-put/${encodeURIComponent(compositeKey)}`,
            url_expires_at: Date.now() + 900_000,
        })

        // 3. Đưa vào SQLite Outbox & chạy r2UploadWorker đẩy thật lên mock R2 + Confirm CMS
        SessionDB.enqueueBatchUploadTasks(tasksToQueue)
        r2UploadWorker.triggerProcessing()

        const doneTasks = await waitForSessionUploadComplete(sessionId)
        expect(doneTasks).toHaveLength(5)
        expect(doneTasks.every((t) => t.status === 'UPLOADED')).toBe(true)

        // 4. Kiểm tra đúng nội dung byte AI Enhanced (KHÔNG phải RAW) đã lên R2
        for (let i = 1; i <= 4; i++) {
            const key = `fotolism-photos/${sessionId}/original/fotolism_enhanced_${i}.jpg`
            const uploaded = uploadedBlobs.get(key)
            expect(uploaded).toBeDefined()
            expect(uploaded!.toString('utf-8')).toContain(
                `AI_ENHANCED_SHOT_${i}_WHITE_PINK_V2`
            )
            expect(uploaded!.toString('utf-8')).not.toContain('RAW_SHOT_')
        }
        expect(uploadedBlobs.get(compositeKey)!.toString('utf-8')).toContain(
            'FINAL_COMPOSITE_4X6_600DPI'
        )

        // 5. Khách quét QR truy cập CMS Gallery -> nhận đủ 5 ảnh READY, đúng link QR
        const token = hashPinTo10Digits(pin)
        const qrUrl = buildGalleryUrl(pin)
        expect(qrUrl).toContain(token)

        const galleryRes = await fetch(`${baseUrl}/api/gallery/${token}`)
        expect(galleryRes.ok).toBe(true)
        const galleryJson = (await galleryRes.json()) as {
            success: boolean
            photos: StoredGalleryItem[]
            syncStatus: { isComplete: boolean; total: number }
        }
        expect(galleryJson.success).toBe(true)
        expect(galleryJson.syncStatus.isComplete).toBe(true)
        expect(galleryJson.photos).toHaveLength(5)
        expect(galleryJson.photos.every((p) => p.status === 'READY')).toBe(true)

        // Xác nhận thư mục final/ không có file thứ 5 bị trùng
        const finalFiles = fs.readdirSync(finalDir)
        expect(finalFiles).toHaveLength(5) // 4 enhanced + 1 final_4x6
    })

    it('E2E-02: Session 0096 Regression — Recover existing enhanced file in final/ when slot falls back to raw/', () => {
        const sessionId = formatLocalSessionFolder('0096')
        const rawDir = path.join(tempRoot, 'sessions', sessionId, 'raw')
        const finalDir = path.join(tempRoot, 'sessions', sessionId, 'final')
        fs.mkdirSync(rawDir, { recursive: true })
        fs.mkdirSync(finalDir, { recursive: true })

        const raw2 = path.join(rawDir, 'fotolism_shot_2_1795791221345.jpg')
        const enh2 = path.join(finalDir, 'fotolism_enhanced_2_1795791221345.jpg')
        fs.writeFileSync(raw2, makeDistinctJpeg('RAW_0096_SLOT_2', 4096))
        fs.writeFileSync(enh2, makeDistinctJpeg('ENHANCED_0096_SLOT_2', 5200))

        // Mô phỏng đúng logic phục hồi trong storageIpc.cts khi s.enhancedPath bị trỏ về raw2
        const enhancedBaseName = 'fotolism_enhanced_2.jpg'
        let cleanEnh = raw2
        const isEnhAlreadyInFinal =
            path.resolve(path.dirname(cleanEnh)) === path.resolve(finalDir)
        expect(isEnhAlreadyInFinal).toBe(false)

        const stemPrefix = `${path.parse(enhancedBaseName).name}_`
        const candidates = fs
            .readdirSync(finalDir)
            .filter(
                (name) =>
                    name.startsWith(stemPrefix) && /\.(jpe?g|png)$/i.test(name)
            )
            .map((name) => path.join(finalDir, name))

        for (const cand of candidates) {
            assertEnhancedFile(raw2, cand)
            cleanEnh = cand
            break
        }

        const finalTarget = enhancedFinalPath(
            cleanEnh,
            finalDir,
            enhancedBaseName
        )
        // Phục hồi đúng file đã enhance, KHÔNG sinh thêm `fotolism_enhanced_2.jpg` (ảnh gốc)
        expect(finalTarget).toBe(enh2)
        expect(
            fs.existsSync(path.join(finalDir, 'fotolism_enhanced_2.jpg'))
        ).toBe(false)
    })

    it('E2E-03: Selfbooth — Incremental Upload Deduplication & Customer Gallery Order', async () => {
        const pin = '0888'
        const sessionId = formatLocalSessionFolder(pin)
        const finalDir = path.join(tempRoot, 'sessions', sessionId, 'final')
        fs.mkdirSync(finalDir, { recursive: true })

        SessionDB.createSession({
            id: sessionId,
            status: 'ACTIVE',
            started_at: new Date().toISOString(),
            total_slots: 3,
            layout_id: 'selfbooth',
            payment_status: 'PAID',
            print_copies: 0,
        })

        const initialPutCount = putRequestCount
        for (let i = 1; i <= 3; i++) {
            const p = path.join(finalDir, `fotolism_enhanced_self_${i}.jpg`)
            const buf = makeDistinctJpeg(`SELFBOOTH_3_4_ENH_${i}`, 4600)
            fs.writeFileSync(p, buf)
            const key = `fotolism-photos/${sessionId}/original/fotolism_enhanced_self_${i}.jpg`
            SessionDB.enqueueUploadTask({
                id: `task_${sessionId}_self_${i}`,
                session_id: sessionId,
                image_id: `self_${i}`,
                file_path: p,
                object_key: key,
                size_bytes: buf.length,
                is_final: 0,
                status: 'PENDING',
                attempts: 0,
                presigned_url: `${baseUrl}/r2-put/${encodeURIComponent(key)}`,
                url_expires_at: Date.now() + 900_000,
            })
        }

        r2UploadWorker.triggerProcessing()
        const firstPass = await waitForSessionUploadComplete(sessionId)
        expect(firstPass.every((t) => t.status === 'UPLOADED')).toBe(true)
        const putsAfterFirstPass = putRequestCount - initialPutCount
        expect(putsAfterFirstPass).toBe(3)

        // Mô phỏng kết thúc phiên Selfbooth gọi enqueue lại cùng task_id -> phải giữ nguyên UPLOADED, KHÔNG đẩy trùng!
        for (let i = 1; i <= 3; i++) {
            const p = path.join(finalDir, `fotolism_enhanced_self_${i}.jpg`)
            const key = `fotolism-photos/${sessionId}/original/fotolism_enhanced_self_${i}.jpg`
            const preserved = SessionDB.enqueueUploadTask({
                id: `task_${sessionId}_self_${i}`,
                session_id: sessionId,
                image_id: `self_${i}`,
                file_path: p,
                object_key: key,
                size_bytes: 4600,
                is_final: 0,
                status: 'PENDING',
                attempts: 0,
            })
            expect(preserved.status).toBe('UPLOADED')
        }

        r2UploadWorker.triggerProcessing()
        await new Promise((r) => setTimeout(r, 250))
        // Số lượt PUT không tăng thêm -> không nhân đôi ảnh
        expect(putRequestCount - initialPutCount).toBe(3)

        const token = hashPinTo10Digits(pin)
        const galleryRes = await fetch(`${baseUrl}/api/gallery/${token}`)
        const galleryJson = (await galleryRes.json()) as {
            photos: StoredGalleryItem[]
        }
        expect(galleryJson.photos).toHaveLength(3)
    })

    it('E2E-04: Offline-First Network Flap — Transient R2 503 retries cleanly and delivers photo to customer', async () => {
        const pin = '0777'
        const sessionId = formatLocalSessionFolder(pin)
        const finalDir = path.join(tempRoot, 'sessions', sessionId, 'final')
        fs.mkdirSync(finalDir, { recursive: true })

        SessionDB.createSession({
            id: sessionId,
            status: 'ACTIVE',
            started_at: new Date().toISOString(),
            total_slots: 1,
            payment_status: 'PAID',
            print_copies: 2,
        })

        const p = path.join(finalDir, 'fotolism_enhanced_1_retry.jpg')
        const buf = makeDistinctJpeg('OFFLINE_RETRY_PHOTO_1', 4200)
        fs.writeFileSync(p, buf)
        const key = `fotolism-photos/${sessionId}/original/fotolism_enhanced_1_retry.jpg`

        // Ép lỗi 503 ở lần PUT đầu tiên
        failNextPutForKey = 'fotolism_enhanced_1_retry.jpg'

        SessionDB.enqueueUploadTask({
            id: `task_${sessionId}_retry_1`,
            session_id: sessionId,
            image_id: 'retry_1',
            file_path: p,
            object_key: key,
            size_bytes: buf.length,
            is_final: 0,
            status: 'PENDING',
            attempts: 0,
            presigned_url: `${baseUrl}/r2-put/${encodeURIComponent(key)}`,
            url_expires_at: Date.now() + 900_000,
        })

        r2UploadWorker.triggerProcessing()

        // Chờ lần thử 1 thất bại chuyển sang FAILED_RETRYABLE
        const failDeadline = Date.now() + 5000
        let failedTask = SessionDB.getUploadTask(`task_${sessionId}_retry_1`)
        while (
            Date.now() < failDeadline &&
            failedTask?.status !== 'FAILED_RETRYABLE'
        ) {
            await new Promise((r) => setTimeout(r, 60))
            failedTask = SessionDB.getUploadTask(`task_${sessionId}_retry_1`)
        }
        expect(failedTask?.status).toBe('FAILED_RETRYABLE')
        expect(failedTask?.attempts).toBe(1)

        // Mạng khôi phục -> requeue và đẩy bù thành công
        const requeued = SessionDB.requeueRetryableUploadTasks(0)
        expect(requeued).toBeGreaterThanOrEqual(1)
        r2UploadWorker.triggerProcessing()

        const recovered = await waitForSessionUploadComplete(sessionId)
        expect(recovered).toHaveLength(1)
        expect(recovered[0].status).toBe('UPLOADED')

        const token = hashPinTo10Digits(pin)
        const galleryRes = await fetch(`${baseUrl}/api/gallery/${token}`)
        const galleryJson = (await galleryRes.json()) as {
            photos: StoredGalleryItem[]
        }
        expect(galleryJson.photos).toHaveLength(1)
        expect(uploadedBlobs.get(key)!.toString('utf-8')).toContain(
            'OFFLINE_RETRY_PHOTO_1'
        )
    })

    it('E2E-05: Print physical sheet calculation invariant (2x6 paired vs 4x6)', () => {
        const calcPhysicalSheets = (
            frameSize: '2x6' | '4x6',
            printCopies: number
        ) =>
            frameSize === '2x6'
                ? Math.max(1, Math.ceil(printCopies / 2))
                : printCopies

        // 2x6 mặc định 2 dải -> 1 tờ 4x6 cắt đôi; thêm 2 dải (4 dải) -> 2 tờ
        expect(calcPhysicalSheets('2x6', 2)).toBe(1)
        expect(calcPhysicalSheets('2x6', 4)).toBe(2)
        // 4x6 mặc định 2 tấm -> 2 tờ; thêm 1 tấm (3 tấm) -> 3 tờ
        expect(calcPhysicalSheets('4x6', 2)).toBe(2)
        expect(calcPhysicalSheets('4x6', 3)).toBe(3)
    })
})
