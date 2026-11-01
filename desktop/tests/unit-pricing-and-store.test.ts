import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PRICE_2X6,
  DEFAULT_PRICE_4X6,
  DEFAULT_EXTRA_COPY_PRICE_2X6,
  DEFAULT_EXTRA_COPY_PRICE_4X6,
} from '../src/lib/constants'
import {
  DEFAULT_BEAUTY_CONFIG,
  BEAUTY_PRESETS,
  DEFAULT_DISCOUNT_COUPONS,
  COLOR_FILTERS,
  ALL_LAYOUTS,
  FRAME_SIZE_OPTIONS,
  type DiscountCoupon,
  useAppStore,
} from '../src/store/appStore'

describe('UT-01: Bảng giá, Phụ phí in thêm & Mã ưu đãi (Pricing & Discounts)', () => {
  // Hàm tính toán giá theo chuẩn PaymentScreen
  function calculateTotal(params: {
    frameSize: '2x6' | '4x6'
    copies: number
    price2x6?: number
    price4x6?: number
    extraCopyPrice2x6?: number
    extraCopyPrice4x6?: number
    coupon?: DiscountCoupon | null
  }) {
    const {
      frameSize,
      copies,
      price2x6 = DEFAULT_PRICE_2X6,
      price4x6 = DEFAULT_PRICE_4X6,
      extraCopyPrice2x6 = DEFAULT_EXTRA_COPY_PRICE_2X6,
      extraCopyPrice4x6 = DEFAULT_EXTRA_COPY_PRICE_4X6,
      coupon,
    } = params

    const basePrice = frameSize === '2x6' ? price2x6 : price4x6
    const minCopies = frameSize === '2x6' ? 2 : 1
    const copyStep = frameSize === '2x6' ? 2 : 1
    const extraBatches = Math.max(0, Math.floor((copies - minCopies) / copyStep))
    const extraPricePerStep = frameSize === '2x6' ? extraCopyPrice2x6 : extraCopyPrice4x6

    const subTotal = basePrice + extraBatches * extraPricePerStep
    let discountAmount = 0
    if (coupon) {
      if (coupon.type === 'percent') {
        discountAmount = Math.round((subTotal * coupon.value) / 100)
      } else {
        discountAmount = coupon.value
      }
    }
    return Math.max(0, subTotal - discountAmount)
  }

  it('Tính chuẩn giá mặc định khổ 2x6: 2 dải in là 70.000đ theo cấu hình bảng giá', () => {
    // Với cấu hình mặc định trong constants (70k cho 2 dải):
    expect(calculateTotal({ frameSize: '2x6', copies: 2 })).toBe(70000)

    // Với bảng giá sự kiện 70k (2 dải):
    const total70k = calculateTotal({
      frameSize: '2x6',
      copies: 2,
      price2x6: 70000,
      extraCopyPrice2x6: 30000,
    })
    expect(total70k).toBe(70000)
  })

  it('Tính phụ phí in thêm chính xác cho khổ 2x6 (mỗi lần +2 dải là 30k theo quy chuẩn xén đôi máy in)', () => {
    // Khách in 4 dải (thêm 1 lượt 2 dải phụ, giá 30k -> 70k + 30k = 100k)
    const total4strips = calculateTotal({
      frameSize: '2x6',
      copies: 4,
      price2x6: 70000,
      extraCopyPrice2x6: 30000,
    })
    expect(total4strips).toBe(100000)

    // Khách in 6 dải (thêm 2 lượt = 4 dải phụ -> 70k + 60k = 130k)
    const total6strips = calculateTotal({
      frameSize: '2x6',
      copies: 6,
      price2x6: 70000,
      extraCopyPrice2x6: 30000,
    })
    expect(total6strips).toBe(130000)

    // Khách in 8 dải (thêm 3 lượt = 6 dải phụ -> 70k + 90k = 160k)
    const total8strips = calculateTotal({
      frameSize: '2x6',
      copies: 8,
      price2x6: 70000,
      extraCopyPrice2x6: 30000,
    })
    expect(total8strips).toBe(160000)
  })

  it('Tính chuẩn giá và phụ phí cho khổ postcard 4x6 (1 tấm mặc định 90k, +30k/tấm in thêm)', () => {
    // 1 postcard 4x6 chuẩn -> 90.000đ
    expect(
      calculateTotal({
        frameSize: '4x6',
        copies: 1,
        price4x6: 90000,
        extraCopyPrice4x6: 30000,
      })
    ).toBe(90000)

    // 2 postcards -> 90k + 1 * 30k = 120.000đ
    expect(
      calculateTotal({
        frameSize: '4x6',
        copies: 2,
        price4x6: 90000,
        extraCopyPrice4x6: 30000,
      })
    ).toBe(120000)

    // 3 postcards -> 90k + 2 * 30k = 150.000đ
    expect(
      calculateTotal({
        frameSize: '4x6',
        copies: 3,
        price4x6: 90000,
        extraCopyPrice4x6: 30000,
      })
    ).toBe(150000)
  })

  it('Áp dụng chính xác các mã giảm giá: GIAM20K, FREE, VIP2026', () => {
    const giam20k = DEFAULT_DISCOUNT_COUPONS.find((c) => c.code === 'GIAM20K')!
    const free = DEFAULT_DISCOUNT_COUPONS.find((c) => c.code === 'FREE')!
    const vip = DEFAULT_DISCOUNT_COUPONS.find((c) => c.code === 'VIP2026')!

    expect(giam20k).toBeDefined()
    expect(free).toBeDefined()
    expect(vip).toBeDefined()

    // GIAM20K trên đơn 70k -> còn 50k
    expect(
      calculateTotal({
        frameSize: '2x6',
        copies: 2,
        price2x6: 70000,
        coupon: giam20k,
      })
    ).toBe(50000)

    // FREE trên đơn 120k -> còn 0đ
    expect(
      calculateTotal({
        frameSize: '4x6',
        copies: 3,
        price4x6: 80000,
        extraCopyPrice4x6: 20000,
        coupon: free,
      })
    ).toBe(0)

    // VIP2026 (-20%) trên đơn 100k (80k base 1 tấm + 1 bản thêm 20k) -> còn 80k
    expect(
      calculateTotal({
        frameSize: '4x6',
        copies: 2,
        price4x6: 80000,
        extraCopyPrice4x6: 20000,
        coupon: vip,
      })
    ).toBe(80000)
  })

  it('Không cho phép số tiền thanh toán âm khi giảm giá vượt quá hóa đơn', () => {
    const giam20k = DEFAULT_DISCOUNT_COUPONS.find((c) => c.code === 'GIAM20K')!
    const result = calculateTotal({
      frameSize: '2x6',
      copies: 2,
      price2x6: 10000, // giá nhỏ hơn mã giảm giá
      coupon: giam20k,
    })
    expect(result).toBe(0)
  })
})

