/**
 * Chuẩn hóa mã PIN hoặc sessionId về mã PIN gốc (bỏ tiền tố session_ nếu có)
 */
export function extractRawPin(pinOrSessionId?: string | null): string {
    const raw = (pinOrSessionId || '').trim()
    return raw.replace(/^session_/i, '')
}

export function isTestSessionPin(pinOrSessionId?: string | null): boolean {
    return extractRawPin(pinOrSessionId) === '1234'
}

/**
 * Tên thư mục session trên máy local Kiosk: session_<mã pin>
 */
export function formatLocalSessionFolder(pinOrSessionId?: string | null): string {
    const rawPin = extractRawPin(pinOrSessionId)
    if (!rawPin) return `session_${Date.now()}`
    return `session_${rawPin}`
}

/**
 * Băm (hash) mã PIN sang chuỗi 10 chữ số cố định dùng cho link Gallery:
 * https://fotolism-cms.vercel.app/gallery/<10 chữ số>
 */
export function hashPinTo10Digits(pinOrSessionId?: string | null): string {
    const raw = extractRawPin(pinOrSessionId)
    if (/^\d{10}$/.test(raw)) return raw
    const seed = `fotolism_gallery_pin_v1:${raw || '0000'}`
    let h1 = 0x811c9dc5
    let h2 = 0x01000193
    for (let i = 0; i < seed.length; i++) {
        const ch = seed.charCodeAt(i)
        h1 ^= ch
        h1 = Math.imul(h1, 0x01000193) >>> 0
        h2 ^= ch + Math.imul(i + 1, 0x9e3779b9)
        h2 = Math.imul(h2, 0x85ebca6b) >>> 0
    }
    const combined =
        ((BigInt(h1 >>> 0) * BigInt(1000003) + BigInt(h2 >>> 0)) %
            BigInt(9000000000)) +
        BigInt(1000000000)
    return combined.toString()
}

export const GALLERY_BASE_URL = 'https://fotolism-cms.vercel.app'

export function buildGalleryUrl(
    pinOrSessionId?: string | null,
    baseUrl: string = GALLERY_BASE_URL
): string {
    const cleanBase = (baseUrl || GALLERY_BASE_URL).replace(/\/$/, '')
    const hash = hashPinTo10Digits(pinOrSessionId)
    return `${cleanBase}/gallery/${hash}`
}

/**
 * Xác định thời lượng gói chụp (phút: 5, 7, 10 cho Selfbooth; Photobooth cố định 2.5 phút = 2p30s)
 */
export function resolveTicketDurationMinutes(input?: {
    duration_minutes?: number | null
    duration_seconds?: number | null
    duration?: string | null
    package_name?: string | null
    package_id?: string | null
    amount?: number | null
    service_type?: string | null
} | null): number {
    if (!input) return 5
    if (input.service_type === 'photobooth') return 2.5

    if (
        typeof input.duration_minutes === 'number' &&
        Number.isFinite(input.duration_minutes) &&
        input.duration_minutes > 0
    ) {
        return Math.round(input.duration_minutes)
    }

    if (
        typeof input.duration_seconds === 'number' &&
        Number.isFinite(input.duration_seconds) &&
        input.duration_seconds > 0
    ) {
        return Math.max(1, Math.round(input.duration_seconds / 60))
    }

    const candidates = [
        input.duration,
        input.package_name,
        input.package_id,
    ].filter(Boolean) as string[]

    for (const text of candidates) {
        const match = text.match(/(\d+)\s*(?:p|phút|phut|min|m)\b/i)
        if (match) {
            const mins = parseInt(match[1], 10)
            if (mins > 0 && mins <= 120) return mins
        }
    }

    const amount = Number(input.amount || 0)
    if (amount >= 160000) return 10
    if (amount >= 115000) return 7
    return 5
}

export function resolveTicketDurationSeconds(input?: {
    duration_minutes?: number | null
    duration_seconds?: number | null
    duration?: string | null
    package_name?: string | null
    package_id?: string | null
    amount?: number | null
    service_type?: string | null
} | null): number {
    if (input?.service_type === 'photobooth') return 150
    if (
        input &&
        typeof input.duration_seconds === 'number' &&
        Number.isFinite(input.duration_seconds) &&
        input.duration_seconds > 0
    ) {
        return Math.round(input.duration_seconds)
    }
    return Math.round(resolveTicketDurationMinutes(input) * 60)
}
