/**
 * @file cloudSyncService.ts
 * Dịch vụ đồng bộ đám mây hai chiều giữa Kiosk và Cloud CMS:
 * gửi heartbeat định kỳ (30s) báo cáo sức khỏe thiết bị và định mức giấy in,
 * quản lý hàng đợi Outbox cục bộ gửi phiên chụp, và tự động kéo bảng giá/voucher mới nhất.
 * Phụ thuộc: localStorage, fetch API, Window/Electron API, lib/constants.
 */

import {
    ENV_CMS_URL,
    ENABLE_BACKGROUND_SESSION_SYNC,
} from '../lib/constants'

export interface KioskOutboxSession {
    id: string
    session_code: string
    pin_code?: string | null
    customer_name?: string | null
    customer_phone?: string | null
    kiosk_id: string
    branch_id?: string
    layout_type: '2x6' | '4x6' | 'selfbooth'
    copies: number
    total_amount: number
    payment_method: 'vietqr' | 'cash'
    coupon_code?: string | null
    paper_consumed: number
    storage_url?: string | null
    status: 'completed' | 'cancelled'
    created_at: string
    sync_status: 'SYNCED' | 'PENDING_SYNC'
    synced_at?: string
    photos?: string[]
    reprintCount?: number
}

export interface CloudSyncStatus {
    isOnline: boolean
    isLocked?: boolean
    lastHeartbeat: string | null
    lastHeartbeatTimestamp: number | null
    lastSyncTime: string | null
    pendingCount: number
    configVersion: number
    isSyncing: boolean
    lastError: string | null
}

type SyncListener = (status: CloudSyncStatus) => void

export interface DeviceConfig {
    device_token: string
    kiosk_id: string
    kiosk_name?: string
    branch_id?: string
    branch_name?: string
    cms_url?: string
    activated_at?: string
}

const OUTBOX_STORAGE_KEY = 'fotolism_sessions_outbox'
const CONFIG_VER_KEY = 'fotolism_config_version'

class CloudSyncService {
    private static instance: CloudSyncService
    private timer: number | null = null
    private listeners: Set<SyncListener> = new Set()
    private deviceConfig: DeviceConfig | null = null

    private status: CloudSyncStatus = {
        isOnline: false,
        lastHeartbeat: null,
        lastHeartbeatTimestamp: null,
        lastSyncTime: null,
        pendingCount: 0,
        configVersion: 1,
        isSyncing: false,
        lastError: null,
    }

    private constructor() {
        const savedVer =
            typeof localStorage !== 'undefined'
                ? localStorage.getItem(CONFIG_VER_KEY)
                : null
        if (savedVer) {
            this.status.configVersion = parseInt(savedVer, 10) || 1
        }
        const savedCfg =
            typeof localStorage !== 'undefined'
                ? localStorage.getItem('fotolism_device_config')
                : null
        if (savedCfg) {
            try {
                this.deviceConfig = JSON.parse(savedCfg)
            } catch {}
        }
        if (
            !ENABLE_BACKGROUND_SESSION_SYNC &&
            typeof localStorage !== 'undefined'
        ) {
            localStorage.removeItem(OUTBOX_STORAGE_KEY)
        }
        this.refreshPendingCount()
    }

    public static getInstance(): CloudSyncService {
        if (!CloudSyncService.instance) {
            CloudSyncService.instance = new CloudSyncService()
        }
        return CloudSyncService.instance
    }

    public getDeviceConfig(): DeviceConfig | null {
        if (!this.deviceConfig && typeof localStorage !== 'undefined') {
            const savedCfg = localStorage.getItem('fotolism_device_config')
            if (savedCfg) {
                try {
                    this.deviceConfig = JSON.parse(savedCfg)
                } catch {}
            }
        }
        return this.deviceConfig
    }

