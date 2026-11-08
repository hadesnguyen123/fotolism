import { describe, it, expect } from 'vitest'
import {
  C1_RAW_FOLDER_NAME,
  C1_DEFAULT_RAW_DIR,
  C1_DEFAULT_EXPORT_DIR,
  C1_PROCESSING_TIMEOUT_MS,
  C1_INTEGRATION_ENABLED_DEFAULT,
} from '../src/lib/constants'
import { mockApi } from '../src/lib/api'

describe('Capture One (C1) Hot Folder Integration — Fotolism Photobooth', () => {
  it('C1-01: C1 Constants are properly configured', () => {
    expect(C1_INTEGRATION_ENABLED_DEFAULT).toBe(true)
    expect(C1_RAW_FOLDER_NAME).toBe('Fotolism_raw')
    expect(C1_DEFAULT_RAW_DIR).toContain('Fotolism_raw')
    expect(C1_DEFAULT_EXPORT_DIR).toContain('c1_processed')
    expect(C1_PROCESSING_TIMEOUT_MS).toBeGreaterThanOrEqual(3000)
    expect(C1_PROCESSING_TIMEOUT_MS).toBeLessThanOrEqual(10000)
  })

  it('C1-02: storage.c1GetPaths returns hot folder directories', async () => {
    const res = await mockApi.storage.c1GetPaths()
    expect(res.success).toBe(true)
    expect(res.data?.rawDir).toBeDefined()
    expect(res.data?.exportDir).toBeDefined()
    expect(res.data?.rawDir).toContain('Fotolism_raw')
    expect(res.data?.exportDir).toContain('c1_processed')
  })

  it('C1-03: storage.c1SaveRaw successfully saves raw shot for C1 consumption', async () => {
    const dummyDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
    const fileName = 'fotolism_shot_1_test.jpg'
    const res = await mockApi.storage.c1SaveRaw(dummyDataUrl, fileName)
    expect(res.success).toBe(true)
    expect(res.data?.savedPath).toContain(fileName)
  })

  it('C1-04: storage.c1WaitPhoto handles timeout gracefully with fallback', async () => {
    const res = await mockApi.storage.c1WaitPhoto({
      fileName: 'fotolism_shot_nonexistent.jpg',
      timestamp: Date.now(),
      timeoutMs: 500,
    })
    // Mock should return failure/timeout gracefully so Photobooth can fall back without blocking
    expect(res.success).toBe(false)
    expect(res.error).toBeDefined()
  })

  it('C1-05: Simulation of Photobooth Slot update with C1 filtered photo', () => {
    const initialSlot = {
      id: 'photo_1',
      rawPath: 'F:\\Fotolism_raw\\shot_1.jpg',
      enhancedPath: 'data:image/jpeg;base64,cameraRaw',
      compositedPath: 'data:image/jpeg;base64,cameraRaw',
      timestamp: Date.now(),
    }

    const c1Exported = {
      filePath: 'F:\\Fotolism_image\\c1_processed\\shot_1.jpg',
      dataUrl: 'data:image/jpeg;base64,c1BakedFilter',
    }

    // When C1 finishes, it updates the slot
    const updatedSlot = {
      ...initialSlot,
      rawPath: c1Exported.filePath,
      enhancedPath: c1Exported.dataUrl,
      compositedPath: c1Exported.dataUrl,
    }

    expect(updatedSlot.enhancedPath).toBe('data:image/jpeg;base64,c1BakedFilter')
    expect(updatedSlot.rawPath).toContain('c1_processed')
  })
})