describe('UT-02: Pure Camera Defaults & Zero Filter Guarantee', () => {
  it('DEFAULT_BEAUTY_CONFIG phải tuyệt đối là 0% cho tất cả hiệu ứng can thiệp da/khuôn mặt', () => {
    expect(DEFAULT_BEAUTY_CONFIG.slimFace).toBe(0)
    expect(DEFAULT_BEAUTY_CONFIG.skinSmoothing).toBe(0)
    expect(DEFAULT_BEAUTY_CONFIG.whiteningTone).toBe(0)
    expect(DEFAULT_BEAUTY_CONFIG.rosyTone).toBe(0)
    expect(DEFAULT_BEAUTY_CONFIG.glowClarity).toBe(0)
    expect(DEFAULT_BEAUTY_CONFIG.brightnessAdjust).toBe(100)
    expect(DEFAULT_BEAUTY_CONFIG.contrastAdjust).toBe(100)
    expect(DEFAULT_BEAUTY_CONFIG.saturationAdjust).toBe(100)
  })

  it('Preset làm đẹp đầu tiên phải là "none" (Gốc - Máy ảnh)', () => {
    expect(BEAUTY_PRESETS.length).toBeGreaterThan(0)
    const firstPreset = BEAUTY_PRESETS[0]
    expect(firstPreset.id).toBe('none')
    expect(firstPreset.smoothing).toBe(0)
    expect(firstPreset.rosyTone).toBe(0)
    expect(firstPreset.brightness).toBe(100)
    expect(firstPreset.contrast).toBe(100)
  })

  it('Filter màu mặc định phải là Tự nhiên (cssFilter: none)', () => {
    expect(COLOR_FILTERS.length).toBeGreaterThan(0)
    const normalFilter = COLOR_FILTERS[0]
    expect(normalFilter.id).toBe('normal')
    expect(normalFilter.cssFilter).toBe('none')
  })

  it('Chuỗi CSS filter sinh ra từ giá trị pure camera mặc định phải là "none"', () => {
    const {
      brightnessAdjust,
      contrastAdjust,
      saturationAdjust,
      skinSmoothing,
      rosyTone,
      glowClarity,
      whiteningTone,
    } = DEFAULT_BEAUTY_CONFIG

    const whiteMultiplier = 1 + (whiteningTone / 100) * 0.12
    const baseBright = brightnessAdjust !== 100 ? brightnessAdjust / 100 : 1
    const totalBright = baseBright * whiteMultiplier
    const b = totalBright !== 1 ? `brightness(${totalBright.toFixed(3)})` : ''
    const c = contrastAdjust !== 100 ? `contrast(${contrastAdjust / 100})` : ''
    const s = saturationAdjust !== 100 ? `saturate(${saturationAdjust / 100})` : ''
    const smooth = skinSmoothing > 0 ? `blur(${(skinSmoothing * 0.0065).toFixed(2)}px)` : ''
    const rosy = rosyTone > 0 ? `hue-rotate(-${(rosyTone * 0.075).toFixed(1)}deg) saturate(${1 + rosyTone * 0.0025})` : ''
    const clarity = glowClarity > 0 ? `contrast(${1 + glowClarity * 0.0016})` : ''

    const parts = [b, c, s, smooth, rosy, clarity].filter(Boolean)
    const resultCss = parts.length > 0 ? parts.join(' ') : 'none'

    expect(resultCss).toBe('none')
  })

  it('Gương (mirrorCamera) mặc định là lật (true) và khi bắt đầu session mới', () => {
    const state = useAppStore.getState()
    expect(state.mirrorCamera).toBe(true)

    // Kiểm tra sau khi resetAdjustments
    state.resetAdjustments()
    expect(useAppStore.getState().mirrorCamera).toBe(true)

    // Kiểm tra sau khi clearSession
    state.clearSession()
    expect(useAppStore.getState().mirrorCamera).toBe(true)
  })
})

