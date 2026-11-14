import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { assertEnhancedFile, enhancedFinalPath } from '../dist-electron/enhanceIntegrity.cjs'
import { AiEnhanceQueue } from '../dist-electron/aiEnhanceQueue.cjs'
import { isPhotoEnhanced } from '../src/lib/enhanceState'

const directories: string[] = []
afterEach(() => directories.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })))

describe('enhance final integrity', () => {
    it('rejects missing, empty, same-path and renamed RAW outputs', () => {
        const dir = mkdtempSync(path.join(tmpdir(), 'fotolism-enhance-'))
        directories.push(dir)
        const raw = path.join(dir, 'raw.jpg')
        const enhanced = path.join(dir, 'enhanced.jpg')
        writeFileSync(raw, 'raw bytes')
        expect(() => assertEnhancedFile(raw, enhanced)).toThrow()
        expect(() => assertEnhancedFile(raw, raw)).toThrow()
        writeFileSync(enhanced, '')
        expect(() => assertEnhancedFile(raw, enhanced)).toThrow()
        writeFileSync(enhanced, 'raw bytes')
        expect(() => assertEnhancedFile(raw, enhanced)).toThrow()
        writeFileSync(enhanced, 'AI result')
        expect(() => assertEnhancedFile(raw, enhanced)).not.toThrow()
    })

    it('reuses the AI file in final instead of creating a second name', () => {
        const dir = path.resolve('sessions', 'test', 'final')
        const source = path.join(dir, 'fotolism_enhanced_1_123.jpg')
        expect(enhancedFinalPath(source, dir, 'fotolism_enhanced_1.jpg')).toBe(source)
        const external = path.resolve('working', 'enhanced.jpg')
        expect(enhancedFinalPath(external, dir, 'fotolism_enhanced_1.jpg'))
            .toBe(path.join(dir, 'fotolism_enhanced_1.jpg'))
    })

    it('does not accept filename-only or processed RAW as AI', () => {
        const photo = { id: '1', timestamp: 1, rawPath: 'F:/raw.jpg', enhancedPath: 'file:///F:/final/enhanced.jpg', compositedPath: '' }
        expect(isPhotoEnhanced(photo)).toBe(false)
        expect(isPhotoEnhanced({ ...photo, enhanceStatus: 'failed' })).toBe(false)
        expect(isPhotoEnhanced({ ...photo, enhanceStatus: 'processed' })).toBe(true)
        expect(isPhotoEnhanced({ ...photo, enhanceStatus: 'processed', enhancedPath: 'file:///F:/raw.jpg' })).toBe(false)
    })

    it('shares pending requests and runs the next job after a failure', async () => {
        const queue = new AiEnhanceQueue()
        let release!: () => void
        const first = queue.run('capture-1', () => new Promise<void>(resolve => { release = resolve }))
        expect(queue.run('capture-1', async () => { throw Error('duplicate') })).toBe(first)
        const order: string[] = []
        const failed = queue.run('capture-2', async () => { order.push('2'); throw Error('AI failed') })
        const recovered = queue.run('capture-3', async () => { order.push('3'); return 'processed' })
        await Promise.resolve()
        expect(order).toEqual([])
        release()
        await first
        await expect(failed).rejects.toThrow('AI failed')
        expect(await recovered).toBe('processed')
        expect(order).toEqual(['2', '3'])
    })
})
