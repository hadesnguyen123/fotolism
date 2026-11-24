import { describe, expect, it } from 'vitest'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import type { CapturedPhoto } from '../src/store/slices/sessionSlice'
import {
    buildPhotoUrlCandidates,
    fromFileUrl,
    getBackupSlotFileName,
    getBackupSlotPublicPath,
    isResolvablePhotoSource,
    planMissingSlotsWithBackup,
    resolveBackupFrameVariant,
    toFileUrl,
} from '../src/lib/photoboothSlotIntegrity'

function makePhoto(slotNum: number, overrides: Partial<CapturedPhoto> = {}): CapturedPhoto {
    const raw = `F:\\Fotolism_image\\sessions\\s1\\raw\\fotolism_shot_${slotNum}_100${slotNum}.jpg`
    const enh = `file:///F:/Fotolism_image/sessions/s1/final/fotolism_enhanced_${slotNum}_100${slotNum}.jpg`
    return {
        id: `photo_100${slotNum}_${slotNum}`,
        rawPath: raw,
        enhancedPath: enh,
        compositedPath: enh,
        enhanceStatus: 'processed',
        timestamp: 1000 + slotNum,
        ...overrides,
    }
}

describe('photobooth slot integrity & branded backup images', () => {
    it('bundles 3 non-empty backup images for 2x6_4, 4x6_4 and 4x6_9 in public/backup-slots', () => {
        const variants = ['2x6_4', '4x6_4', '4x6_9'] as const
        for (const variant of variants) {
            const assetFile = path.resolve(__dirname, '..', 'public', 'backup-slots', getBackupSlotFileName(variant))
            expect(existsSync(assetFile)).toBe(true)
            expect(statSync(assetFile).size).toBeGreaterThan(1000)
        }
        expect(resolveBackupFrameVariant('2x6', 4)).toBe('2x6_4')
        expect(resolveBackupFrameVariant('4x6', 4)).toBe('4x6_4')
        expect(resolveBackupFrameVariant('4x6', 9)).toBe('4x6_9')
        expect(getBackupSlotPublicPath('2x6_4')).toBe('./backup-slots/backup_2x6_4.jpg')
    })

    it('normalizes file paths to file:/// and preserves static backup paths', () => {
        expect(toFileUrl('F:\\Fotolism_image\\sessions\\s1\\raw\\shot_2.jpg')).toBe(
            'file:///F:/Fotolism_image/sessions/s1/raw/shot_2.jpg'
        )
        expect(toFileUrl('file://F:/Fotolism_image/a.jpg')).toBe('file:///F:/Fotolism_image/a.jpg')
        expect(toFileUrl('./backup-slots/backup_4x6_4.jpg')).toBe('./backup-slots/backup_4x6_4.jpg')
        expect(fromFileUrl('file:///F:/Fotolism_image/a.jpg')).toBe('F:/Fotolism_image/a.jpg')
        expect(fromFileUrl('./backup-slots/backup_4x6_4.jpg')).toBe('')
        expect(fromFileUrl('data:image/jpeg;base64,abc')).toBe('')
        expect(isResolvablePhotoSource('photo_1234_2.jpg')).toBe(false)
        expect(isResolvablePhotoSource('./backup-slots/backup_4x6_4.jpg')).toBe(true)
        expect(isResolvablePhotoSource('F:\\Fotolism_image\\a.jpg')).toBe(true)
    })

    it('builds deduplicated fallback chain composited -> enhanced -> raw', () => {
        const candidates = buildPhotoUrlCandidates({
            compositedPath: 'file:///F:/Fotolism_image/final/2.jpg',
            enhancedPath: 'file://F:/Fotolism_image/final/2.jpg',
            rawPath: 'F:\\Fotolism_image\\raw\\2.jpg',
        })
        expect(candidates).toEqual([
            'file:///F:/Fotolism_image/final/2.jpg',
            'file:///F:/Fotolism_image/raw/2.jpg',
        ])
    })

    it('preserves captured slot positions and fills missing slots with 4x6_4 backup logo', () => {
        const p1 = makePhoto(1)
        const p3 = makePhoto(3)
        const { variant, filledSlots, backupPlans } = planMissingSlotsWithBackup(
            [p1, null, p3, null],
            '4x6',
            4,
            9999
        )
        expect(variant).toBe('4x6_4')
        expect(filledSlots).toHaveLength(4)
        expect(filledSlots[0]?.id).toBe(p1.id)
        expect(filledSlots[2]?.id).toBe(p3.id)
        expect(filledSlots[1]?.isBackup).toBe(true)
        expect(filledSlots[3]?.isBackup).toBe(true)
        expect(filledSlots[1]?.enhancedPath).toBe('./backup-slots/backup_4x6_4.jpg')
        expect(backupPlans.map((p) => p.slotIndex)).toEqual([1, 3])
    })

    it('uses 2x6_4 and 4x6_9 backup logos when slots are empty (including 0-photo case)', () => {
        const res2x6 = planMissingSlotsWithBackup([null, makePhoto(2), null, null], '2x6', 4, 111)
        expect(res2x6.variant).toBe('2x6_4')
        expect(res2x6.filledSlots[1]?.isBackup).toBeUndefined()
        expect(res2x6.filledSlots[0]?.enhancedPath).toBe('./backup-slots/backup_2x6_4.jpg')

        const res9 = planMissingSlotsWithBackup([], '4x6', 9, 222)
        expect(res9.variant).toBe('4x6_9')
        expect(res9.filledSlots).toHaveLength(9)
        expect(res9.backupPlans).toHaveLength(9)
        expect(res9.filledSlots[8]?.enhancedPath).toBe('./backup-slots/backup_4x6_9.jpg')
    })
})