    public setDeviceConfig(config: DeviceConfig | null) {
        this.deviceConfig = config
        if (typeof localStorage !== 'undefined') {
            if (config) {
                localStorage.setItem(
                    'fotolism_device_config',
                    JSON.stringify(config)
                )
                localStorage.setItem('fotolism_kiosk_id', config.kiosk_id)
                if (config.cms_url) {
                    localStorage.setItem('fotolism_cms_url', config.cms_url)
                }
            } else {
                localStorage.removeItem('fotolism_device_config')
            }
        }
        if (config?.device_token) {
            this.startWorker()
        } else {
            this.stopWorker()
        }
        this.notify()
    }

    public getBearerToken(): string | null {
        return this.getDeviceConfig()?.device_token || null
    }

    public isActivated(): boolean {
        return Boolean(this.getBearerToken())
    }

    public getCmsUrl(): string {
        // 1. Ưu tiên biến môi trường (.env) rồi tới cấu hình đã kích hoạt / nhân viên cấu hình
        const saved =
            typeof localStorage !== 'undefined'
                ? localStorage.getItem('fotolism_cms_url')
                : null
        return (
            ENV_CMS_URL ||
            this.getDeviceConfig()?.cms_url ||
            saved ||
            ''
        ).replace(/\/$/, '')
    }

    public setCmsUrl(url: string) {
        localStorage.setItem('fotolism_cms_url', url.replace(/\/$/, ''))
    }

    public getKioskId(): string {
        const raw = (
            this.getDeviceConfig()?.kiosk_id ||
            (typeof localStorage !== 'undefined'
                ? localStorage.getItem('fotolism_kiosk_id')
                : null) ||
            ''
        ).trim()
        if (raw && raw !== 'kiosk_01' && raw !== 'kiosk_02') {
            return raw
        }
        let captureMode = ''
        if (typeof localStorage !== 'undefined') {
            try {
                const cfg = JSON.parse(
                    localStorage.getItem('fotolism_event_config') || '{}'
                )
                captureMode = String(cfg?.captureMode || '')
            } catch {}
        }
        if (raw === 'kiosk_02' || captureMode === 'selfbooth') {
            return 'selfbooth_01'
        }
        return 'photobooth_01'
    }

    private lastReportedErrorKey: string | null = null

