import { DEFAULT_COUPON_CODE } from '../lib/constants'

export interface DiscountCoupon {
  code: string
  type: 'percent' | 'fixed'
  value: number // % hoặc số tiền VND
  description: string
}

export const DEFAULT_DISCOUNT_COUPONS: DiscountCoupon[] = [
  { code: DEFAULT_COUPON_CODE, type: 'percent', value: 10, description: 'Giam 10% tong hoa don' },
  { code: 'GIAM20K', type: 'fixed', value: 20000, description: 'Giảm trực tiếp 20.000đ' },
  { code: 'FREE', type: 'percent', value: 100, description: 'Miễn phí trải nghiệm (0đ)' },
  { code: 'VIP2026', type: 'percent', value: 20, description: 'Khách hàng thân thiết VIP (-20%)' },
]
