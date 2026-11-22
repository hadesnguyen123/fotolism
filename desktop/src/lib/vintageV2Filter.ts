/**
 * @file vintageV2Filter.ts
 * Bộ lọc Vintage V2 (3D LUT 33^3 + Clarity âm + Film Grain 0.2) & Hạt Film B&W chạy trực tiếp trên Frontend
 * qua WebGL2 GPU (tự fallback về Canvas 2D nếu thiếu WebGL2), dùng chung dữ liệu LUT từ Python `ai-service`
 * để Preview và Final Strip khớp 100% mà không gọi lại `ai-service` lần 2.
 * Phụ thuộc: vintage-v2-lut.json, bwFilter.ts.
 */

import lutJsonRaw from '../../ai-service/data/vintage-v2-lut.json?raw'
import { BW_CSS_FILTER, BW_PRESET } from '../config/bwFilter'

interface VintageV2LutData {
    gridSize: number
    clarity: number
    grain: number
    lutBase64: string
}

const GRAIN_TILE_SIZE = 512

let decodedLut: {
    gridSize: number
    clarity: number
    grain: number
    tableRgb: Uint8Array
} | null = null

let grainTileF32: Float32Array | null = null
let grainTileU8: Uint8Array | null = null

function getVintageV2Lut() {
    if (decodedLut) return decodedLut
    const parsed = JSON.parse(lutJsonRaw) as VintageV2LutData
    const bin = atob(parsed.lutBase64)
    const tableRgb = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) {
        tableRgb[i] = bin.charCodeAt(i)
    }
    decodedLut = {
        gridSize: parsed.gridSize || 33,
        clarity: parsed.clarity ?? -8,
        grain: parsed.grain ?? 0.2,
        tableRgb,
    }
    return decodedLut
}

/**
 * Sinh mẫu hạt film chuẩn phân phối chuẩn (seed cố định 42) kích thước 512x512 để dùng chung cho WebGL & CPU.
 */
function ensureGrainTiles(): { f32: Float32Array; u8: Uint8Array } {
    if (grainTileF32 && grainTileU8) {
        return { f32: grainTileF32, u8: grainTileU8 }
    }
    const len = GRAIN_TILE_SIZE * GRAIN_TILE_SIZE
    const f32 = new Float32Array(len)
    const u8 = new Uint8Array(len)
    let state = 42 >>> 0
    const nextRand = () => {
        state = (state + 0x6d2b79f5) | 0
        let t = Math.imul(state ^ (state >>> 15), 1 | state)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    for (let i = 0; i < len; i += 2) {
        const u1 = Math.max(1e-7, nextRand())
        const u2 = nextRand()
        const mag = Math.sqrt(-2.0 * Math.log(u1))
        const th = 2.0 * Math.PI * u2
        const z0 = mag * Math.cos(th)
        const z1 = mag * Math.sin(th)
        f32[i] = z0
        u8[i] = Math.max(0, Math.min(255, Math.round(128 + z0 * 32)))
        if (i + 1 < len) {
            f32[i + 1] = z1
            u8[i + 1] = Math.max(0, Math.min(255, Math.round(128 + z1 * 32)))
        }
    }
    grainTileF32 = f32
    grainTileU8 = u8
    return { f32, u8 }
}

/**
 * Phủ hạt film tất định tập trung ở vùng midtone lên vùng hình chữ nhật của Canvas 2D (dùng cho B&W và fallback CPU).
 */
export function applyMidtoneGrainToCanvasRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    strength01: number
): void {
    const sigma = strength01 * 255
    if (sigma <= 0.05 || w <= 0 || h <= 0) return

    const { f32 } = ensureGrainTiles()
    const ix = Math.max(0, Math.floor(x))
    const iy = Math.max(0, Math.floor(y))
    const iw = Math.min(ctx.canvas.width - ix, Math.ceil(w))
    const ih = Math.min(ctx.canvas.height - iy, Math.ceil(h))
    if (iw <= 0 || ih <= 0) return

    const imgData = ctx.getImageData(ix, iy, iw, ih)
    const d = imgData.data
    for (let row = 0; row < ih; row++) {
        const tileRow = ((iy + row) % GRAIN_TILE_SIZE) * GRAIN_TILE_SIZE
        let p = row * iw * 4
        for (let col = 0; col < iw; col++, p += 4) {
            const lum = (0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2]) / 255
            const midW = Math.max(0.25, Math.min(1.0, 1.0 - Math.abs(lum - 0.5) * 1.4))
            const delta = f32[tileRow + ((ix + col) % GRAIN_TILE_SIZE)] * sigma * midW
            d[p] = Math.max(0, Math.min(255, Math.round(d[p] + delta)))
            d[p + 1] = Math.max(0, Math.min(255, Math.round(d[p + 1] + delta)))
            d[p + 2] = Math.max(0, Math.min(255, Math.round(d[p + 2] + delta)))
        }
    }
    ctx.putImageData(imgData, ix, iy)
}

