import { DEFAULT_COUPON_CODE } from '../lib/constants'

export interface DiscountCoupon {
    code: string
    type: 'percent' | 'fixed'
    value: number // % hoặc số tiền VND
    description: string
}

/** Số lượng mã giảm giá tối đa được áp dụng trong 1 phiên chụp (không trùng lặp) */
export const MAX_COUPONS_PER_SESSION = 2

/**
 * Tính tổng tiền giảm từ danh sách mã ưu đãi đã áp dụng (tối đa 2 mã khác nhau, không vượt quá tạm tính).
 */
export function calculateCouponsDiscount(
    subTotal: number,
    coupons: DiscountCoupon[]
): number {
    if (subTotal <= 0 || coupons.length === 0) return 0
    const seen = new Set<string>()
    let totalDiscount = 0
    for (const c of coupons) {
        const key = c.code.trim().toUpperCase()
        if (!key || seen.has(key)) continue
        seen.add(key)
        if (seen.size > MAX_COUPONS_PER_SESSION) break
        totalDiscount +=
            c.type === 'percent'
                ? Math.round((subTotal * c.value) / 100)
                : c.value
    }
    return Math.min(subTotal, Math.max(0, totalDiscount))
}

export const DEFAULT_DISCOUNT_COUPONS: DiscountCoupon[] = [
    {
        code: DEFAULT_COUPON_CODE,
        type: 'percent',
        value: 10,
        description: 'Giam 10% tong hoa don',
    },
    {
        code: 'GIAM20K',
        type: 'fixed',
        value: 20000,
        description: 'Giảm trực tiếp 20.000đ',
    },
    {
        code: 'FREE',
        type: 'percent',
        value: 100,
        description: 'Miễn phí trải nghiệm (0đ)',
    },
    {
        code: 'VIP2026',
        type: 'percent',
        value: 20,
        description: 'Khách hàng thân thiết VIP (-20%)',
    },
]
