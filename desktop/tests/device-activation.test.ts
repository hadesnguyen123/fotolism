import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cloudSyncService } from '../src/services/cloudSyncService'
import { useAppStore } from '../src/store/appStore'

// Simple in-memory localStorage mock for node environment
const createLocalStorageMock = () => {
    let store: Record<string, string> = {}
    return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
            store[key] = value.toString()
        },
        removeItem: (key: string) => {
            delete store[key]
        },
        clear: () => {
            store = {}
        },
    }
}

describe('Device Activation & M2M Token Authentication', () => {
    let mockStorage: ReturnType<typeof createLocalStorageMock>

    beforeEach(() => {
        vi.restoreAllMocks()
        mockStorage = createLocalStorageMock()
        ;(globalThis as any).localStorage = mockStorage
        ;(globalThis as any).window = globalThis
        delete (globalThis as any).device
    })

    afterEach(() => {
        vi.restoreAllMocks()
        mockStorage.clear()
    })

    describe('cloudSyncService M2M Token handling', () => {
        it('sets and retrieves device config and bearer token correctly', () => {
            cloudSyncService.setDeviceConfig({
                device_token: 'jb_tok_test_abc123',
                kiosk_id: 'kiosk_01',
                branch_id: 'branch_hn_01',
                kiosk_name: 'Fotolism Kiosk Test',
                cms_url: 'https://fotolism-cms.vercel.app',
                activated_at: new Date().toISOString(),
            })

            expect(cloudSyncService.getBearerToken()).toBe('jb_tok_test_abc123')
            expect(cloudSyncService.getDeviceConfig()?.kiosk_id).toBe(
                'kiosk_01'
            )
        })

        it('attaches Authorization Bearer header when sending heartbeat', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ success: true }),
            })
            globalThis.fetch = mockFetch

            cloudSyncService.setDeviceConfig({
                device_token: 'jb_tok_test_auth_header',
                kiosk_id: 'kiosk_01',
                branch_id: 'branch_hn_01',
                kiosk_name: 'Fotolism Kiosk Test',
                cms_url: 'https://fotolism-cms.vercel.app',
                activated_at: new Date().toISOString(),
            })

            const result = await cloudSyncService.sendHeartbeat()
            expect(result).toBe(true)
            expect(mockFetch).toHaveBeenCalledTimes(1)

            const [url, options] = mockFetch.mock.calls[0]
            expect(url).toBe(
                'https://fotolism-cms.vercel.app/api/kiosk/heartbeat'
            )
            expect(options.headers).toMatchObject({
                'Content-Type': 'application/json',
                Authorization: 'Bearer jb_tok_test_auth_header',
            })
        })

        it('activates device successfully with 6-digit code', async () => {
            const mockResponse = {
                success: true,
                message:
                    'Kích hoạt thành công Kiosk [Fotolism Vincom Bà Triệu]',
                data: {
                    device_token: 'jb_tok_activated_999',
                    kiosk_id: 'kiosk_01',
                    branch_id: 'branch_hn_01',
                    kiosk_name: 'Fotolism Vincom Bà Triệu',
                    branch_name: 'Vincom Bà Triệu - Hà Nội',
                    activated_at: '2026-10-25T16:00:00Z',
                },
            }

            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => mockResponse,
            })
            globalThis.fetch = mockFetch

            const result = await cloudSyncService.activateDevice(
                '849201',
                'https://fotolism-cms.vercel.app'
            )

            expect(result.success).toBe(true)
            expect(result.data?.device_token).toBe('jb_tok_activated_999')
            expect(cloudSyncService.getBearerToken()).toBe(
                'jb_tok_activated_999'
            )

            // Verify request payload
            expect(mockFetch).toHaveBeenCalledWith(
                'https://fotolism-cms.vercel.app/api/kiosk/activate',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: '849201' }),
                })
            )
        })

        it('activates offline Dev Mode with code 888888 when CMS is unreachable', async () => {
            // Mock network failure when contacting CMS
            globalThis.fetch = vi
                .fn()
                .mockRejectedValue(new Error('Failed to fetch (offline)'))

            const result = await cloudSyncService.activateDevice(
                '888888',
                'https://fotolism-cms.vercel.app'
            )
            expect(result.success).toBe(true)
            expect(result.data?.device_token).toBe('jb_tok_dev_888888_test')
            expect(result.data?.kiosk_id).toBe('kiosk_01')
            expect(cloudSyncService.getBearerToken()).toBe(
                'jb_tok_dev_888888_test'
            )
        })
    })

    describe('useAppStore Device Activation State', () => {
        it('initializes to "activate" screen if no device_token exists', async () => {
            const store = useAppStore.getState()

            // Simulate no config in electron or localStorage
            const config = await store.loadDeviceConfig()
            expect(config).toBeNull()
            expect(useAppStore.getState().isDeviceActivated).toBe(false)
            expect(useAppStore.getState().screen).toBe('activate')
        })

        it('initializes to "idle" screen if device_token already exists', async () => {
            const existingConfig = {
                device_token: 'jb_tok_existing_111',
                kiosk_id: 'kiosk_01',
                branch_id: 'branch_hn_01',
                kiosk_name: 'Fotolism Kiosk Existing',
                cms_url: 'https://fotolism-cms.vercel.app',
                activated_at: new Date().toISOString(),
            }

            // Mock localStorage fallback
            mockStorage.setItem(
                'fotolism_device_config',
                JSON.stringify(existingConfig)
            )

            const store = useAppStore.getState()
            const loaded = await store.loadDeviceConfig()

            expect(loaded).not.toBeNull()
            expect(loaded?.device_token).toBe('jb_tok_existing_111')
            expect(useAppStore.getState().isDeviceActivated).toBe(true)
            expect(useAppStore.getState().screen).toBe('idle')
        })

        it('resets device config and transitions back to "activate" screen', async () => {
            const existingConfig = {
                device_token: 'jb_tok_existing_222',
                kiosk_id: 'kiosk_01',
                branch_id: 'branch_hn_01',
                kiosk_name: 'Fotolism Kiosk Existing',
                cms_url: 'https://fotolism-cms.vercel.app',
                activated_at: new Date().toISOString(),
            }
            mockStorage.setItem(
                'fotolism_device_config',
                JSON.stringify(existingConfig)
            )

            const store = useAppStore.getState()
            await store.loadDeviceConfig()
            expect(useAppStore.getState().isDeviceActivated).toBe(true)

            // Trigger reset
            await store.resetDeviceConfig()
            expect(useAppStore.getState().deviceConfig).toBeNull()
            expect(useAppStore.getState().isDeviceActivated).toBe(false)
            expect(useAppStore.getState().screen).toBe('activate')
        })
    })
})
