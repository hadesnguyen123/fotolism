import type {
  GridLayoutItem,
  ThemeItem,
  PlacedSticker,
  ColorFilterItem,
  FrameSize,
} from '../store/appStore'
import { DEFAULT_EVENT_NAME, resolveAssetUrl } from './constants'

interface RenderOptions {
  photos: string[] // data URLs or image URLs
  frameSize: FrameSize
  layout: GridLayoutItem
  theme: ThemeItem
  stickers: PlacedSticker[]
  filter: ColorFilterItem
  eventName: string
  eventDate: string
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = (err) => reject(err)
    img.src = src
  })
}

/**
 * Cắt crop ảnh về đúng tỉ lệ ô của khung (528x352, 544x726, 381x580)
 * Giữ nguyên trung tâm ảnh, bảo đảm không bị méo tỉ lệ hoặc lộ viền trắng
 */
export async function cropImageToAspect(
  sourceDataUrl: string,
  targetW: number,
  targetH: number
): Promise<string> {
  if (!sourceDataUrl || !sourceDataUrl.startsWith('data:')) {
    return sourceDataUrl
  }

  const img = await loadImage(sourceDataUrl)
  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height
  const srcAspect = srcW / srcH
  const targetAspect = targetW / targetH

  let cropW = srcW
  let cropH = srcH
  let cropX = 0
  let cropY = 0

  if (srcAspect > targetAspect) {
    // Nguồn rộng hơn tỉ lệ target -> cắt đều 2 bên trái/phải
    cropW = Math.round(srcH * targetAspect)
    cropX = Math.round((srcW - cropW) / 2)
  } else {
    // Nguồn cao hơn tỉ lệ target -> cắt đều trên/dưới
    cropH = Math.round(srcW / targetAspect)
    cropY = Math.round((srcH - cropH) / 2)
  }

  const canvas = document.createElement('canvas')
  canvas.width = cropW
  canvas.height = cropH
  const ctx = canvas.getContext('2d')
  if (!ctx) return sourceDataUrl

  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)
  return canvas.toDataURL('image/jpeg', 0.98)
}

/**
 * Bộ đệm cache grain pattern cho hiệu ứng hạt phim cổ điển Retro 90s
 */
let cachedGrainPattern: CanvasPattern | null = null

function getFilmGrainPattern(targetCtx: CanvasRenderingContext2D): CanvasPattern | null {
  if (cachedGrainPattern) return cachedGrainPattern
  try {
    if (typeof document === 'undefined') return null
    const grainCanvas = document.createElement('canvas')
    const size = 256
    grainCanvas.width = size
    grainCanvas.height = size
    const gCtx = grainCanvas.getContext('2d')
    if (!gCtx || typeof gCtx.createImageData !== 'function') return null

    const imgData = gCtx.createImageData(size, size)
    const data = imgData.data
    for (let i = 0; i < data.length; i += 4) {
      // Hạt noise đơn sắc (Monochromatic film grain)
      const noise = (Math.random() - 0.5) * 255
      if (noise > 0) {
        data[i] = 255
        data[i + 1] = 255
        data[i + 2] = 255
        data[i + 3] = Math.min(255, Math.floor(noise * 0.32))
      } else {
        data[i] = 0
        data[i + 1] = 0
        data[i + 2] = 0
        data[i + 3] = Math.min(255, Math.floor(-noise * 0.32))
      }
    }
    gCtx.putImageData(imgData, 0, 0)
    if (typeof targetCtx.createPattern === 'function') {
      cachedGrainPattern = targetCtx.createPattern(grainCanvas, 'repeat')
    }
    return cachedGrainPattern
  } catch (err) {
    console.warn('Could not generate film grain pattern:', err)
    return null
  }
}

function applyFilmGrainToSlot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
) {
  try {
    const pattern = getFilmGrainPattern(ctx)
    if (!pattern) return

    ctx.save()
    ctx.globalCompositeOperation = 'overlay'
    ctx.fillStyle = pattern
    ctx.fillRect(x, y, w, h)
    ctx.restore()
  } catch (err) {
    console.warn('Could not apply film grain to slot:', err)
  }
}

/**
 * Tạo bản vẽ Photobooth Strip Canvas chất lượng cao (300 DPI tương đương khổ in)
 * - 2x6 inch: 600 x 1800 px
 * - 4x6 inch: 1200 x 1800 px
 */