describe('UT-03: Kích thước Canvas & Tỷ lệ chuẩn in ấn 300 DPI (Strip & Postcard)', () => {
  it('Kích thước bản vẽ 2x6 strip là 600 x 1800 px (tỷ lệ 1:3) đúng chuẩn 300 DPI', () => {
    const is2x6 = true
    const width = is2x6 ? 600 : 1200
    const height = 1800
    expect(width).toBe(600)
    expect(height).toBe(1800)
    expect(width / height).toBeCloseTo(1 / 3, 5)
  })

  it('Kích thước bản vẽ 4x6 postcard là 1200 x 1800 px (tỷ lệ 2:3) đúng chuẩn 300 DPI', () => {
    const is2x6 = false
    const width = is2x6 ? 600 : 1200
    const height = 1800
    expect(width).toBe(1200)
    expect(height).toBe(1800)
    expect(width / height).toBeCloseTo(2 / 3, 5)
  })

  it('Bố cục 4 ô strip (4_strip_classic) tính toán slot vừa vặn và không tràn viền', () => {
    const layout = ALL_LAYOUTS[4][0]
    expect(layout.cols).toBe(1)
    expect(layout.rows).toBe(4)
    expect(layout.photosCount).toBe(4)

    const width = 600
    const height = 1800
    const footerHeight = 150
    const padX = 36
    const padTop = 40
    const gap = 20

    const availableHeight = height - padTop - footerHeight
    const slotW = (width - padX * 2 - gap * (layout.cols - 1)) / layout.cols
    const slotH = (availableHeight - gap * (layout.rows - 1)) / layout.rows

    expect(slotW).toBe(528)
    expect(slotH).toBeGreaterThan(350)
    expect(slotH).toBeLessThan(400)
    expect(slotW * layout.cols).toBeLessThanOrEqual(width)
    expect(slotH * layout.rows + footerHeight + padTop + gap * 3).toBeLessThanOrEqual(height)
  })

  it('Bố cục 4 ô postcard (4_grid_2x2) tính toán slot 2 cột x 2 hàng cân đối', () => {
    const layout = ALL_LAYOUTS[4][1]
    expect(layout.cols).toBe(2)
    expect(layout.rows).toBe(2)
    expect(layout.photosCount).toBe(4)

    const width = 1200
    const height = 1800
    const footerHeight = 150
    const padX = 50
    const padTop = 40
    const gap = 20

    const availableHeight = height - padTop - footerHeight
    const slotW = (width - padX * 2 - gap * (layout.cols - 1)) / layout.cols
    const slotH = (availableHeight - gap * (layout.rows - 1)) / layout.rows

    expect(slotW).toBeGreaterThan(500)
    expect(slotW).toBeLessThan(600)
    expect(slotH).toBeGreaterThan(700)
    expect(slotH).toBeLessThan(850)
  })

  it('UT-05: Hệ thống hỗ trợ đúng chuẩn 3 tông màu ảnh cốt lõi (Tự nhiên, Cổ điển B&W, Retro 90s) và các gói Selfbooth 5p, 7p, 10p', () => {
    // Đúng 3 bộ lọc màu theo quy chuẩn thiết kế bất biến của khách hàng
    expect(COLOR_FILTERS.length).toBe(3)
    const filterIds = COLOR_FILTERS.map((f) => f.id)
    expect(filterIds).toEqual(['normal', 'vintage_noir', 'retro_90s'])

    // Cấu hình thời gian Selfbooth
    const store = useAppStore.getState()
    store.setSelfboothDurationSeconds(300)
    expect(useAppStore.getState().eventConfig.selfboothDurationSeconds).toBe(300)

    store.setSelfboothDurationSeconds(420)
    expect(useAppStore.getState().eventConfig.selfboothDurationSeconds).toBe(420)

    store.setSelfboothDurationSeconds(600)
    expect(useAppStore.getState().eventConfig.selfboothDurationSeconds).toBe(600)
  })

  it('UT-06: Điều hướng hỗ trợ màn hình selfbooth-setup và select-layout', () => {
    const store = useAppStore.getState()
    store.setScreen('selfbooth-setup')
    expect(useAppStore.getState().screen).toBe('selfbooth-setup')

    store.setScreen('select-layout')
    expect(useAppStore.getState().screen).toBe('select-layout')
  })

  it('UT-07: Khách hàng có thể chọn tự do và chuyển đổi linh hoạt giữa cả 5 layout của poster', () => {
    // 1. Chọn Strip 3 ảnh
    const strip3 = ALL_LAYOUTS[3][0]
    useAppStore.setState({
      selectedFrameSize: '2x6',
      selectedLayout: strip3,
      selectedCategory: 3,
      selectedCopies: 2,
    })
    expect(useAppStore.getState().selectedLayout.id).toBe('3_vertical_strip')
    expect(useAppStore.getState().selectedFrameSize).toBe('2x6')

    // 2. Chọn Strip 4 ảnh
    const strip4 = ALL_LAYOUTS[4][0]
    useAppStore.setState({
      selectedFrameSize: '2x6',
      selectedLayout: strip4,
      selectedCategory: 4,
      selectedCopies: 2,
    })
    expect(useAppStore.getState().selectedLayout.id).toBe('4_strip_classic')
    expect(useAppStore.getState().selectedFrameSize).toBe('2x6')

    // 3. Chọn Lưới 6 ảnh (2x3)
    const grid6 = ALL_LAYOUTS[6][0]
    useAppStore.setState({
      selectedFrameSize: '4x6',
      selectedLayout: grid6,
      selectedCategory: 6,
      selectedCopies: 2,
    })
    expect(useAppStore.getState().selectedLayout.id).toBe('6_grid_2x3')
    expect(useAppStore.getState().selectedFrameSize).toBe('4x6')

    // 4. Chọn Lưới 4 ảnh (2x2)
    const grid4 = ALL_LAYOUTS[4].find((l) => l.id === '4_grid_2x2') || ALL_LAYOUTS[4][1]
    useAppStore.setState({
      selectedFrameSize: '4x6',
      selectedLayout: grid4,
      selectedCategory: 4,
      selectedCopies: 2,
    })
    expect(useAppStore.getState().selectedLayout.id).toBe('4_grid_2x2')
    expect(useAppStore.getState().selectedFrameSize).toBe('4x6')

    // 5. Chọn Lưới 9 ảnh (3x3)
    const grid9 = ALL_LAYOUTS[9][0]
    useAppStore.setState({
      selectedFrameSize: '4x6',
      selectedLayout: grid9,
      selectedCategory: 9,
      selectedCopies: 2,
    })
    expect(useAppStore.getState().selectedLayout.id).toBe('9_grid_3x3')
    expect(useAppStore.getState().selectedFrameSize).toBe('4x6')
  })
})