// ─── WebGL2 3D LUT Singleton Engine ───────────────────────────────────────────

interface GlVintagePipeline {
    canvas: HTMLCanvasElement
    gl: WebGL2RenderingContext
    program: WebGLProgram
    lutTex: WebGLTexture
    grainTex: WebGLTexture
    origTex: WebGLTexture
    blurTex: WebGLTexture
    vao: WebGLVertexArrayObject
    uSizeLoc: WebGLUniformLocation | null
    uClarityLoc: WebGLUniformLocation | null
    uGrainSigmaLoc: WebGLUniformLocation | null
    uTexelLoc: WebGLUniformLocation | null
    uDestSizeLoc: WebGLUniformLocation | null
}

let cachedGlPipeline: GlVintagePipeline | null | undefined

const VERT_SRC = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
    gl_Position = vec4(a_pos, 0.0, 1.0);
    v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
}`

const FRAG_SRC = `#version 300 es
precision highp float;
precision highp sampler3D;

uniform sampler2D u_orig;
uniform sampler2D u_blur;
uniform sampler3D u_lut3d;
uniform sampler2D u_grain;
uniform float u_lutSize;
uniform float u_clarityFactor;
uniform float u_grainSigma;
uniform vec2 u_texel;
uniform vec2 u_destSize;

in vec2 v_uv;
out vec4 outColor;

