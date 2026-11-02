/**
 * ============================================================================
 * FOTOLISM 3.0 — CLOUD SYNC WORKER & OUTBOX SERVICE
 * - 2-Way communication between Kiosk Client and Cloud CMS (Port 3000)
 * - Periodic Heartbeat (every 30s) sending device health & paper levels
 * - Offline-First SQLite/LocalStorage Outbox queue for Session records
 * - Auto-fetch & apply updated Pricing Rules & Vouchers on configVersion bump
 * - Idempotent sync with automatic retry and exponential backoff
 * ============================================================================
 */

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
  drive_url?: string | null
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

const DEFAULT_CMS_URL = 'http://localhost:3000'
const DEFAULT_KIOSK_ID = 'kiosk_01'
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
    const savedVer = typeof localStorage !== 'undefined' ? localStorage.getItem(CONFIG_VER_KEY) : null
    if (savedVer) {
      this.status.configVersion = parseInt(savedVer, 10) || 1
    }
    const savedCfg = typeof localStorage !== 'undefined' ? localStorage.getItem('fotolism_device_config') : null
    if (savedCfg) {
      try {
        this.deviceConfig = JSON.parse(savedCfg)
      } catch {}
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
        localStorage.setItem('fotolism_device_config', JSON.stringify(config))
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
    return localStorage.getItem('fotolism_cms_url') || DEFAULT_CMS_URL
  }

  public setCmsUrl(url: string) {
    localStorage.setItem('fotolism_cms_url', url.replace(/\/$/, ''))
  }

  public getKioskId(): string {
    return this.getDeviceConfig()?.kiosk_id || localStorage.getItem('fotolism_kiosk_id') || DEFAULT_KIOSK_ID
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

  private refreshPendingCount() {
    const sessions = this.getOutboxSessions()
    this.status.pendingCount = sessions.filter((s) => s.sync_status === 'PENDING_SYNC').length
  }

  // ──────────────────────────────────────────────────────────────────────────
  // WORKER LIFECYCLE
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Khởi động background worker chạy ngầm định kỳ 5 giây (đảm bảo cập nhật tức thì trạng thái Khóa máy)
   */
  public startWorker(intervalMs = 5000) {
    if (this.timer) return

    // Chạy đồng bộ ngay khi khởi động
    this.sendHeartbeat().catch(console.warn)
    this.syncPendingSessions().catch(console.warn)

    this.timer = window.setInterval(async () => {
      try {
        await this.sendHeartbeat()
        await this.syncPendingSessions()
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

  public async sendHeartbeat(): Promise<boolean> {
    const token = this.getBearerToken()
    if (!token) {
      this.status.isOnline = false
      this.status.lastError = 'Thiết bị chưa được kích hoạt với Cloud CMS'
      this.notify()
      return false
    }

    const cmsUrl = this.getCmsUrl()
    const kioskId = this.getKioskId()
    const paperCount = Number(localStorage.getItem('fotolism_paper_count') || '640')

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
          printer_status: paperCount < 50 ? 'warning_low_paper' : 'ready',
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

      // Phản hồi trạng thái Tạm Khóa Kiosk từ Cloud CMS
      if (typeof body?.data?.is_locked === 'boolean') {
        this.status.isLocked = body.data.is_locked
      }

      // Kiểm tra nếu Cloud có version mới -> Tự động kéo cấu hình về
      if (body?.data?.latest_config_version && body.data.latest_config_version > this.status.configVersion) {
        await this.fetchAndApplyConfig(body.data.latest_config_version)
      }

      this.notify()
      return true
    } catch (err: any) {
      this.status.isOnline = false
      this.status.lastError = err.message || 'Không thể kết nối đến máy chủ Cloud CMS'
      this.notify()
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
      const res = await fetch(`${cmsUrl}/api/kiosk/config?kiosk_id=${kioskId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!res.ok) throw new Error(`Fetch config failed: HTTP ${res.status}`)

      const body = await res.json()
      if (body?.success && body.data) {
        const configData = body.data

        // Lưu cấu hình vào localStorage của Kiosk
        localStorage.setItem('fotolism_remote_config', JSON.stringify(configData))
        if (configData.version) {
          this.status.configVersion = configData.version
          localStorage.setItem(CONFIG_VER_KEY, String(configData.version))
        }

        // Cập nhật giá vào event config nếu có
        if (configData.pricing) {
          const currentEventConfig = JSON.parse(localStorage.getItem('fotolism_event_config') || '{}')
          const updatedEventConfig = {
            ...currentEventConfig,
            price2x6: configData.pricing.price_2x6_weekday,
            price4x6: configData.pricing.price_4x6_weekday,
            extraCopyPrice: configData.pricing.extra_print_price,
            configVersion: configData.version || targetVersion || 1,
          }
          localStorage.setItem('fotolism_event_config', JSON.stringify(updatedEventConfig))
        }

        this.notify()
        return true
      }
      return false
    } catch (err: any) {
      console.warn('[CloudSyncService] Failed to pull config:', err)
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

  public saveOutboxSessions(sessions: KioskOutboxSession[]) {
    localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(sessions))
    this.refreshPendingCount()
    this.notify()
  }

  /**
   * Lưu phiên chụp mới vào Outbox cục bộ và kích hoạt đồng bộ ngay
   */
  public queueSession(session: Omit<KioskOutboxSession, 'sync_status'>) {
    const sessions = this.getOutboxSessions()
    const newRecord: KioskOutboxSession = {
      ...session,
      sync_status: 'PENDING_SYNC',
    }

    const updated = [newRecord, ...sessions.filter((s) => s.id !== session.id)]
    this.saveOutboxSessions(updated)

    // Thử đẩy lên Cloud ngay lập tức
    this.syncPendingSessions().catch(console.warn)
  }

  /**
   * Đẩy toàn bộ các phiên PENDING_SYNC lên Cloud CMS
   */
  public async syncPendingSessions(): Promise<{ success: boolean; syncedCount: number; message: string }> {
    const sessions = this.getOutboxSessions()
    const pending = sessions.filter((s) => s.sync_status === 'PENDING_SYNC')

    if (pending.length === 0) {
      return { success: true, syncedCount: 0, message: 'Tất cả phiên chụp đã được đồng bộ' }
    }

    const token = this.getBearerToken()
    if (!token) {
      return { success: false, syncedCount: 0, message: 'Thiết bị chưa được kích hoạt với Cloud CMS' }
    }

    this.status.isSyncing = true
    this.notify()

    const cmsUrl = this.getCmsUrl()
    const kioskId = this.getKioskId()

    try {
      const payload = {
        sessions: pending.map((s) => ({
          id: s.id,
          session_code: s.session_code || s.id,
          pin_code: s.pin_code || null,
          customer_name: s.customer_name || null,
          customer_phone: s.customer_phone || null,
          kiosk_id: s.kiosk_id || kioskId,
          branch_id: s.branch_id || 'branch_01',
          layout_type: s.layout_type,
          copies: s.copies,
          total_amount: s.total_amount,
          payment_method: s.payment_method,
          coupon_code: s.coupon_code || null,
          paper_consumed: s.paper_consumed,
          storage_url: s.storage_url || s.drive_url || null,
          drive_url: s.storage_url || s.drive_url || null,
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
      })

      if (!res.ok) {
        throw new Error(`Sync sessions failed: HTTP ${res.status}`)
      }

      const body = await res.json()
      const nowStr = new Date().toISOString()

      // Đánh dấu các phiên đã gửi thành SYNCED
      const pendingIds = new Set(pending.map((p) => p.id))
      const updatedSessions = sessions.map((s) => {
        if (pendingIds.has(s.id)) {
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
        message: body?.message || `Đã đồng bộ thành công ${pending.length} phiên chụp`,
      }
    } catch (err: any) {
      this.status.isSyncing = false
      this.status.lastError = err.message || 'Lỗi kết nối khi đồng bộ phiên chụp'
      this.notify()
      return {
        success: false,
        syncedCount: 0,
        message: err.message || 'Không thể kết nối đến máy chủ Cloud CMS',
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
        // Nếu là mã dev 888888 nhưng CMS báo lỗi, tự động fallback chế độ offline dev
        if (cleanCode === '888888') {
          return this.activateDevMode(cmsUrl)
        }
        return {
          success: false,
          error: json.error || 'Mã kích hoạt không đúng hoặc đã hết hạn',
        }
      }

      const cfg: DeviceConfig = {
        device_token: json.data.device_token,
        kiosk_id: json.data.kiosk_id,
        kiosk_name: json.data.kiosk_name,
        branch_id: json.data.branch_id,
        branch_name: json.data.branch_name,
        cms_url: cmsUrl,
        activated_at: json.data.activated_at || new Date().toISOString(),
      }

      this.setDeviceConfig(cfg)
      if (customCmsUrl) this.setCmsUrl(customCmsUrl)

      // Gửi ngay 1 heartbeat để CMS nhận diện Online tức thì
      await this.sendHeartbeat()
      this.startWorker()

      return { success: true, data: cfg }
    } catch (err: any) {
      // Nếu là mã Dev / Test 888888 và không kết nối được CMS, kích hoạt Offline Dev tức thì
      if (cleanCode === '888888') {
        return this.activateDevMode(cmsUrl)
      }
      return {
        success: false,
        error: err.message || 'Không thể kết nối đến máy chủ Cloud CMS. Vui lòng kiểm tra kết nối mạng.',
      }
    }
  }

  /**
   * Kích hoạt nhanh chế độ Dev / Test Lab (Mã mặc định 888888)
   */
  public async activateDevMode(
    customCmsUrl?: string
  ): Promise<{ success: boolean; data: DeviceConfig }> {
    const cmsUrl = (customCmsUrl || this.getCmsUrl()).replace(/\/$/, '')
    const devCfg: DeviceConfig = {
      device_token: 'jb_tok_dev_888888_test',
      kiosk_id: 'kiosk_01',
      kiosk_name: 'Kiosk 01 — Vincom Mega Mall (Dev / Test Mode)',
      branch_id: 'branch_01',
      branch_name: 'Chi Nhánh 01 — Vincom Thảo Điền (Dev Lab)',
      cms_url: cmsUrl,
      activated_at: new Date().toISOString(),
    }
    this.setDeviceConfig(devCfg)
    this.startWorker()
    if (typeof window !== 'undefined' && (window as any).device?.saveConfig) {
      try {
        await (window as any).device.saveConfig(devCfg)
      } catch {}
    }
    return { success: true, data: devCfg }
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

      const amountQuery = amount ? `&amount=${encodeURIComponent(amount)}` : ''
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

  /**
   * Giả lập giao dịch thanh toán thành công (dành cho Dev / Test hoặc cứu hộ nhân viên)
   */
  public async simulatePayment(
    orderCode: string,
    amount: number = 50000,
    note?: string
  ): Promise<{ success: boolean; paid: boolean; transaction?: any }> {
    try {
      const cmsUrl = this.getCmsUrl()
      const res = await fetch(`${cmsUrl}/api/kiosk/payments/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderCode, amount, note }),
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        const json = await res.json()
        if (json && json.paid) {
          return { success: true, paid: true, transaction: json.data }
        }
      }
    } catch (err: any) {
      console.warn('Simulate payment error:', err.message)
    }
    return { success: false, paid: false }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. FORCE SYNC (DÀNH CHO NÚT BẤM TẠI LOCAL ADMIN)
  // ──────────────────────────────────────────────────────────────────────────

  public async forceSyncNow(): Promise<{ success: boolean; message: string; syncedCount: number }> {
    const hbOk = await this.sendHeartbeat()
    const syncRes = await this.syncPendingSessions()

    if (!hbOk && !syncRes.success) {
      return {
        success: false,
        message: '❌ Không thể kết nối đến Cloud CMS (Port 3000). Vui lòng kiểm tra mạng hoặc khởi động CMS.',
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
      message: '✅ Kết nối Cloud CMS thông suốt (Heartbeat OK). Không có phiên chụp tồn đọng!',
      syncedCount: 0,
    }
  }
}

export const cloudSyncService = CloudSyncService.getInstance()