    /** Gửi bản ghi lỗi client/sync lên endpoint /api/audit của Cloud CMS (không chặn luồng UI). */
    public async reportErrorToServer(
        action: string,
        message: string,
        details?: Record<string, unknown>
    ): Promise<void> {
        const cmsUrl = this.getCmsUrl()
        if (!cmsUrl) return
        try {
            await fetch(`${cmsUrl}/api/audit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action,
                    resource: 'desktop-kiosk',
                    message,
                    details: {
                        kioskId: this.getKioskId() || null,
                        ...details,
                    },
                }),
                signal: AbortSignal.timeout(8000),
            })
        } catch (err) {
            console.error('[CloudSync] Failed to report error to CMS /api/audit:', err)
        }
    }

    private notifySyncFailure(
        action: string,
        message: string,
        details?: Record<string, unknown>,
        dedupeKey?: string
    ): void {
        if (dedupeKey && this.lastReportedErrorKey === dedupeKey) {
            return
        }
        if (dedupeKey) {
            this.lastReportedErrorKey = dedupeKey
        }
        console.error(`[CloudSync] [${action}] ${message}`, details ?? '')
    }

    public getStatus(): CloudSyncStatus {
        return { ...this.status }
    }

    public subscribe(listener: SyncListener): () => void {
        this.listeners.add(listener)
        listener(this.getStatus())
        return () => this.listeners.delete(listener)
    }

    private notify() {
        const current = this.getStatus()
        this.listeners.forEach((l) => l(current))
    }

    private remoteCommandListeners = new Set<(cmd: any) => void>()
    private processedCommandIds = new Set<string>()
    private processedTicketIds = new Set<string>()

    public subscribeRemoteCommand(listener: (cmd: any) => void): () => void {
        this.remoteCommandListeners.add(listener)
        return () => this.remoteCommandListeners.delete(listener)
    }

    public async acknowledgeRemoteCommand(
        commandId: string,
        status: 'acknowledged' | 'failed',
        errorMessage?: string
    ): Promise<boolean> {
        const token = this.getBearerToken()
        if (!token) return false
        const cmsUrl = this.getCmsUrl()
        try {
            const res = await fetch(`${cmsUrl}/api/kiosk/commands/ack`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ commandId, status, errorMessage }),
            })
            return res.ok
        } catch {
            return false
        }
    }

    private refreshPendingCount() {
        const sessions = this.getOutboxSessions()
        this.status.pendingCount = sessions.filter(
            (s) => s.sync_status === 'PENDING_SYNC'
        ).length
    }

    // ──────────────────────────────────────────────────────────────────────────
    // WORKER LIFECYCLE
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Khởi động background worker chạy ngầm định kỳ 5 giây (đảm bảo cập nhật tức thì trạng thái Khóa máy)
     */
    public startWorker(intervalMs = 5000) {
        if (this.timer) return

        // Chạy heartbeat ngay khi khởi động; chỉ đồng bộ phiên outbox khi bật cờ cấu hình
        this.sendHeartbeat().catch(console.warn)
        if (ENABLE_BACKGROUND_SESSION_SYNC) {
            this.syncPendingSessions().catch(console.warn)
            this.purgeOldSessions(7)
        }

        this.timer = window.setInterval(async () => {
            try {
                await this.sendHeartbeat()
                if (ENABLE_BACKGROUND_SESSION_SYNC) {
                    await this.syncPendingSessions()
                }
            } catch (err) {
                console.warn('[CloudSyncWorker] Background tick error:', err)
            }
        }, intervalMs)
    }

    public stopWorker() {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 1. HEARTBEAT & CONFIG VERSION CHECK
    // ──────────────────────────────────────────────────────────────────────────

    public async checkCmsHealth(): Promise<boolean> {
        const cmsUrl = this.getCmsUrl()
        try {
            const res = await fetch(`${cmsUrl}/api/system/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(2500),
            })
            const isOk = res.ok
            if (!this.getBearerToken()) {
                this.status.isOnline = isOk
                if (isOk) this.status.lastError = null
                this.notify()
            }
            return isOk
        } catch {
            if (!this.getBearerToken()) {
                this.status.isOnline = false
                this.notify()
            }
            return false
        }
    }

    public async sendHeartbeat(): Promise<boolean> {
        const token = this.getBearerToken()
        if (!token) {
            const isAlive = await this.checkCmsHealth()
            if (!isAlive) {
                this.status.isOnline = false
                this.status.lastError =
                    'Thiết bị chưa được kích hoạt với Cloud CMS'
                this.notify()
            }
            return isAlive
        }

        const cmsUrl = this.getCmsUrl()
        if (!cmsUrl) {
            const msg = 'Thiếu cấu hình URL máy chủ Cloud CMS (.env)'
            this.status.isOnline = false
            this.status.lastError = msg
            this.notify()
            this.notifySyncFailure('MISSING_CMS_URL', msg, undefined, 'MISSING_CMS_URL')
            return false
        }
        const kioskId = this.getKioskId()
        const paperCount = Number(
            localStorage.getItem('fotolism_paper_count') || '0'
        )

        try {
            const res = await fetch(`${cmsUrl}/api/kiosk/heartbeat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    kiosk_id: kioskId,
                    app_version: '3.0.0',
                    paper_remaining: paperCount,
                    paper_capacity: 800,
                    printer_status:
                        paperCount < 50 ? 'warning_low_paper' : 'ready',
                    printer_temperature: 38.0,
                    camera_status: 'connected',
                }),
            })

            if (!res.ok) {
                throw new Error(`Heartbeat failed: HTTP ${res.status}`)
            }

            const body = await res.json()
            const now = new Date()

            this.status.isOnline = true
            this.status.lastHeartbeat = now.toLocaleTimeString('vi-VN')
            this.status.lastHeartbeatTimestamp = now.getTime()
            this.status.lastError = null
            this.lastReportedErrorKey = null

            // Phản hồi trạng thái Tạm Khóa Kiosk từ Cloud CMS
            if (typeof body?.data?.is_locked === 'boolean') {
                this.status.isLocked = body.data.is_locked
            }

            // Kiểm tra nếu Cloud có version mới -> Tự động kéo cấu hình về
            if (
                body?.data?.latest_config_version &&
                body.data.latest_config_version > this.status.configVersion
            ) {
                await this.fetchAndApplyConfig(body.data.latest_config_version)
            }

            // Xử lý lệnh điều khiển từ xa (Mở máy Selfbooth từ CMS POS)
            const commands = Array.isArray(body?.data?.commands)
                ? body.data.commands
                : []
            for (const cmd of commands) {
                if (cmd?.type !== 'START_SELFBOOTH_SESSION') continue
                if (
                    this.processedCommandIds.has(cmd.id) ||
                    (cmd.ticket_id && this.processedTicketIds.has(cmd.ticket_id))
                ) {
                    // Idempotent: đã nhận trước đó -> xác nhận lại mà không kích hoạt trùng
                    await this.acknowledgeRemoteCommand(cmd.id, 'acknowledged')
                    continue
                }
                if (this.remoteCommandListeners.size === 0) {
                    await this.acknowledgeRemoteCommand(
                        cmd.id,
                        'failed',
                        'Máy Selfbooth đang có phiên chụp khác hoạt động'
                    )
                    continue
                }
                this.processedCommandIds.add(cmd.id)
                if (cmd.ticket_id) this.processedTicketIds.add(cmd.ticket_id)
                this.remoteCommandListeners.forEach((listener) => listener(cmd))
                await this.acknowledgeRemoteCommand(cmd.id, 'acknowledged')
            }

            this.notify()
            return true
        } catch (err: any) {
            const errMsg = err?.message || 'Không thể kết nối đến máy chủ Cloud CMS'
            this.status.isOnline = false
            this.status.lastError = errMsg
            this.notify()
            this.notifySyncFailure(
                'KIOSK_HEARTBEAT_ERROR',
                errMsg,
                { kioskId },
                `HB:${errMsg}`
            )
            return false
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. TỰ ĐỘNG ĐỒNG BỘ CẤU HÌNH & BẢNG GIÁ
    // ──────────────────────────────────────────────────────────────────────────

    public async fetchAndApplyConfig(targetVersion?: number): Promise<boolean> {
        const token = this.getBearerToken()
        if (!token) return false

        const cmsUrl = this.getCmsUrl()
        const kioskId = this.getKioskId()

        try {
            const res = await fetch(
                `${cmsUrl}/api/kiosk/config?kiosk_id=${kioskId}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            )

            if (!res.ok)
                throw new Error(`Fetch config failed: HTTP ${res.status}`)

            const body = await res.json()
            if (body?.success && body.data) {
                const configData = body.data

                // Lưu cấu hình vào localStorage của Kiosk
                localStorage.setItem(
                    'fotolism_remote_config',
                    JSON.stringify(configData)
                )
                if (configData.version) {
                    this.status.configVersion = configData.version
                    localStorage.setItem(
                        CONFIG_VER_KEY,
                        String(configData.version)
                    )
                }

                // Cập nhật giá vào event config nếu có
                if (configData.pricing) {
                    const currentEventConfig = JSON.parse(
                        localStorage.getItem('fotolism_event_config') || '{}'
                    )
                    const remote2x6 = Number(
                        configData.pricing.price_2x6 ??
                            configData.pricing.price_2x6_weekday
                    )
                    const remote4x6 = Number(
                        configData.pricing.price_4x6 ??
                            configData.pricing.price_4x6_weekday
                    )
                    const updatedEventConfig = {
                        ...currentEventConfig,
                        ...(remote2x6 > 0 ? { price2x6: remote2x6 } : {}),
                        ...(remote4x6 > 0 ? { price4x6: remote4x6 } : {}),
                        extraCopyPrice: configData.pricing.extra_print_price,
                        configVersion: configData.version || targetVersion || 1,
                    }
                    localStorage.setItem(
                        'fotolism_event_config',
                        JSON.stringify(updatedEventConfig)
                    )
                } else {
                    this.notifySyncFailure(
                        'SYNC_CONFIG_EMPTY_PRICING',
                        'CMS không trả về bảng giá khi đồng bộ cấu hình'
                    )
                }

                this.notify()
                return true
            }
            this.notifySyncFailure(
                'SYNC_CONFIG_ERROR',
                `Lỗi đồng bộ cấu hình từ CMS: HTTP ${res.status}`
            )
            return false
        } catch (err: any) {
            const errMsg = err?.message || 'Không thể tải cấu hình từ CMS'
            this.notifySyncFailure('SYNC_CONFIG_NETWORK_ERROR', errMsg)
            return false
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. OUTBOX QUEUE & ĐỒNG BỘ PHIÊN CHỤP
    // ──────────────────────────────────────────────────────────────────────────

    public getOutboxSessions(): KioskOutboxSession[] {
        try {
            const raw = localStorage.getItem(OUTBOX_STORAGE_KEY)
            return raw ? JSON.parse(raw) : []
        } catch {
            return []
        }
    }

    /**
     * Tự động xóa các phiên chụp đã cũ quá `days` ngày (mặc định 7 ngày theo cronjob)
     */
    public purgeOldSessions(days: number = 7): {
        removedCount: number
        remainingCount: number
    } {
        const cutoff = Date.now() - days * 24 * 3600 * 1000
        const sessions = this.getOutboxSessions()
        const kept = sessions.filter((s) => {
            const time = new Date(s.created_at).getTime()
            return s.sync_status === 'PENDING_SYNC' || isNaN(time) || time >= cutoff
        })
        const removedCount = sessions.length - kept.length
        if (removedCount > 0) {
            this.saveOutboxSessions(kept)
            console.log(
                `[CloudSyncService] Tự động dọn dẹp ${removedCount} phiên chụp quá ${days} ngày.`
            )
        }
        return { removedCount, remainingCount: kept.length }
    }

    public saveOutboxSessions(sessions: KioskOutboxSession[]) {
        localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(sessions))
        this.refreshPendingCount()
        this.notify()
    }

    public clearOutboxSessions() {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(OUTBOX_STORAGE_KEY)
        }
        this.status.pendingCount = 0
        this.notify()
    }

    /**
     * Lưu phiên chụp mới vào Outbox cục bộ và kích hoạt đồng bộ ngay
     */
    public queueSession(session: Omit<KioskOutboxSession, 'sync_status'>) {
        if (!ENABLE_BACKGROUND_SESSION_SYNC) return
        const sessions = this.getOutboxSessions()
        const newRecord: KioskOutboxSession = {
            ...session,
            sync_status: 'PENDING_SYNC',
        }

        const updated = [
            newRecord,
            ...sessions.filter((s) => s.id !== session.id),
        ]
        this.saveOutboxSessions(updated)

        // Thử đẩy lên Cloud ngay lập tức
        this.syncPendingSessions().catch(console.warn)
    }

    /**
     * Đẩy toàn bộ các phiên PENDING_SYNC lên Cloud CMS
     */
    public async syncPendingSessions(): Promise<{
        success: boolean
        syncedCount: number
        message: string
    }> {
        if (this.status.isSyncing) return { success: false, syncedCount: 0, message: 'Đang đồng bộ' }
        const sessions = this.getOutboxSessions()
        const pending = sessions.filter((s) => s.sync_status === 'PENDING_SYNC')

        if (pending.length === 0) {
            return {
                success: true,
                syncedCount: 0,
                message: 'Tất cả phiên chụp đã được đồng bộ',
            }
        }

        const token = this.getBearerToken()
        if (!token) {
            const msg = 'Thiết bị chưa được kích hoạt với Cloud CMS'
            this.notifySyncFailure('SYNC_SESSION_UNACTIVATED', msg, {
                pendingCount: pending.length,
            })
            return {
                success: false,
                syncedCount: 0,
                message: msg,
            }
        }

        this.status.isSyncing = true
        this.notify()

        const cmsUrl = this.getCmsUrl()
        const kioskId = this.getKioskId()
        const deviceBranchId = this.getDeviceConfig()?.branch_id || undefined

        try {
            const payload = {
                sessions: pending.map((s) => ({
                    id: s.id,
                    session_code: s.session_code || s.id,
                    pin_code: s.pin_code || null,
                    customer_name: s.customer_name || null,
                    customer_phone: s.customer_phone || null,
                    kiosk_id: s.kiosk_id || kioskId || undefined,
                    branch_id: s.branch_id || deviceBranchId,
                    layout_type: s.layout_type,
                    copies: s.copies,
                    total_amount: s.total_amount,
                    payment_method: s.payment_method,
                    coupon_code: s.coupon_code || null,
                    paper_consumed: s.paper_consumed,
                    storage_url: s.storage_url || null,
                    status: s.status || 'completed',
                    created_at: s.created_at,
                })),
            }

            const res = await fetch(`${cmsUrl}/api/kiosk/sessions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(15000),
            })

            if (res.status === 401) {
                const errMsg =
                    'Lỗi xác thực (HTTP 401): Token không hợp lệ hoặc Kiosk chưa kích hoạt'
                this.status.isSyncing = false
                this.status.lastError =
                    'Thiết bị chưa được xác thực (HTTP 401). Vui lòng kiểm tra mã kích hoạt Kiosk.'
                this.notify()
                this.notifySyncFailure('SYNC_SESSION_UNAUTHORIZED', errMsg, {
                    pendingCount: pending.length,
                })
                return {
                    success: false,
                    syncedCount: 0,
                    message: errMsg,
                }
            }

            if (!res.ok) {
                throw new Error(`Sync sessions failed: HTTP ${res.status}`)
            }

            const body = await res.json()
            const nowStr = new Date().toISOString()

            // Đánh dấu các phiên đã gửi thành SYNCED
            const pendingIds = new Set(pending.map((p) => p.id))
            if (body?.success !== true) throw new Error(body?.error || 'CMS chưa xác nhận đồng bộ')
            const sent = new Map(pending.map((s) => [s.id, JSON.stringify(s)]))
            const updatedSessions = this.getOutboxSessions().map((s) => {
                if (pendingIds.has(s.id) && sent.get(s.id) === JSON.stringify(s)) {
                    return {
                        ...s,
                        sync_status: 'SYNCED' as const,
                        synced_at: nowStr,
                    }
                }
                return s
            })

            this.saveOutboxSessions(updatedSessions)
            this.status.isSyncing = false
            this.status.isOnline = true
            this.status.lastSyncTime = new Date().toLocaleTimeString('vi-VN')
            this.status.lastError = null
            this.notify()

            return {
                success: true,
                syncedCount: pending.length,
                message:
                    body?.message ||
                    `Đã đồng bộ thành công ${pending.length} phiên chụp`,
            }
        } catch (err: any) {
            const errMsg = err?.message || 'Không thể kết nối đến máy chủ Cloud CMS'
            this.status.isSyncing = false
            this.status.lastError =
                err?.message || 'Lỗi kết nối khi đồng bộ phiên chụp'
            this.notify()
            this.notifySyncFailure('SYNC_SESSION_NETWORK_ERROR', errMsg, {
                pendingCount: pending.length,
            })
            return {
                success: false,
                syncedCount: 0,
                message: errMsg,
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. KÍCH HOẠT THIẾT BỊ BẰNG MÃ 6 SỐ (PAIRING CODE)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Gửi mã ghép nối 6 chữ số lên Cloud CMS để nhận Device Token và định danh Kiosk
     */
    public async activateDevice(
        code: string,
        customCmsUrl?: string
    ): Promise<{ success: boolean; data?: DeviceConfig; error?: string }> {
        const cmsUrl = (customCmsUrl || this.getCmsUrl()).replace(/\/$/, '')
        const cleanCode = code.trim()
        if (!cmsUrl) {
            const errMsg = 'Thiếu cấu hình URL máy chủ Cloud CMS (.env) để kích hoạt Kiosk'
            this.notifySyncFailure('ACTIVATE_MISSING_CMS_URL', errMsg)
            return { success: false, error: errMsg }
        }

        try {
            const res = await fetch(`${cmsUrl}/api/kiosk/activate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ code: cleanCode }),
            })

            const json = await res.json()
            if (!res.ok || !json.success) {
                const errMsg =
                    json.error || 'Mã kích hoạt không đúng hoặc đã hết hạn'
                this.notifySyncFailure('ACTIVATE_DEVICE_FAILED', errMsg, {
                    status: res.status,
                })
                return {
                    success: false,
                    error: errMsg,
                }
            }

            const cfg: DeviceConfig = {
                device_token: json.data.device_token,
                kiosk_id: json.data.kiosk_id,
                kiosk_name: json.data.kiosk_name,
                branch_id: json.data.branch_id,
                branch_name: json.data.branch_name,
                cms_url: cmsUrl,
                activated_at:
                    json.data.activated_at || new Date().toISOString(),
            }

            this.setDeviceConfig(cfg)
            if (customCmsUrl) this.setCmsUrl(customCmsUrl)

            // Gửi ngay 1 heartbeat để CMS nhận diện Online tức thì
            await this.sendHeartbeat()
            this.startWorker()

            return { success: true, data: cfg }
        } catch (err: any) {
            const errMsg =
                err?.message ||
                'Không thể kết nối đến máy chủ Cloud CMS. Vui lòng kiểm tra kết nối mạng.'
            this.notifySyncFailure('ACTIVATE_DEVICE_NETWORK_ERROR', errMsg)
            return {
                success: false,
                error: errMsg,
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 5. PAYMENT STATUS CHECK (CASSO WEBHOOK POLLING & REALTIME CALLBACK)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Tra cứu trạng thái thanh toán tự động thời gian thực từ Cloud CMS (SePay Webhook)
     */
    public async checkPaymentStatus(
        orderCode: string,
        amount?: number
    ): Promise<{ paid: boolean; transaction?: any }> {
        if (!orderCode) return { paid: false }

        try {
            const cmsUrl = this.getCmsUrl()
            const token = this.getBearerToken()
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            }
            if (token) {
                headers['Authorization'] = `Bearer ${token}`
            }

            const amountQuery = amount
                ? `&amount=${encodeURIComponent(amount)}`
                : ''
            const res = await fetch(
                `${cmsUrl}/api/kiosk/payments/check?orderCode=${encodeURIComponent(orderCode.trim().toUpperCase())}${amountQuery}`,
                {
                    method: 'GET',
                    headers,
                    signal: AbortSignal.timeout(3500),
                }
            )

            if (res.ok) {
                const json = await res.json()
                if (json && json.paid) {
                    return { paid: true, transaction: json.data }
                }
            }
        } catch {
            // Ngoại tuyến hoặc CMS chưa phản hồi
        }
        return { paid: false }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 6. FORCE SYNC (DÀNH CHO NÚT BẤM TẠI LOCAL ADMIN)
    // ──────────────────────────────────────────────────────────────────────────

    public async forceSyncNow(): Promise<{
        success: boolean
        message: string
        syncedCount: number
    }> {
        const hbOk = await this.sendHeartbeat()
        const syncRes = await this.syncPendingSessions()

        if (!hbOk && !syncRes.success) {
            return {
                success: false,
                message:
                    '❌ Không thể kết nối đến Cloud CMS. Vui lòng kiểm tra mạng hoặc khởi động CMS.',
                syncedCount: 0,
            }
        }

        if (syncRes.syncedCount > 0) {
            return {
                success: true,
                message: `✅ Đã gửi thành công ${syncRes.syncedCount} phiên chụp lên Cloud CMS!`,
                syncedCount: syncRes.syncedCount,
            }
        }

        return {
            success: true,
            message:
                '✅ Kết nối Cloud CMS thông suốt (Heartbeat OK). Không có phiên chụp tồn đọng!',
            syncedCount: 0,
        }
    }
}

export const cloudSyncService = CloudSyncService.getInstance()
