/**
 * @file bwFilter.ts
 * Bộ lọc B&W hiệu chỉnh theo preset Capture One: dùng chung dữ liệu cấu hình với Python AI Service
 * (trộn kênh RGB, đường cong nâng điểm đen, làm mềm clarity âm và tối góc nhẹ).
 * Phụ thuộc: ai-service/data/bw-preset.json.
 */
import presetJson from '../../ai-service/data/bw-preset.json?raw'

export interface BwPresetConfig {
    name: string
    rgbWeights: [number, number, number]
    toneCurve: number[]
    vignette?: {
        c1: number
        c2: number
        minGain: number
        maxGain: number
    }
    clarity?: {
        sigmaRatio: number
        amount: number
    }
}

export const BW_PRESET = JSON.parse(presetJson) as BwPresetConfig

const FILTER_ID = 'fotolism-bw-preset'

/**
 * Đăng ký SVG filter trong sRGB để Live View CSS và Canvas 2D dùng chung trộn kênh + tone curve.
 * @returns Chuỗi CSS filter `url(#fotolism-bw-preset)`.
 */
export function registerBwFilter(): string {
    if (typeof document !== 'undefined' && !document.getElementById(FILTER_ID)) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('width', '0')
        svg.setAttribute('height', '0')
        svg.setAttribute('aria-hidden', 'true')
        svg.style.position = 'absolute'
        const row = [...BW_PRESET.rgbWeights, 0, 0].join(' ')
        const table = BW_PRESET.toneCurve.join(' ')
        svg.innerHTML = `<defs><filter id="${FILTER_ID}" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%"><feColorMatrix type="matrix" values="${row} ${row} ${row} 0 0 0 1 0"/><feComponentTransfer><feFuncR type="table" tableValues="${table}"/><feFuncG type="table" tableValues="${table}"/><feFuncB type="table" tableValues="${table}"/></feComponentTransfer></filter></defs>`
        document.documentElement.appendChild(svg)
    }
    return `url(#${FILTER_ID})`
}

export const BW_CSS_FILTER = registerBwFilter()
