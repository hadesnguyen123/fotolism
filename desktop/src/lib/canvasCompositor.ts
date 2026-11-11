import type {
    GridLayoutItem,
    ThemeItem,
    PlacedSticker,
    ColorFilterItem,
    FrameSize,
} from '../store/appStore'
import {
    DEFAULT_EVENT_NAME,
    DEFAULT_PRINT_SCALE,
    resolveAssetUrl,
} from './constants'

export interface SlotOffset {
    x: number // -1.0 (trái) đến +1.0 (phải)
    y: number // -1.0 (lên) đến +1.0 (xuống)
    scale?: number // Tỉ lệ phóng to (zoom): 1.0 (mặc định) đến 3.0x
}

export interface RenderOptions {
    photos: string[] // data URLs or image URLs
    frameSize: FrameSize
    layout: GridLayoutItem
    theme: ThemeItem
    stickers: PlacedSticker[]
    filter: ColorFilterItem
    eventName: string
    eventDate: string
    slotOffsets?: SlotOffset[]
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        if (src.startsWith('http://') || src.startsWith('https://')) {
            img.crossOrigin = 'anonymous'
        }
        img.onload = () => resolve(img)
        img.onerror = (err) => reject(err)
        img.src = src
    })
}

/**
 * Cắt crop ảnh về đúng tỉ lệ ô của khung (528x352, 544x726, 281x580)
 * Đồng bộ chính xác với khung vàng hiển thị trên Live View 16:9
 * Xử lý hoàn hảo sự khác biệt tỷ lệ giữa Live View 16:9 và ảnh gốc từ camera (3:2 hoặc 16:9)
 */
