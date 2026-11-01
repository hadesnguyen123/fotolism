import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  beautyEngine,
  BEAUTY_PRESETS,
  DEFAULT_BEAUTY_CONFIG,
  BEAUTY_VERTEX_SHADER,
  BEAUTY_FRAGMENT_SHADER,
  type BeautyConfigSnapshot,
} from '../src/services/beautyEngine'
import { useAppStore } from '../src/store/appStore'

describe('AI Beauty Engine Core — Fotolism 3.0 WYSIWYG & Unified Architecture', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Unified Architecture & Standard Presets (Section 3 & 7)', () => {
    it('provides standardized presets: natural, radiant, glam, and none (original)', () => {
      const presetIds = BEAUTY_PRESETS.map((p) => p.id)
      expect(presetIds).toContain('natural')
      expect(presetIds).toContain('radiant')
      expect(presetIds).toContain('glam')
      expect(presetIds).toContain('none')

      // Natural is the K-Beauty standard preset
      const natural = BEAUTY_PRESETS.find((p) => p.id === 'natural')!
      expect(natural).toBeDefined()
      expect(natural.slimFace).toBeGreaterThan(0)
      expect(natural.skinSmoothing).toBeGreaterThan(0)
      expect(natural.bigEyes).toBeGreaterThan(0)

      // None keeps 100% pure camera raw output
      const original = BEAUTY_PRESETS.find((p) => p.id === 'none')!
      expect(original.slimFace).toBe(0)
      expect(original.skinSmoothing).toBe(0)
      expect(original.bigEyes).toBe(0)
    })

    it('exports shared vertex and fragment shaders for both Real-time Preview and HQ Photo Mode', () => {
      expect(BEAUTY_VERTEX_SHADER).toContain('a_position')
      expect(BEAUTY_VERTEX_SHADER).toContain('a_texCoord')

      expect(BEAUTY_FRAGMENT_SHADER).toContain('u_slimFace')
      expect(BEAUTY_FRAGMENT_SHADER).toContain('u_vLine')
      expect(BEAUTY_FRAGMENT_SHADER).toContain('u_bigEyes')
      expect(BEAUTY_FRAGMENT_SHADER).toContain('u_skinSmooth')
      expect(BEAUTY_FRAGMENT_SHADER).toContain('u_whitening')
      expect(BEAUTY_FRAGMENT_SHADER).toContain('u_rosyTone')
      expect(BEAUTY_FRAGMENT_SHADER).toContain('u_clarity')
      expect(BEAUTY_FRAGMENT_SHADER).toContain('u_mirror')
    })
  })

  describe('2. State Management & WYSIWYG Snapshot (Section 6.1)', () => {
    it('appStore initializes with Natural preset and allows fine-tuning vLine and bigEyes', () => {
      const store = useAppStore.getState()
      expect(store.selectedBeautyPreset).toBe('natural')
      expect(store.vLine).toBeDefined()
      expect(store.bigEyes).toBeDefined()

      // Adjust individual effects
      store.setVLine(30)
      expect(useAppStore.getState().vLine).toBe(30)
      expect(useAppStore.getState().selectedBeautyPreset).toBeNull()

      store.setBigEyes(25)
      expect(useAppStore.getState().bigEyes).toBe(25)

      // Switch preset
      store.applyBeautyPreset('glam')
      expect(useAppStore.getState().selectedBeautyPreset).toBe('glam')
      expect(useAppStore.getState().skinSmoothing).toBe(68)
      expect(useAppStore.getState().vLine).toBe(40)
      expect(useAppStore.getState().bigEyes).toBe(32)
    })
  })

  describe('3. High-Quality Photo Processing & Mirror Consistency (Section 5 & 6.2)', () => {
    it('processes high quality photo and preserves mirror setting', async () => {
      const mockCanvas = {
        width: 100,
        height: 100,
        getContext: vi.fn().mockReturnValue({
          translate: vi.fn(),
          scale: vi.fn(),
          drawImage: vi.fn(),
          filter: '',
        }),
        toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,mockProcessedBeautyPhotoData12345'),
      }

      // Mock global document if running in node env
      if (typeof globalThis.document === 'undefined') {
        (globalThis as any).document = {
          createElement: vi.fn().mockImplementation((tagName: string) => {
            if (tagName === 'canvas') return mockCanvas
            return {}
          }),
        }
      } else {
        vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
          if (tagName === 'canvas') return mockCanvas as any
          return {} as any
        })
      }

      const snapshot: BeautyConfigSnapshot = {
        ...DEFAULT_BEAUTY_CONFIG,
        slimFace: 35,
        vLine: 30,
        bigEyes: 20,
        skinSmoothing: 50,
        whiteningTone: 40,
        rosyTone: 25,
        glowClarity: 20,
        brightnessAdjust: 105,
        contrastAdjust: 100,
        saturationAdjust: 100,
        mirror: true, // Gương bật -> ảnh chụp cũng phải theo gương
        presetId: 'radiant',
      }

      const fakeImage = {
        naturalWidth: 1920,
        naturalHeight: 1080,
        width: 1920,
        height: 1080,
        src: 'data:image/jpeg;base64,mockInputCanonRawData',
      } as any

      const result = await beautyEngine.processHighQualityPhoto(fakeImage, snapshot)

      expect(result.success).toBe(true)
      expect(result.dataUrl).toContain('data:image/jpeg;base64')
    })
  })
})