float luma(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
    vec4 src = texture(u_orig, v_uv);
    float scale = (u_lutSize - 1.0) / u_lutSize;
    float offset = 0.5 / u_lutSize;
    vec3 lutCol = texture(u_lut3d, src.rgb * scale + offset).rgb;

    if (abs(u_clarityFactor) > 0.0001) {
        vec3 blurCol = texture(u_blur, v_uv).rgb;
        float tl = luma(texture(u_orig, v_uv + vec2(-u_texel.x, -u_texel.y)).rgb);
        float tc = luma(texture(u_orig, v_uv + vec2(0.0, -u_texel.y)).rgb);
        float tr = luma(texture(u_orig, v_uv + vec2(u_texel.x, -u_texel.y)).rgb);
        float ml = luma(texture(u_orig, v_uv + vec2(-u_texel.x, 0.0)).rgb);
        float mr = luma(texture(u_orig, v_uv + vec2(u_texel.x, 0.0)).rgb);
        float bl = luma(texture(u_orig, v_uv + vec2(-u_texel.x, u_texel.y)).rgb);
        float bc = luma(texture(u_orig, v_uv + vec2(0.0, u_texel.y)).rgb);
        float br = luma(texture(u_orig, v_uv + vec2(u_texel.x, u_texel.y)).rgb);
        float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
        float gy = (bl + 2.0 * bc + br) - (tl + 2.0 * tc + tr);
        float edgeKeep = clamp(1.0 - length(vec2(gx, gy)) * 2.5, 0.2, 1.0);
        float lumOrig = luma(src.rgb);
        float midW = clamp(4.0 * lumOrig * (1.0 - lumOrig), 0.0, 1.0);
        lutCol = clamp(lutCol + (lutCol - blurCol) * (u_clarityFactor * edgeKeep * midW), 0.0, 1.0);
    }

    if (u_grainSigma > 0.0002) {
        vec2 grainUv = (v_uv * u_destSize) / 512.0;
        float z = (texture(u_grain, grainUv).r * 255.0 - 128.0) / 32.0;
        float midGrain = clamp(1.0 - abs(luma(lutCol) - 0.5) * 1.4, 0.25, 1.0);
        lutCol = clamp(lutCol + vec3(z * u_grainSigma * midGrain), 0.0, 1.0);
    }

    outColor = vec4(lutCol, src.a);
}`

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
    const sh = gl.createShader(type)
    if (!sh) return null
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        gl.deleteShader(sh)
        return null
    }
    return sh
}

function getGlPipeline(): GlVintagePipeline | null {
    if (cachedGlPipeline !== undefined) return cachedGlPipeline
    if (typeof document === 'undefined') {
        cachedGlPipeline = null
        return null
    }

    try {
        const canvas = document.createElement('canvas')
        const gl = canvas.getContext('webgl2', {
            premultipliedAlpha: false,
            preserveDrawingBuffer: true,
        })
        if (!gl) {
            cachedGlPipeline = null
            return null
        }

        const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC)
        const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
        if (!vs || !fs) {
            cachedGlPipeline = null
            return null
        }

        const program = gl.createProgram()
        if (!program) {
            cachedGlPipeline = null
            return null
        }
        gl.attachShader(program, vs)
        gl.attachShader(program, fs)
        gl.linkProgram(program)
        gl.deleteShader(vs)
        gl.deleteShader(fs)
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            cachedGlPipeline = null
            return null
        }

        const vao = gl.createVertexArray()
        const vbo = gl.createBuffer()
        if (!vao || !vbo) {
            cachedGlPipeline = null
            return null
        }
        gl.bindVertexArray(vao)
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
        const posLoc = gl.getAttribLocation(program, 'a_pos')
        gl.enableVertexAttribArray(posLoc)
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

        const { gridSize, tableRgb } = getVintageV2Lut()
        const lutTex = gl.createTexture()!
        gl.bindTexture(gl.TEXTURE_3D, lutTex)
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE)
        gl.texImage3D(
            gl.TEXTURE_3D,
            0,
            gl.RGB8,
            gridSize,
            gridSize,
            gridSize,
            0,
            gl.RGB,
            gl.UNSIGNED_BYTE,
            tableRgb
        )

        const { u8 } = ensureGrainTiles()
        const grainTex = gl.createTexture()!
        gl.bindTexture(gl.TEXTURE_2D, grainTex)
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.R8,
            GRAIN_TILE_SIZE,
            GRAIN_TILE_SIZE,
            0,
            gl.RED,
            gl.UNSIGNED_BYTE,
            u8
        )

        const makeTex2D = () => {
            const tex = gl.createTexture()!
            gl.bindTexture(gl.TEXTURE_2D, tex)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
            return tex
        }

        cachedGlPipeline = {
            canvas,
            gl,
            program,
            lutTex,
            grainTex,
            origTex: makeTex2D(),
            blurTex: makeTex2D(),
            vao,
            uSizeLoc: gl.getUniformLocation(program, 'u_lutSize'),
            uClarityLoc: gl.getUniformLocation(program, 'u_clarityFactor'),
            uGrainSigmaLoc: gl.getUniformLocation(program, 'u_grainSigma'),
            uTexelLoc: gl.getUniformLocation(program, 'u_texel'),
            uDestSizeLoc: gl.getUniformLocation(program, 'u_destSize'),
        }
        return cachedGlPipeline
    } catch (err) {
        console.warn('[vintageV2Filter] WebGL2 init fallback to CPU:', err)
        cachedGlPipeline = null
        return null
    }
}

function buildLutOnlyCanvas(
    srcCanvas: HTMLCanvasElement,
    w: number,
    h: number
): HTMLCanvasElement {
    const out = document.createElement('canvas')
    out.width = w
    out.height = h
    const ctx = out.getContext('2d')
    if (!ctx) return out
    ctx.drawImage(srcCanvas, 0, 0, w, h)
    const imgData = ctx.getImageData(0, 0, w, h)
    const d = imgData.data
    const { gridSize, tableRgb } = getVintageV2Lut()
    const maxIdx = gridSize - 1
    const scale = maxIdx / 255
    const s2 = gridSize * gridSize

    for (let i = 0; i < d.length; i += 4) {
        const rs = d[i] * scale
        const gs = d[i + 1] * scale
        const bs = d[i + 2] * scale
        const r0 = Math.min(maxIdx - 1, rs | 0)
        const g0 = Math.min(maxIdx - 1, gs | 0)
        const b0 = Math.min(maxIdx - 1, bs | 0)
        const fr = rs - r0
        const fg = gs - g0
        const fb = bs - b0

        const base = (b0 * s2 + g0 * gridSize + r0) * 3
        const baseR = base + 3
        const baseG = base + gridSize * 3
        const baseRG = baseG + 3
        const baseB = base + s2 * 3
        const baseBR = baseB + 3
        const baseBG = baseB + gridSize * 3
        const baseBRG = baseBG + 3

        const w000 = (1 - fr) * (1 - fg) * (1 - fb)
        const w100 = fr * (1 - fg) * (1 - fb)
        const w010 = (1 - fr) * fg * (1 - fb)
        const w110 = fr * fg * (1 - fb)
        const w001 = (1 - fr) * (1 - fg) * fb
        const w101 = fr * (1 - fg) * fb
        const w011 = (1 - fr) * fg * fb
        const w111 = fr * fg * fb

        for (let c = 0; c < 3; c++) {
            const val =
                tableRgb[base + c] * w000 +
                tableRgb[baseR + c] * w100 +
                tableRgb[baseG + c] * w010 +
                tableRgb[baseRG + c] * w110 +
                tableRgb[baseB + c] * w001 +
                tableRgb[baseBR + c] * w101 +
                tableRgb[baseBG + c] * w011 +
                tableRgb[baseBRG + c] * w111
            d[i + c] = Math.max(0, Math.min(255, Math.round(val)))
        }
    }
    ctx.putImageData(imgData, 0, 0)
    return out
}

function applyVintageV2CpuToCanvas(
    targetCtx: CanvasRenderingContext2D,
    srcCanvas: HTMLCanvasElement,
    blurSmallCanvas: HTMLCanvasElement,
    clarityVal: number,
    grainVal: number
): void {
    const w = srcCanvas.width
    const h = srcCanvas.height
    const lutCanvas = buildLutOnlyCanvas(srcCanvas, w, h)
    const lutCtx = lutCanvas.getContext('2d')!
    const lutData = lutCtx.getImageData(0, 0, w, h)
    const srcCtx = srcCanvas.getContext('2d')!
    const origData = srcCtx.getImageData(0, 0, w, h)

    if (Math.abs(clarityVal) > 1e-4 && Math.min(w, h) >= 16) {
        const blurUp = document.createElement('canvas')
        blurUp.width = w
        blurUp.height = h
        const buCtx = blurUp.getContext('2d')
        if (buCtx) {
            buCtx.drawImage(blurSmallCanvas, 0, 0, w, h)
            const blurData = buCtx.getImageData(0, 0, w, h).data
            const d = lutData.data
            const o = origData.data
            const cFactor = (clarityVal / 100) * 0.5
            for (let i = 0; i < d.length; i += 4) {
                const lum = (0.2126 * o[i] + 0.7152 * o[i + 1] + 0.0722 * o[i + 2]) / 255
                const midW = Math.max(0, Math.min(1, 4 * lum * (1 - lum)))
                const weight = cFactor * midW * 0.85
                d[i] = Math.max(0, Math.min(255, Math.round(d[i] + (d[i] - blurData[i]) * weight)))
                d[i + 1] = Math.max(0, Math.min(255, Math.round(d[i + 1] + (d[i + 1] - blurData[i + 1]) * weight)))
                d[i + 2] = Math.max(0, Math.min(255, Math.round(d[i + 2] + (d[i + 2] - blurData[i + 2]) * weight)))
            }
        }
    }
    targetCtx.putImageData(lutData, 0, 0)
    if (grainVal > 1e-4) {
        applyMidtoneGrainToCanvasRect(targetCtx, 0, 0, w, h, Math.min(0.5, grainVal) * 0.12)
    }
}

/**
 * Vẽ vùng ảnh `(srcX..srcH)` qua Vintage V2 (WebGL2 3D LUT + Clarity 1/8 + Grain 0.2, fallback CPU nếu thiếu WebGL2)
 * trực tiếp lên `(drawX..drawH)` của Canvas đích.
 */
export function drawVintageV2Region(
    targetCtx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    srcX: number,
    srcY: number,
    srcW: number,
    srcH: number,
    drawX: number,
    drawY: number,
    drawW: number,
    drawH: number
): void {
    const rw = Math.max(1, Math.round(drawW))
    const rh = Math.max(1, Math.round(drawH))

    const srcCanvas = document.createElement('canvas')
    srcCanvas.width = rw
    srcCanvas.height = rh
    const sCtx = srcCanvas.getContext('2d')
    if (!sCtx) return
    sCtx.imageSmoothingEnabled = true
    sCtx.imageSmoothingQuality = 'high'
    sCtx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, rw, rh)

    // Tạo ảnh low-pass blur 1/8 độ phân giải phục vụ Clarity âm của Vintage V2
    const sw = Math.max(16, Math.round(rw / 8))
    const sh = Math.max(16, Math.round(rh / 8))
    const blurSmall = document.createElement('canvas')
    blurSmall.width = sw
    blurSmall.height = sh
    const bCtx = blurSmall.getContext('2d')
    const { gridSize, clarity, grain } = getVintageV2Lut()
    if (bCtx) {
        const sigmaFull = Math.max(8, Math.min(rw, rh) * 0.018)
        const sigmaSmall = Math.max(1, sigmaFull * (sw / rw))
        bCtx.filter = `blur(${sigmaSmall.toFixed(1)}px)`
        bCtx.drawImage(srcCanvas, 0, 0, sw, sh)
        bCtx.filter = 'none'
    }

    const pipe = getGlPipeline()
    if (pipe) {
        const { gl } = pipe
        if (pipe.canvas.width !== rw || pipe.canvas.height !== rh) {
            pipe.canvas.width = rw
            pipe.canvas.height = rh
        }
        // Làm mờ sau LUT 1/8 từ LUT CPU rất nhỏ (sw x sh ~ 68x90px, <0.2ms) để blurCol cùng không gian màu Vintage
        const lutBlurSmall = buildLutOnlyCanvas(blurSmall, sw, sh)

        gl.viewport(0, 0, rw, rh)
        gl.useProgram(pipe.program)
        gl.bindVertexArray(pipe.vao)
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)

        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, pipe.origTex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas)

        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, pipe.blurTex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, lutBlurSmall)

        gl.activeTexture(gl.TEXTURE2)
        gl.bindTexture(gl.TEXTURE_3D, pipe.lutTex)

        gl.activeTexture(gl.TEXTURE3)
        gl.bindTexture(gl.TEXTURE_2D, pipe.grainTex)

        gl.uniform1i(gl.getUniformLocation(pipe.program, 'u_orig'), 0)
        gl.uniform1i(gl.getUniformLocation(pipe.program, 'u_blur'), 1)
        gl.uniform1i(gl.getUniformLocation(pipe.program, 'u_lut3d'), 2)
        gl.uniform1i(gl.getUniformLocation(pipe.program, 'u_grain'), 3)
        gl.uniform1f(pipe.uSizeLoc, gridSize)
        gl.uniform1f(pipe.uClarityLoc, (clarity / 100) * 0.5)
        gl.uniform1f(pipe.uGrainSigmaLoc, Math.min(0.5, grain) * 0.12)
        gl.uniform2f(pipe.uTexelLoc, 1.0 / rw, 1.0 / rh)
        gl.uniform2f(pipe.uDestSizeLoc, rw, rh)

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        targetCtx.drawImage(pipe.canvas, 0, 0, rw, rh, drawX, drawY, drawW, drawH)
        return
    }

    const cpuOut = document.createElement('canvas')
    cpuOut.width = rw
    cpuOut.height = rh
    const cCtx = cpuOut.getContext('2d')
    if (!cCtx) return
    applyVintageV2CpuToCanvas(cCtx, srcCanvas, blurSmall, clarity, grain)
    targetCtx.drawImage(cpuOut, 0, 0, rw, rh, drawX, drawY, drawW, drawH)
}

/**
 * Phủ đủ Clarity âm, Vignette và hạt film (grain = 0.2) cho ô ảnh B&W Capture One trên Canvas 2D.
 */
export function applyBwPostLookToRegion(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    srcX: number,
    srcY: number,
    srcW: number,
    srcH: number,
    drawX: number,
    drawY: number,
    drawW: number,
    drawH: number,
    cssFilter?: string
): void {
    try {
        const clarityAmt = BW_PRESET.clarity?.amount ?? 0
        const sigmaRatio = BW_PRESET.clarity?.sigmaRatio ?? 0.008
        if (clarityAmt > 0 && typeof document !== 'undefined' && drawW > 0 && drawH > 0) {
            const blurW = Math.max(32, Math.round(drawW / 4))
            const blurH = Math.max(32, Math.round(drawH / 4))
            const blurCanvas = document.createElement('canvas')
            blurCanvas.width = blurW
            blurCanvas.height = blurH
            const bCtx = blurCanvas.getContext('2d')
            if (bCtx) {
                const baseFilter = cssFilter && cssFilter !== 'none' ? cssFilter : ''
                const sigmaPx = Math.max(1, blurW * sigmaRatio)
                bCtx.filter = `${baseFilter} blur(${sigmaPx.toFixed(1)}px)`.trim()
                bCtx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, blurW, blurH)
                ctx.save()
                ctx.globalAlpha = clarityAmt
                ctx.drawImage(blurCanvas, drawX, drawY, drawW, drawH)
                ctx.restore()
            }
        }

        const vig = BW_PRESET.vignette
        if (vig && typeof ctx.createRadialGradient === 'function') {
            ctx.save()
            const cx = drawX + drawW / 2
            const cy = drawY + drawH / 2
            const outerR = Math.hypot(drawW / 2, drawH / 2)
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerR)
            for (const stop of [0, 0.5, 0.75, 1]) {
                const r2 = stop * stop
                const gain = Math.max(vig.minGain, Math.min(vig.maxGain, 1 + vig.c1 * r2 + vig.c2 * r2 * r2))
                const v = Math.round(gain * 255)
                grad.addColorStop(stop, `rgb(${v}, ${v}, ${v})`)
            }
            ctx.globalCompositeOperation = 'multiply'
            ctx.fillStyle = grad
            ctx.fillRect(drawX, drawY, drawW, drawH)
            ctx.restore()
        }

        const grain = BW_PRESET.grain ?? 0.2
        if (grain > 1e-4) {
            applyMidtoneGrainToCanvasRect(ctx, drawX, drawY, drawW, drawH, grain * 0.14)
        }
    } catch (err) {
        console.warn('[vintageV2Filter] B&W post-look warning:', err)
    }
}

// ─── Bộ nhớ đệm Preview URL cho InteractiveStripPreview (0 file trên đĩa) ───

const previewUrlCache = new Map<string, Promise<string | null>>()

function loadImgElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const im = new Image()
        im.crossOrigin = 'anonymous'
        im.onload = () => resolve(im)
        im.onerror = (e) => reject(e)
        im.src = src
    })
}

/**
 * Kết xuất bản xem trước (tối đa cạnh dài 960px) cho 1 ảnh bằng cùng pipeline WebGL2/Canvas của Final Strip,
 * giữ ảnh nguồn `enhancedPath` (`natural`) và ổ đĩa hoàn toàn không thay đổi.
 */
export async function renderFilteredPreviewUrl(
    srcUrl: string,
    filterId: string
): Promise<string | null> {
    if (!srcUrl || !filterId || filterId === 'normal' || filterId === 'natural') {
        return null
    }
    const cacheKey = `${srcUrl}::${filterId}`
    const existing = previewUrlCache.get(cacheKey)
    if (existing) return existing

    const task = (async () => {
        try {
            const img = await loadImgElement(srcUrl)
            const maxDim = 960
            const scale = Math.min(1, maxDim / Math.max(1, img.width, img.height))
            const pw = Math.max(1, Math.round(img.width * scale))
            const ph = Math.max(1, Math.round(img.height * scale))

            const out = document.createElement('canvas')
            out.width = pw
            out.height = ph
            const ctx = out.getContext('2d')
            if (!ctx) return null

            if (filterId === 'retro_90s' || filterId === 'retro' || filterId === 'vintage' || filterId === 'vintage_v2') {
                drawVintageV2Region(ctx, img, 0, 0, img.width, img.height, 0, 0, pw, ph)
            } else if (filterId === 'vintage_noir' || filterId === 'monochrome' || filterId === 'bw') {
                ctx.filter = BW_CSS_FILTER
                ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, pw, ph)
                ctx.filter = 'none'
                applyBwPostLookToRegion(ctx, img, 0, 0, img.width, img.height, 0, 0, pw, ph, BW_CSS_FILTER)
            } else {
                return null
            }

            if (typeof out.toBlob === 'function') {
                const blob = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/jpeg', 0.92))
                if (blob) return URL.createObjectURL(blob)
            }
            return out.toDataURL('image/jpeg', 0.92)
        } catch (err) {
            console.warn('[vintageV2Filter] Preview render fallback to CSS:', err)
            previewUrlCache.delete(cacheKey)
            return null
        }
    })()

    previewUrlCache.set(cacheKey, task)
    return task
}