export async function generateStripComposite(opts: RenderOptions): Promise<string> {
  const is2x6 = (opts.theme?.frameSize || opts.frameSize) === '2x6'
  const width = is2x6 ? 600 : 1200
  const height = 1800

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }

  // 1. Vẽ nền (Background Color / Gradient)
  if (opts.theme.overlayUrl) {
    // Với khung overlay đồ họa PNG, đặt nền tối để triệt tiêu hoàn toàn khoảng hắt sáng trắng
    ctx.fillStyle = opts.theme.bgColor || '#141414'
  } else if (opts.theme.bgGradient) {
    const colorMatches = opts.theme.bgGradient.match(/#(?:[0-9a-fA-F]{3,8})|rgba?\([^)]+\)/g)
    if (colorMatches && colorMatches.length >= 2) {
      const grad = ctx.createLinearGradient(0, 0, width, height)
      grad.addColorStop(0, colorMatches[0])
      grad.addColorStop(1, colorMatches[colorMatches.length - 1])
      ctx.fillStyle = grad
    } else {
      ctx.fillStyle = opts.theme.bgColor || '#FFFFFF'
    }
  } else {
    ctx.fillStyle = opts.theme.bgColor || '#FFFFFF'
  }
  ctx.fillRect(0, 0, width, height)

  // 2. Tính toán khung ảnh (Slots) chuẩn xác theo Bố cục đã chọn (opts.layout)
  // BẮT BUỘC giữ đúng cấu trúc ô theo layout, không được co rút dựa trên số lượng ảnh truyền vào
  const totalSlots = opts.layout.photosCount || (is2x6 ? 4 : 4)
  const cols = opts.layout.cols || 1
  const rows = opts.layout.rows || Math.max(1, Math.ceil(totalSlots / cols))

  const footerHeight = 150
  const padX = is2x6 ? 36 : 50
  const padTop = 40
  const gap = 20

  const availableHeight = height - padTop - footerHeight
  const slotW = (width - padX * 2 - gap * (cols - 1)) / cols
  const slotH = (availableHeight - gap * (rows - 1)) / rows

  // 3. Tải và vẽ từng ảnh theo đúng từng ô của layout đã chọn (hoặc theo cấu hình tọa độ slots riêng của Theme)
  for (let i = 0; i < totalSlots; i++) {
    const colIdx = i % cols
    const rowIdx = Math.floor(i / cols)
    let sx = padX + colIdx * (slotW + gap)
    let sy = padTop + rowIdx * (slotH + gap)
    let curSlotW = slotW
    let curSlotH = slotH

    if (opts.theme.slots && opts.theme.slots[i]) {
      sx = opts.theme.slots[i].x
      sy = opts.theme.slots[i].y
      curSlotW = opts.theme.slots[i].w
      curSlotH = opts.theme.slots[i].h
    }

    // Các ô trong frame là ô vuông góc 90 độ (không bo tròn góc, không để hở khoảng trắng)
    // Mở rộng viền nhẹ 2px (bleed) để ảnh ăn sâu xuống dưới lớp overlay đồ họa
    ctx.save()
    const bleed = opts.theme.overlayUrl ? 2 : 0
    const drawX = sx - bleed
    const drawY = sy - bleed
    const drawW = curSlotW + bleed * 2
    const drawH = curSlotH + bleed * 2

    ctx.fillStyle = '#141414'
    ctx.beginPath()
    ctx.rect(drawX, drawY, drawW, drawH)
    ctx.fill()
    ctx.clip()

    const photoSrc = opts.photos[i] || (opts.photos.length > 0 ? opts.photos[opts.photos.length - 1] : '')
    if (photoSrc) {
      try {
        const img = await loadImage(photoSrc)
        // Áp dụng bộ lọc màu được chọn lên từng ảnh trong dải in
        if (opts.filter && opts.filter.cssFilter && opts.filter.cssFilter !== 'none') {
          ctx.filter = opts.filter.cssFilter
        } else {
          ctx.filter = 'none'
        }

        // Fit & Center crop (aspect fill)
        const imgAspect = img.width / img.height
        const slotAspect = drawW / drawH
        let dw = drawW
        let dh = drawH
        let dx = drawX
        let dy = drawY

        if (imgAspect > slotAspect) {
          dw = drawH * imgAspect
          dx = drawX - (dw - drawW) / 2
        } else {
          dh = drawW / imgAspect
          dy = drawY - (dh - drawH) / 2
        }

        ctx.drawImage(img, dx, dy, dw, dh)

        // Phủ lớp hạt phim cổ điển (Film grain noise) cho màu Retro 90s
        if (opts.filter && (opts.filter.id === 'retro_90s' || opts.filter.hasGrain)) {
          applyFilmGrainToSlot(ctx, drawX, drawY, drawW, drawH)
        }
      } catch (err) {
        console.warn(`Could not load photo ${i + 1}:`, err)
        ctx.fillStyle = '#333333'
        ctx.fillRect(sx, sy, curSlotW, curSlotH)
      }
    } else {
      ctx.fillStyle = '#E2E8F0'
      ctx.fillRect(sx, sy, curSlotW, curSlotH)
    }

    ctx.restore()
  }

  // 4. Vẽ các sticker được dán
  for (const st of opts.stickers) {
    const px = (st.x / 100) * width
    const py = (st.y / 100) * height

    const scale = st.scale || 1
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate((st.rotation * Math.PI) / 180)
    ctx.scale(scale, scale)
    ctx.font = '56px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(st.icon, 0, 0)
    ctx.restore()
  }

  // 5. Vẽ Lớp Khung Đồ Họa PNG Trong Suốt (Frame Overlay) nếu có
  if (opts.theme.overlayUrl) {
    try {
      const overlayImg = await loadImage(resolveAssetUrl(opts.theme.overlayUrl))
      ctx.drawImage(overlayImg, 0, 0, width, height)
    } catch (err) {
      console.warn('Could not load frame overlay image:', err)
    }
  }

  // 6. Vẽ Footer Branding & Ngày tháng (nếu không dùng khung ẩn footer)
  if (!opts.theme.hideFooter) {
    ctx.save()
    ctx.fillStyle = opts.theme.textColor || '#2D2426'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // Tiêu đề sự kiện (Font Cute bo tròn)
    ctx.font = '800 28px "Baloo 2", "Quicksand", sans-serif'
    ctx.letterSpacing = '1px'
    ctx.fillText(opts.eventName || DEFAULT_EVENT_NAME, width / 2, height - 85)

    // Ngày tháng & Bộ lọc
    ctx.font = '700 16px "Quicksand", sans-serif'
    ctx.letterSpacing = '0.5px'
    ctx.globalAlpha = 0.85
    ctx.fillText(`${opts.eventDate}  •  ${opts.filter.name}`, width / 2, height - 48)
    ctx.restore()
  }

  return canvas.toDataURL('image/jpeg', 0.96)
}

