import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export interface SessionRecord {
    id: string
    status: 'ACTIVE' | 'COMPLETED' | 'ABORTED'
    started_at: string
    completed_at?: string
    total_slots: number
    layout_id?: string
    price?: number
    payment_status: 'PENDING' | 'PAID' | 'SKIPPED'
    print_copies: number
    updated_at: string
}

export interface CaptureRecordDB {
    id: string
    session_id: string
    slot_index: number
    status: string
    file_path?: string
    raw_file_path?: string
    is_retake: number
    retake_count: number
    latency_ms?: number
    shutter_ms?: number
    transfer_ms?: number
    created_at: string
    updated_at: string
}

export interface MediaFileRecord {
    id: string
    session_id: string
    capture_id?: string
    type: 'raw' | 'composite' | 'print' | 'qr' | 'timelapse'
    file_path: string
    file_size?: number
    created_at: string
}

export interface PrintJobRecord {
    id: string
    session_id: string
    file_path: string
    copies: number
    status: 'QUEUED' | 'PRINTING' | 'SUCCESS' | 'FAILED'
    printer_name?: string
    created_at: string
    completed_at?: string
    error?: string
}

export type UploadTaskStatus =
    | 'PENDING'
    | 'UPLOADING'
    | 'UPLOADED'
    | 'FAILED_RETRYABLE'
    | 'FAILED_PERMANENT'
    | 'EXPIRED'

export interface UploadTaskRecord {
    id: string
    session_id: string
    image_id: string
    file_path: string
    object_key: string
    size_bytes: number
    checksum?: string
    is_final: number // 1 = final composite, 0 = original
    status: UploadTaskStatus
    attempts: number
    presigned_url?: string
    url_expires_at?: number
    last_error?: string
    created_at: string
    updated_at: string
}

let dbInstance: DatabaseSync | null = null

export function getDatabase(customPath?: string): DatabaseSync {
    if (dbInstance) return dbInstance

    const dbPath =
        customPath || path.join(process.cwd(), 'fotolism_sessions.db')
    const dir = path.dirname(dbPath)
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }

    const db = new DatabaseSync(dbPath)

    // Initialize SQLite Schema according to Fotolism 2.2 Architecture (FR-06)
    db.exec(`
    CREATE TABLE IF NOT EXISTS Sessions (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      started_at TEXT NOT NULL,
      completed_at TEXT,
      total_slots INTEGER NOT NULL DEFAULT 4,
      layout_id TEXT,
      price INTEGER DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'PENDING',
      print_copies INTEGER DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS Captures (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      slot_index INTEGER NOT NULL,
      status TEXT NOT NULL,
      file_path TEXT,
      raw_file_path TEXT,
      is_retake INTEGER NOT NULL DEFAULT 0,
      retake_count INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER DEFAULT 0,
      shutter_ms INTEGER DEFAULT 0,
      transfer_ms INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES Sessions(id)
    );

    CREATE TABLE IF NOT EXISTS MediaFiles (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      capture_id TEXT,
      type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES Sessions(id)
    );

    CREATE TABLE IF NOT EXISTS PrintJobs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      copies INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'QUEUED',
      printer_name TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      error TEXT,
      FOREIGN KEY(session_id) REFERENCES Sessions(id)
    );

    CREATE TABLE IF NOT EXISTS UploadTasks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      image_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      object_key TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      checksum TEXT,
      is_final INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING',
      attempts INTEGER NOT NULL DEFAULT 0,
      presigned_url TEXT,
      url_expires_at INTEGER,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES Sessions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_captures_session ON Captures(session_id);
    CREATE INDEX IF NOT EXISTS idx_media_session ON MediaFiles(session_id);
    CREATE INDEX IF NOT EXISTS idx_print_session ON PrintJobs(session_id);
    CREATE INDEX IF NOT EXISTS idx_upload_tasks_session ON UploadTasks(session_id);
    CREATE INDEX IF NOT EXISTS idx_upload_tasks_status ON UploadTasks(status);
  `)

    dbInstance = db
    return db
}