export async function cropImageToAspect(
    sourceDataUrl: string,
    targetW: number,
    targetH: number,
    viewfinderAspect: number = 16 / 9
): Promise<string> {
    if (!sourceDataUrl || !sourceDataUrl.startsWith('data:')) {
        return sourceDataUrl
    }

    const img = await loadImage(sourceDataUrl)
    const srcW = img.naturalWidth || img.width
    const srcH = img.naturalHeight || img.height
    const srcAspect = srcW / srcH
    const targetAspect = targetW / targetH

    // 1. Xác định vùng Live View 16:9 tương ứng trên ảnh gốc từ camera
    let viewW = srcW
    let viewH = srcH
    let viewX = 0
    let viewY = 0

    if (Math.abs(srcAspect - viewfinderAspect) > 0.01) {
        if (srcAspect < viewfinderAspect) {
            // Ảnh gốc hẹp hơn 16:9 (ví dụ cảm biến vật lý Canon 3:2 = 1.5) -> Live View đã crop bớt đỉnh/đáy
            viewH = Math.round(srcW / viewfinderAspect)
            viewY = Math.round((srcH - viewH) / 2)
        } else {
            // Ảnh gốc rộng hơn 16:9 -> Live View đã crop bớt 2 bên
            viewW = Math.round(srcH * viewfinderAspect)
            viewX = Math.round((srcW - viewW) / 2)
        }
    }

    // 2. Tính toán vùng Khung Vàng (Safe Area) nằm trong vùng Live View 16:9
    let cropW = viewW
    let cropH = viewH
    let cropX = viewX
    let cropY = viewY

    if (targetAspect <= viewfinderAspect) {
        // Ưu tiên giữ chiều cao tối đa của Live View, co từ 2 bên vào
        cropH = viewH
        cropW = Math.round(viewH * targetAspect)
        cropX = Math.round(viewX + (viewW - cropW) / 2)
    } else {
        // Nếu ô rộng hơn 16:9, giữ chiều rộng tối đa, co chiều cao
        cropW = viewW
        cropH = Math.round(viewW / targetAspect)
        cropY = Math.round(viewY + (viewH - cropH) / 2)
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

function getFilmGrainPattern(
    targetCtx: CanvasRenderingContext2D
): CanvasPattern | null {
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
export async function generateStripComposite(
    opts: RenderOptions
): Promise<string> {
    const is2x6 = (opts.theme?.frameSize || opts.frameSize) === '2x6'
    const width = opts.theme?.canvasWidth || (is2x6 ? 600 : 1200)
    const height = opts.theme?.canvasHeight || 1800

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
        const colorMatches = opts.theme.bgGradient.match(
            /#(?:[0-9a-fA-F]{3,8})|rgba?\([^)]+\)/g
        )
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

        const photoSrc =
            opts.photos[i] ||
            (opts.photos.length > 0 ? opts.photos[opts.photos.length - 1] : '')
        if (photoSrc) {
            try {
                const img = await loadImage(photoSrc)
                // Áp dụng bộ lọc màu được chọn lên từng ảnh trong dải in
                if (
                    opts.filter &&
                    opts.filter.cssFilter &&
                    opts.filter.cssFilter !== 'none'
                ) {
                    ctx.filter = opts.filter.cssFilter
                } else {
                    ctx.filter = 'none'
                }

                // Fit & Center crop chuẩn xác: Chống lỗi cắt xén 2 lần (Double Cropping)
                // Đồng bộ 1:1 giữa Live View, Khung Vàng an toàn, và dải in thực tế
                const imgAspect = img.width / img.height
                const slotAspect = drawW / drawH
                const offset =
                    opts.slotOffsets && opts.slotOffsets[i]
                        ? opts.slotOffsets[i]
                        : { x: 0, y: 0, scale: 1.0 }
                const clampedX = Math.max(-1, Math.min(1, offset.x || 0))
                const clampedY = Math.max(-1, Math.min(1, offset.y || 0))
                const userScale = Math.max(
                    1.0,
                    Math.min(3.0, offset.scale || 1.0)
                )
                const hasTransform =
                    Math.abs(clampedX) > 0.01 ||
                    Math.abs(clampedY) > 0.01 ||
                    userScale > 1.01

                let finalSrcX = 0
                let finalSrcY = 0
                let finalSrcW = img.width
                let finalSrcH = img.height

                // Trường hợp 1: Ảnh đã có cùng tỉ lệ với ô slot (sai số < 0.03)
                // (Ví dụ ảnh đã qua cropImageToAspect theo khung vàng, hoặc ảnh gốc 3:2 Canon vào ô 2x6 3:2)
                if (Math.abs(imgAspect - slotAspect) < 0.03) {
                    if (hasTransform) {
                        // Khách có kéo tay căn chỉnh hoặc zoom: áp dụng zoom * userScale
                        const zoom = 1.08 * userScale
                        finalSrcW = Math.round(img.width / zoom)
                        finalSrcH = Math.round(img.height / zoom)
                        const slackX = (img.width - finalSrcW) / 2
                        const slackY = (img.height - finalSrcH) / 2
                        finalSrcX = Math.round(slackX - clampedX * slackX)
                        finalSrcY = Math.round(slackY - clampedY * slackY)
                        finalSrcX = Math.max(
                            0,
                            Math.min(img.width - finalSrcW, finalSrcX)
                        )
                        finalSrcY = Math.max(
                            0,
                            Math.min(img.height - finalSrcH, finalSrcY)
                        )
                    } else {
                        // Vị trí mặc định: Giữ nguyên 100% hình ảnh không cắt bất kỳ pixel nào
                        finalSrcW = img.width
                        finalSrcH = img.height
                        finalSrcX = 0
                        finalSrcY = 0
                    }
                } else {
                    // Trường hợp 2: Ảnh gốc toàn cảnh chưa crop (webcam 16:9 hoặc Canon 3:2 vào ô dọc 4x6 4 ảnh hoặc 9 ảnh)
                    // Cắt chuẩn xác 1 lần duy nhất theo Khung Vàng của Live View 16:9
                    const viewfinderAspect = 16 / 9
                    let viewX = 0
                    let viewY = 0
                    let viewW = img.width
                    let viewH = img.height

                    if (imgAspect < viewfinderAspect - 0.02) {
                        // Cảm biến 3:2 hẹp hơn 16:9 -> Live View 16:9 đã crop đỉnh/đáy
                        viewH = Math.round(img.width / viewfinderAspect)
                        viewY = Math.round((img.height - viewH) / 2)
                    } else if (imgAspect > viewfinderAspect + 0.02) {
                        // Ảnh rộng hơn 16:9 -> Live View 16:9 đã crop 2 bên
                        viewW = Math.round(img.height * viewfinderAspect)
                        viewX = Math.round((img.width - viewW) / 2)
                    }

                    const effectiveAspect = viewW / viewH
                    if (effectiveAspect > slotAspect) {
                        // Slot hẹp hơn Live View 16:9: Giữ chiều cao, co chiều rộng từ 2 bên vào giữa
                        finalSrcH = Math.round(viewH / userScale)
                        finalSrcW = Math.round((viewH * slotAspect) / userScale)
                        const slackX = (viewW - finalSrcW) / 2
                        const slackY = (viewH - finalSrcH) / 2
                        finalSrcX = Math.round(viewX + slackX - clampedX * slackX)
                        finalSrcY = Math.round(viewY + slackY - clampedY * slackY)
                    } else {
                        // Slot rộng hơn Live View 16:9: Giữ chiều rộng, co chiều cao
                        finalSrcW = Math.round(viewW / userScale)
                        finalSrcH = Math.round((viewW / slotAspect) / userScale)
                        const slackX = (viewW - finalSrcW) / 2
                        const slackY = (viewH - finalSrcH) / 2
                        finalSrcX = Math.round(viewX + slackX - clampedX * slackX)
                        finalSrcY = Math.round(viewY + slackY - clampedY * slackY)
                    }
                    finalSrcX = Math.max(
                        0,
                        Math.min(img.width - finalSrcW, finalSrcX)
                    )
                    finalSrcY = Math.max(
                        0,
                        Math.min(img.height - finalSrcH, finalSrcY)
                    )
                }

                ctx.drawImage(
                    img,
                    finalSrcX,
                    finalSrcY,
                    finalSrcW,
                    finalSrcH,
                    drawX,
                    drawY,
                    drawW,
                    drawH
                )

                // Phủ lớp hạt phim cổ điển (Film grain noise) cho màu Retro 90s
                if (
                    opts.filter &&
                    (opts.filter.id === 'retro_90s' || opts.filter.hasGrain)
                ) {
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
        ctx.font =
            '56px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(st.icon, 0, 0)
        ctx.restore()
    }

    // 5. Vẽ Lớp Khung Đồ Họa PNG Trong Suốt (Frame Overlay) nếu có
    if (opts.theme.overlayUrl) {
        try {
            const overlayImg = await loadImage(
                resolveAssetUrl(opts.theme.overlayUrl)
            )
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
        ctx.fillText(
            opts.eventName || DEFAULT_EVENT_NAME,
            width / 2,
            height - 85
        )

        // Ngày tháng & Bộ lọc
        ctx.font = '700 16px "Quicksand", sans-serif'
        ctx.letterSpacing = '0.5px'
        ctx.globalAlpha = 0.85
        ctx.fillText(
            `${opts.eventDate}  •  ${opts.filter.name}`,
            width / 2,
            height - 48
        )
        ctx.restore()
    }

    // Xuất ảnh chất lượng cao 100% (Quality 1.0 không nén) theo tiêu chuẩn Fotolism Kiosk
    return canvas.toDataURL('image/jpeg', 1.0)
}

/**
 * Lấy mẫu màu viền/góc của ảnh để làm màu nền khi scale thu nhỏ,
 * giúp mép ảnh hòa quyện liền mạch với khung (tránh viền trắng khi khung màu tối/kem).
 */
export function sampleImageEdgeColor(img: CanvasImageSource): string {
    try {
        if (typeof document === 'undefined') return '#FFFFFF'
        const sampleCanvas = document.createElement('canvas')
        sampleCanvas.width = 16
        sampleCanvas.height = 16
        const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return '#FFFFFF'
        ctx.drawImage(img, 0, 0, 16, 16)

        // 4 góc
        const corners = [
            ctx.getImageData(0, 0, 1, 1).data,
            ctx.getImageData(15, 0, 1, 1).data,
            ctx.getImageData(0, 15, 1, 1).data,
            ctx.getImageData(15, 15, 1, 1).data,
        ]

        const avgR = Math.round(corners.reduce((s, c) => s + c[0], 0) / 4)
        const avgG = Math.round(corners.reduce((s, c) => s + c[1], 0) / 4)
        const avgB = Math.round(corners.reduce((s, c) => s + c[2], 0) / 4)

        return `rgb(${avgR}, ${avgG}, ${avgB})`
    } catch {
        return '#FFFFFF'
    }
}

/**
 * Chuẩn hóa ảnh gửi tới máy in nhiệt DNP DS-RX1 / DS-RX1HS theo đúng chuẩn khổ in 4x6:
 * - Nếu là ảnh dải đơn 2x6 (600x1800): Ghép 2 dải 2x6 song song đứng cạnh nhau thành 1 tờ 4x6 đứng (1200 x 1800 px, 300 DPI) gồm 2 tấm 2x6 cạnh nhau.
 * - Nếu là ảnh khổ 4x6 (1200x1800 hoặc 1800x1200 hoặc 1240x1844): Giữ nguyên kích thước canvas.
 * - Áp dụng Print Scale (90% - 100%, bước 0.25%):
 *   Thu nhỏ nội dung đồng đều theo tỉ lệ (preserving aspect ratio), căn giữa 2 chiều,
 *   lấp viền bằng màu mẫu góc/viền của ảnh để hạn chế viền trắng.
 *   Không thay đổi kích thước canvas đầu ra.
 */
export async function preparePrintImageForDNP(
    sourceDataUrl: string,
    printScalePercent?: number
): Promise<string> {
    const img = await loadImage(sourceDataUrl)
    const srcW = img.naturalWidth || img.width
    const srcH = img.naturalHeight || img.height

    // Xác định tỉ lệ scale (mặc định DEFAULT_PRINT_SCALE = 95.50% nếu không truyền hoặc đọc từ localStorage)
    let effectiveScale =
        typeof printScalePercent === 'number'
            ? printScalePercent
            : DEFAULT_PRINT_SCALE
    if (
        typeof printScalePercent !== 'number' &&
        typeof window !== 'undefined'
    ) {
        try {
            const raw = localStorage.getItem('fotolism_print_scale')
            if (raw !== null) {
                const parsed = parseFloat(raw)
                if (!isNaN(parsed) && parsed >= 90 && parsed <= 100) {
                    effectiveScale = parsed
                }
            }
        } catch {}
    }
    effectiveScale = Math.min(100, Math.max(90, effectiveScale))
    const scaleFactor = effectiveScale / 100.0

    // Trường hợp 1: Dải strip đơn 2x6 (tỉ lệ ~ 1:3, ví dụ 600x1800)
    // Ghép 2 dải 2x6 song song đứng cạnh nhau thành 1 bản in khổ 4x6 (1200 x 1800 px)
    if (srcW < srcH && srcH / srcW >= 2.5) {
        const canvas = document.createElement('canvas')
        canvas.width = 1200
        canvas.height = 1800
        const ctx = canvas.getContext('2d')
        if (!ctx) return sourceDataUrl

        // Màu nền lấp viền lấy từ 4 góc ảnh
        const bgColor = sampleImageEdgeColor(img)
        ctx.fillStyle = bgColor
        ctx.fillRect(0, 0, 1200, 1800)

        // Tính kích thước và vị trí căn giữa cho từng dải trong khổ 600x1800
        const targetStripW = Math.round(600 * scaleFactor)
        const targetStripH = Math.round(1800 * scaleFactor)
        const leftColX = Math.round((600 - targetStripW) / 2)
        const rightColX = 600 + Math.round((600 - targetStripW) / 2)
        const offsetY = Math.round((1800 - targetStripH) / 2)

        // Dải 1: Bên trái (căn giữa trong ô 0 -> 600 px)
        ctx.drawImage(img, leftColX, offsetY, targetStripW, targetStripH)

        // Dải 2: Bên phải (căn giữa trong ô 600 -> 1200 px)
        ctx.drawImage(img, rightColX, offsetY, targetStripW, targetStripH)

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

    // Trường hợp 2: Khổ 4x6 hoặc tự do (1200x1800, 1800x1200, 1240x1844...)
    // 100% giữ nguyên hành vi in hiện tại
    if (scaleFactor >= 0.9999) {
        return sourceDataUrl
    }

    // Scale < 100%: Căn giữa, không biến dạng, giữ nguyên kích thước canvas
    const canvas = document.createElement('canvas')
    canvas.width = srcW
    canvas.height = srcH
    const ctx = canvas.getContext('2d')
    if (!ctx) return sourceDataUrl

    const bgColor = sampleImageEdgeColor(img)
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, srcW, srcH)

    const targetW = Math.round(srcW * scaleFactor)
    const targetH = Math.round(srcH * scaleFactor)
    const offsetX = Math.round((srcW - targetW) / 2)
    const offsetY = Math.round((srcH - targetH) / 2)

    ctx.drawImage(img, offsetX, offsetY, targetW, targetH)
    return canvas.toDataURL('image/jpeg', 0.98)
}
