/**
 * @file photoboothSlotIntegrity.ts
 * Tiện ích thuần khiết bảo đảm tính toàn vẹn từng ô ảnh Photobooth từ lúc chụp, xóa/chụp lại
 * cho tới khi chèn ảnh backup có logo Fotolism vào các ô chưa chụp và hiển thị dự phòng trên Frame.
 * Phụ thuộc: store/slices/sessionSlice.
 */

import type { CapturedPhoto } from '../store/slices/sessionSlice'

export type BackupFrameVariant = '2x6_4' | '4x6_4' | '4x6_9'

/**
 * Xác định biến thể ảnh backup tương ứng 3 loại khung Photobooth chuẩn (2x6 4 ảnh, 4x6 4 ảnh, 4x6 9 ảnh).
 *
 * @param frameSize Khổ giấy in (`'2x6'` hoặc `'4x6'`).
 * @param totalShots Số ô ảnh của layout (`4` hoặc `9`).
 */
export function resolveBackupFrameVariant(
    frameSize: string,
    totalShots: number
): BackupFrameVariant {
    if (frameSize === '2x6') return '2x6_4'
    if (totalShots === 9) return '4x6_9'
    return '4x6_4'
}

/**
 * Trả về tên tệp và đường dẫn public tĩnh của ảnh backup có logo Fotolism cho biến thể khung tương ứng.
 */
export function getBackupSlotFileName(variant: BackupFrameVariant): string {
    return `backup_${variant}.jpg`
}

export function getBackupSlotPublicPath(variant: BackupFrameVariant): string {
    return `./backup-slots/${getBackupSlotFileName(variant)}`
}

/**
 * Chuẩn hóa đường dẫn tệp cục bộ Windows/POSIX sang URL `file:///` hợp lệ cho Chromium,
 * giữ nguyên nếu là `data:`, `blob:`, `http://`, `https://` hoặc asset web tương đối `./`.
 *
 * @param filePath Đường dẫn tệp cục bộ hoặc URL sẵn có.
 * @returns Chuỗi URL sẵn sàng gắn vào `<img src>` hoặc chuỗi rỗng nếu không hợp lệ.
 */
export function toFileUrl(filePath?: string | null): string {
    const trimmed = (filePath || '').trim()
    if (!trimmed) return ''
    if (/^(data:|blob:|https?:|\.\/)/i.test(trimmed)) return trimmed
    if (/^\/backup-slots\//i.test(trimmed)) return `.${trimmed}`
    const stripped = trimmed.replace(/^file:\/+/i, '').replace(/\\/g, '/').replace(/^\/+/, '')
    if (!stripped) return ''
    return `file:///${stripped}`
}

/**
 * Tách đường dẫn hệ thống tệp thuần từ URL `file:///` hoặc đường dẫn gốc.
 * Trả về chuỗi rỗng nếu giá trị là `data:` / `blob:` / `http:` / `./` hoặc tên giả không có thư mục.
 *
 * @param value URL hoặc đường dẫn cần chuẩn hóa về path đĩa.
 * @returns Đường dẫn trên đĩa (hoặc chuỗi rỗng nếu không phải tệp cục bộ).
 */
export function fromFileUrl(value?: string | null): string {
    const trimmed = (value || '').trim()
    if (!trimmed || /^(data:|blob:|https?:|\.\/)/i.test(trimmed)) return ''
    if (/^file:/i.test(trimmed)) {
        return trimmed.replace(/^file:\/+/i, '').replace(/^\/+/, '')
    }
    return trimmed
}

/**
 * Kiểm tra chuỗi có trỏ tới nguồn ảnh hợp lệ (URL `data:`, `file://`, `http`, asset `./`, hoặc path có thư mục/tên ổ đĩa),
 * loại bỏ các chuỗi giả như `photo_1234_2.jpg` không tồn tại trên đĩa.
 */
export function isResolvablePhotoSource(value?: string | null): boolean {
    const trimmed = (value || '').trim()
    if (!trimmed) return false
    if (/^(data:image|blob:|https?:|file:\/+|\.?\/backup-slots\/)/i.test(trimmed)) return true
    return /^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith('/') || trimmed.includes('\\')
}

/**
 * Tạo danh sách các URL ứng viên theo thứ tự ưu tiên từ cao đến thấp để hiển thị trong khung ảnh,
 * loại bỏ trùng lặp và chuẩn hóa `file:///`.
 *
 * @param photo Bản ghi ảnh của một ô slot.
 * @returns Mảng URL ứng viên (`compositedPath -> enhancedPath -> rawPath`).
 */
export function buildPhotoUrlCandidates(
    photo?: Partial<CapturedPhoto> | null
): string[] {
    if (!photo) return []
    const rawCandidates = [
        photo.compositedPath,
        photo.enhancedPath,
        photo.rawPath,
    ]
    const seen = new Set<string>()
    const result: string[] = []
    for (const item of rawCandidates) {
        if (!isResolvablePhotoSource(item)) continue
        const normalized = toFileUrl(item)
        if (normalized && !seen.has(normalized)) {
            seen.add(normalized)
            result.push(normalized)
        }
    }
    return result
}

export interface BackupSlotPlanItem {
    slotIndex: number
    variant: BackupFrameVariant
    backupPhoto: CapturedPhoto
}

/**
 * Bảo toàn nguyên vẹn vị trí các ô khách đã chụp trong mảng `0..totalShots-1` và lập kế hoạch
 * chèn ảnh backup (chứa logo Fotolism đúng tỉ lệ khung `2x6_4` / `4x6_4` / `4x6_9`) vào mọi ô chưa chụp.
 *
 * @param slots Mảng slots hiện tại (có thể chứa `null` ở các ô chưa chụp hoặc vừa xóa chưa chụp lại).
 * @param frameSize Khổ giấy in (`'2x6'` hoặc `'4x6'`).
 * @param totalShots Tổng số ô ảnh của layout (`4` hoặc `9`).
 * @param timestamp Dấu thời gian dùng tạo `id` duy nhất cho từng ô backup.
 */
export function planMissingSlotsWithBackup(
    slots: ReadonlyArray<CapturedPhoto | null | undefined>,
    frameSize: string,
    totalShots: number,
    timestamp: number = Date.now()
): {
    variant: BackupFrameVariant
    filledSlots: CapturedPhoto[]
    backupPlans: BackupSlotPlanItem[]
} {
    const normalizedLength = Math.max(0, totalShots)
    const variant = resolveBackupFrameVariant(frameSize, normalizedLength)
    const publicBackupUrl = getBackupSlotPublicPath(variant)
    const filledSlots: CapturedPhoto[] = []
    const backupPlans: BackupSlotPlanItem[] = []

    for (let i = 0; i < normalizedLength; i++) {
        const existing = slots[i]
        if (
            existing &&
            (isResolvablePhotoSource(existing.rawPath) ||
                isResolvablePhotoSource(existing.enhancedPath) ||
                isResolvablePhotoSource(existing.compositedPath))
        ) {
            filledSlots.push(existing)
            continue
        }

        const backupPhoto: CapturedPhoto = {
            id: `backup_slot_${i + 1}_${timestamp}`,
            rawPath: '',
            enhancedPath: publicBackupUrl,
            compositedPath: publicBackupUrl,
            enhanceStatus: 'processed',
            isBackup: true,
            timestamp,
        }
        filledSlots.push(backupPhoto)
        backupPlans.push({
            slotIndex: i,
            variant,
            backupPhoto,
        })
    }

    return { variant, filledSlots, backupPlans }
}
