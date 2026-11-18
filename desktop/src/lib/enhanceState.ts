/**
 * @file enhanceState.ts
 * Tiện ích kiểm tra trạng thái xử lý AI của ảnh đã hoàn thành và khác biệt với ảnh gốc RAW hay chưa.
 * Phụ thuộc: store/slices/sessionSlice.
 */

import type { CapturedPhoto } from '../store/slices/sessionSlice'

/**
 * Kiểm tra ảnh đã qua xử lý AI thành công và có đường dẫn hợp lệ khác ảnh gốc RAW.
 * @param photo Bản ghi ảnh đã chụp trong phiên.
 * @returns true nếu ảnh AI hợp lệ, false nếu chưa xử lý hoặc lỗi.
 */
export function isPhotoEnhanced(photo: CapturedPhoto): boolean {
    const normalize = (value: string) => value.replace(/^file:\/+/, '').replace(/\\/g, '/').toLowerCase()
    return photo.enhanceStatus === 'processed' && Boolean(photo.enhancedPath) &&
        normalize(photo.enhancedPath) !== normalize(photo.rawPath)
}

