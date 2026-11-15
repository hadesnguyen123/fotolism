import QRCode from 'qrcode'
import {
    DEFAULT_ACCOUNT_NUMBER,
    DEFAULT_BANK_BIN,
} from './constants'

function tlv(id: string, value: string): string {
    return `${id}${String(value.length).padStart(2, '0')}${value}`
}

function crc16CcittFalse(input: string): string {
    let crc = 0xffff
    for (let i = 0; i < input.length; i++) {
        crc ^= input.charCodeAt(i) << 8
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) !== 0) {
                crc = ((crc << 1) ^ 0x1021) & 0xffff
            } else {
                crc = (crc << 1) & 0xffff
            }
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0')
}

/**
 * Tạo chuỗi payload chuẩn EMVCo Napas247 VietQR (tương thích 100% SePay & mọi ứng dụng ngân hàng)
 */
export function buildVietQrPayload(
    bankBin: string = DEFAULT_BANK_BIN,
    accountNumber: string = DEFAULT_ACCOUNT_NUMBER,
    amount: number = 0,
    description: string = ''
): string {
    const cleanBin = (bankBin || DEFAULT_BANK_BIN).trim()
    const cleanAcc = (accountNumber || DEFAULT_ACCOUNT_NUMBER).trim()
    const cleanAmount = Math.max(0, Math.round(Number(amount) || 0))
    const cleanDesc = (description || '').trim()

    const beneficiaryOrg = tlv('00', cleanBin) + tlv('01', cleanAcc)
    const consumerAccountInfo =
        tlv('00', 'A000000727') +
        tlv('01', beneficiaryOrg) +
        tlv('02', 'QRIBFTTA')

    let payload =
        tlv('00', '01') +
        tlv('01', cleanAmount > 0 ? '12' : '11') +
        tlv('38', consumerAccountInfo) +
        tlv('53', '704')

    if (cleanAmount > 0) {
        payload += tlv('54', String(cleanAmount))
    }

    payload += tlv('58', 'VN')

    if (cleanDesc) {
        payload += tlv('62', tlv('08', cleanDesc))
    }

    payload += '6304'
    return payload + crc16CcittFalse(payload)
}

/**
 * Sinh đồng bộ (0ms) ảnh QR VietQR dạng SVG Data URL, đảm bảo hiển thị tức thì và hoạt động 100% offline/online
 */
export function generateVietQrSvgDataUrl(
    bankBin: string = DEFAULT_BANK_BIN,
    accountNumber: string = DEFAULT_ACCOUNT_NUMBER,
    amount: number = 0,
    description: string = ''
): string {
    try {
        const payload = buildVietQrPayload(
            bankBin,
            accountNumber,
            amount,
            description
        )
        const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' })
        const size = qr.modules.size
        const data = qr.modules.data
        const margin = 2
        const total = size + margin * 2

        let path = ''
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (data[r * size + c]) {
                    path += `M${c + margin},${r + margin}h1v1h-1z`
                }
            }
        }

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#ffffff"/><path d="${path}" fill="#151312"/></svg>`
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    } catch {
        return ''
    }
}
