import type { StateCreator } from 'zustand'
import type { DiscountCoupon } from '../../config/coupons'

export interface PaymentSlice {
  selectedCopies: number
  setSelectedCopies: (copies: number) => void
  appliedCoupon: DiscountCoupon | null
  setAppliedCoupon: (coupon: DiscountCoupon | null) => void
  setSessionPayment: (data: {
    paidAmount: number
    paidCopies: number
    paymentMethod: 'vietqr' | 'cash' | 'free'
    discountCodeUsed: string | null
    discountAmount: number
  }) => void
  setSessionPrinted: () => void
}

export const createPaymentSlice: StateCreator<any, [], [], PaymentSlice> = (set) => ({
  selectedCopies: 2,
  setSelectedCopies: (selectedCopies) => set({ selectedCopies }),
  appliedCoupon: null,
  setAppliedCoupon: (appliedCoupon) => set({ appliedCoupon }),

  setSessionPayment: (data) =>
    set((state: any) => ({
      session: state.session
        ? {
            ...state.session,
            ...data,
          }
        : null,
    })),

  setSessionPrinted: () =>
    set((state: any) => ({
      session: state.session ? { ...state.session, hasPrinted: true } : null,
    })),
})