/**
 * Chuẩn hóa ảnh gửi tới máy in nhiệt DNP DS-RX1 / DS-RX1HS theo đúng chuẩn khổ in 4x6:
 * - Nếu là ảnh dải đơn 2x6 (600x1800): Ghép 2 dải 2x6 song song đứng cạnh nhau thành 1 tờ 4x6 đứng (1200 x 1800 px, 300 DPI) gồm 2 tấm 2x6 cạnh nhau đúng chuẩn Photobooth Template.
 * - Nếu là ảnh khổ 4x6 (1200x1800 hoặc 1800x1200): Giữ nguyên.
 */
export async function preparePrintImageForDNP(sourceDataUrl: string): Promise<string> {
  const img = await loadImage(sourceDataUrl)
  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height

  // Trường hợp 1: Dải strip đơn 2x6 (tỉ lệ ~ 1:3, ví dụ 600x1800)
  // Ghép 2 dải 2x6 song song đứng cạnh nhau thành 1 bản in khổ 4x6 (1200 x 1800 px)
  if (srcW < srcH && srcH / srcW >= 2.5) {
    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 1800
    const ctx = canvas.getContext('2d')
    if (!ctx) return sourceDataUrl

    // Nền trắng
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, 1200, 1800)

    // Dải 1: Bên trái (x: 0 -> 600 px)
    ctx.drawImage(img, 0, 0, 600, 1800)

    // Dải 2: Bên phải (x: 600 -> 1200 px)
    ctx.drawImage(img, 600, 0, 600, 1800)

    // Đường chỉ dẫn cắt nhẹ ở giữa (đường chấm đứt rất mờ)
    ctx.save()
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)'
    ctx.lineWidth = 1
    ctx.setLineDash([8, 8])
    ctx.beginPath()
    ctx.moveTo(600, 0)
    ctx.lineTo(600, 1800)
    ctx.stroke()
    ctx.restore()

    return canvas.toDataURL('image/jpeg', 0.98)
  }

  // Trường hợp 2: Ảnh đã là khổ 4x6 (1200x1800 hoặc 1800x1200)
  return sourceDataUrl
}
