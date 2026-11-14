import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { cloudSyncService as sync, type KioskOutboxSession } from '../src/services/cloudSyncService'
const data = new Map<string, string>()
const session = (id: string): KioskOutboxSession => ({ id, session_code: id, kiosk_id: 'test', layout_type: '4x6', copies: 1, total_amount: 0, payment_method: 'cash', paper_consumed: 0, status: 'completed', created_at: '2020-01-01', sync_status: 'PENDING_SYNC' })
beforeEach(() => {
 data.clear()
 vi.spyOn(sync, 'startWorker').mockImplementation(() => {})
 vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string,v: string) => data.set(k,v), removeItem: (k: string) => data.delete(k) })
 sync.setDeviceConfig({ device_token: 'test', kiosk_id: 'test' })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('retains unsynced sessions beyond retention period', () => {
 sync.saveOutboxSessions([session('old')]); sync.purgeOldSessions(7)
 expect(sync.getOutboxSessions()).toHaveLength(1)
})
it('preserves new and modified records arriving during sync', async () => {
 let finish!: (v: unknown) => void
 vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve })))
 sync.saveOutboxSessions([session('a')])
 const pending = sync.syncPendingSessions()
 sync.saveOutboxSessions([{ ...session('a'), storage_url: 'new-gallery' },session('b')])
 finish({ ok: true, json: async () => ({ success: true }) })
 await pending
 expect(sync.getOutboxSessions().map(s => [s.id,s.sync_status])).toEqual([['a','PENDING_SYNC'],['b','PENDING_SYNC']])
})
it('does not mark a rejected acknowledgement as synced', async () => {
 vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: false }) })))
 sync.saveOutboxSessions([session('a')])
 expect((await sync.syncPendingSessions()).success).toBe(false)
 expect(sync.getOutboxSessions()[0].sync_status).toBe('PENDING_SYNC')
})