export const SessionDB = {
    createSession(session: Omit<SessionRecord, 'updated_at'>): SessionRecord {
        const db = getDatabase()
        const now = new Date().toISOString()
        const record: SessionRecord = { ...session, updated_at: now }

        const stmt = db.prepare(`
      INSERT OR REPLACE INTO Sessions (
        id, status, started_at, completed_at, total_slots, layout_id, price, payment_status, print_copies, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

        stmt.run(
            record.id,
            record.status,
            record.started_at,
            record.completed_at || null,
            record.total_slots,
            record.layout_id || null,
            record.price || 0,
            record.payment_status,
            record.print_copies,
            record.updated_at
        )

        return record
    },

    updateSession(id: string, updates: Partial<SessionRecord>): void {
        const db = getDatabase()
        const now = new Date().toISOString()
        const fields: string[] = []
        const values: any[] = []

        for (const [key, val] of Object.entries(updates)) {
            if (key !== 'id') {
                fields.push(`${key} = ?`)
                values.push(val)
            }
        }
        fields.push('updated_at = ?')
        values.push(now)
        values.push(id)

        const sql = `UPDATE Sessions SET ${fields.join(', ')} WHERE id = ?`
        db.prepare(sql).run(...values)
    },

    getSession(id: string): SessionRecord | null {
        const db = getDatabase()
        const row = db
            .prepare('SELECT * FROM Sessions WHERE id = ?')
            .get(id) as any
        return row ? (row as SessionRecord) : null
    },

    getActiveSession(): SessionRecord | null {
        const db = getDatabase()
        const row = db
            .prepare(
                "SELECT * FROM Sessions WHERE status = 'ACTIVE' ORDER BY started_at DESC LIMIT 1"
            )
            .get() as any
        return row ? (row as SessionRecord) : null
    },

    saveCapture(
        capture: Omit<CaptureRecordDB, 'created_at' | 'updated_at'>
    ): CaptureRecordDB {
        const db = getDatabase()
        const now = new Date().toISOString()

        // Kiểm tra số lần retake hiện tại trên slot này
        const existing = db
            .prepare(
                'SELECT COUNT(*) as count FROM Captures WHERE session_id = ? AND slot_index = ?'
            )
            .get(capture.session_id, capture.slot_index) as any
        const retakeCount = existing?.count || 0

        const record: CaptureRecordDB = {
            ...capture,
            is_retake: retakeCount > 0 ? 1 : 0,
            retake_count: retakeCount,
            created_at: now,
            updated_at: now,
        }

        const stmt = db.prepare(`
      INSERT OR REPLACE INTO Captures (
        id, session_id, slot_index, status, file_path, raw_file_path, is_retake, retake_count,
        latency_ms, shutter_ms, transfer_ms, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

        stmt.run(
            record.id,
            record.session_id,
            record.slot_index,
            record.status,
            record.file_path || null,
            record.raw_file_path || null,
            record.is_retake,
            record.retake_count,
            record.latency_ms || 0,
            record.shutter_ms || 0,
            record.transfer_ms || 0,
            record.created_at,
            record.updated_at
        )

        return record
    },

    getCaptures(sessionId: string): CaptureRecordDB[] {
        const db = getDatabase()
        const rows = db
            .prepare(
                'SELECT * FROM Captures WHERE session_id = ? ORDER BY slot_index ASC, created_at ASC'
            )
            .all(sessionId) as any[]
        return rows as CaptureRecordDB[]
    },

    recordMediaFile(
        media: Omit<MediaFileRecord, 'created_at'>
    ): MediaFileRecord {
        const db = getDatabase()
        const now = new Date().toISOString()
        const record: MediaFileRecord = { ...media, created_at: now }

        const stmt = db.prepare(`
      INSERT OR REPLACE INTO MediaFiles (id, session_id, capture_id, type, file_path, file_size, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

        stmt.run(
            record.id,
            record.session_id,
            record.capture_id || null,
            record.type,
            record.file_path,
            record.file_size || 0,
            record.created_at
        )

        return record
    },

    createPrintJob(job: Omit<PrintJobRecord, 'created_at'>): PrintJobRecord {
        const db = getDatabase()
        const now = new Date().toISOString()
        const record: PrintJobRecord = { ...job, created_at: now }

        const stmt = db.prepare(`
      INSERT OR REPLACE INTO PrintJobs (id, session_id, file_path, copies, status, printer_name, created_at, completed_at, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

        stmt.run(
            record.id,
            record.session_id,
            record.file_path,
            record.copies,
            record.status,
            record.printer_name || null,
            record.created_at,
            record.completed_at || null,
            record.error || null
        )

        return record
    },

    updatePrintJob(
        id: string,
        status: PrintJobRecord['status'],
        error?: string
    ): void {
        const db = getDatabase()
        const now = new Date().toISOString()
        const stmt = db.prepare(
            'UPDATE PrintJobs SET status = ?, error = ?, completed_at = ? WHERE id = ?'
        )
        stmt.run(status, error || null, now, id)
    },

    enqueueUploadTask(
        task: Omit<UploadTaskRecord, 'created_at' | 'updated_at'>
    ): UploadTaskRecord {
        const db = getDatabase()
        const now = new Date().toISOString()
        const record: UploadTaskRecord = {
            ...task,
            status: task.status || 'PENDING',
            attempts: task.attempts || 0,
            created_at: now,
            updated_at: now,
        }

        const stmt = db.prepare(`
      INSERT OR REPLACE INTO UploadTasks (
        id, session_id, image_id, file_path, object_key, size_bytes, checksum,
        is_final, status, attempts, presigned_url, url_expires_at, last_error,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

        stmt.run(
            record.id,
            record.session_id,
            record.image_id,
            record.file_path,
            record.object_key,
            record.size_bytes,
            record.checksum || null,
            record.is_final ? 1 : 0,
            record.status,
            record.attempts,
            record.presigned_url || null,
            record.url_expires_at || null,
            record.last_error || null,
            record.created_at,
            record.updated_at
        )

        return record
    },

    enqueueBatchUploadTasks(
        tasks: Array<Omit<UploadTaskRecord, 'created_at' | 'updated_at'>>
    ): UploadTaskRecord[] {
        return tasks.map((t) => this.enqueueUploadTask(t))
    },

    getPendingUploadTasks(limit = 10): UploadTaskRecord[] {
        const db = getDatabase()
        // Ưu tiên ảnh thành phẩm (is_final DESC) trước
        const stmt = db.prepare(`
      SELECT * FROM UploadTasks 
      WHERE status = 'PENDING'
      ORDER BY is_final DESC, created_at ASC 
      LIMIT ?
    `)
        return stmt.all(limit) as any[] as UploadTaskRecord[]
    },

    updateUploadTaskStatus(
        id: string,
        status: UploadTaskStatus,
        lastError?: string,
        incrementAttempts = false
    ): void {
        const db = getDatabase()
        const now = new Date().toISOString()
        if (incrementAttempts) {
            const stmt = db.prepare(`
        UPDATE UploadTasks 
        SET status = ?, last_error = ?, attempts = attempts + 1, updated_at = ? 
        WHERE id = ?
      `)
            stmt.run(status, lastError || null, now, id)
        } else {
            const stmt = db.prepare(`
        UPDATE UploadTasks 
        SET status = ?, last_error = ?, updated_at = ? 
        WHERE id = ?
      `)
            stmt.run(status, lastError || null, now, id)
        }
    },

    setUploadTaskPresignedUrl(
        id: string,
        presignedUrl: string,
        expiresAt: number
    ): void {
        const db = getDatabase()
        const now = new Date().toISOString()
        const stmt = db.prepare(`
      UPDATE UploadTasks 
      SET presigned_url = ?, url_expires_at = ?, updated_at = ? 
      WHERE id = ?
    `)
        stmt.run(presignedUrl, expiresAt, now, id)
    },

    getUploadQueueStats(): {
        pending: number
        uploading: number
        uploaded: number
        failedRetryable: number
        failedPermanent: number
        total: number
    } {
        const db = getDatabase()
        const rows = db
            .prepare(
                `
      SELECT status, COUNT(*) as count 
      FROM UploadTasks 
      GROUP BY status
    `
            )
            .all() as Array<{ status: string; count: number }>

        const stats = {
            pending: 0,
            uploading: 0,
            uploaded: 0,
            failedRetryable: 0,
            failedPermanent: 0,
            total: 0,
        }

        for (const r of rows) {
            stats.total += r.count
            if (r.status === 'PENDING') stats.pending = r.count
            else if (r.status === 'UPLOADING') stats.uploading = r.count
            else if (r.status === 'UPLOADED') stats.uploaded = r.count
            else if (r.status === 'FAILED_RETRYABLE')
                stats.failedRetryable = r.count
            else if (r.status === 'FAILED_PERMANENT')
                stats.failedPermanent = r.count
        }

        return stats
    },

    retryFailedUploadTasks(): number {
        const db = getDatabase()
        const now = new Date().toISOString()
        const res = db
            .prepare(
                `
      UPDATE UploadTasks 
      SET status = 'PENDING', last_error = NULL, updated_at = ? 
      WHERE status = 'FAILED_RETRYABLE'
    `
            )
            .run(now)
        return Number(res.changes)
    },

    getUploadTasksForSession(sessionId: string): UploadTaskRecord[] {
        const db = getDatabase()
        return db
            .prepare(
                `
      SELECT * FROM UploadTasks 
      WHERE session_id = ? 
      ORDER BY is_final DESC, created_at ASC
    `
            )
            .all(sessionId) as any[] as UploadTaskRecord[]
    },

    getUploadTask(id: string): UploadTaskRecord | null {
        const db = getDatabase()
        const row = db
            .prepare('SELECT * FROM UploadTasks WHERE id = ?')
            .get(id) as any
        return row ? (row as UploadTaskRecord) : null
    },
}
