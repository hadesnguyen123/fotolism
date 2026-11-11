import {
    getImageFaceLandmarker,
    extractFaceData,
    type FaceDetectionData,
} from '../lib/faceDetector'

export interface BeautyConfig {
    beautyEnabled?: boolean
    skinSmoothing: number // 0 - 100 (Target: 45%)
    skinToneEvenness?: number // 0 - 100 (Target: 30%)
    vLine: number // 0 - 100 (Target: 4%)
    bigEyes: number // 0 - 100 (Target: 5%)
    blush?: number // 0 - 100 (Target: 10%)
    rosyTone?: number // Alias tương thích blush
    slimFace?: number // Alias tương thích vLine
    whiteningTone?: number
    glowClarity?: number
    brightnessAdjust?: number
    contrastAdjust?: number
    saturationAdjust?: number
    mirror?: boolean
}

export interface BeautyConfigSnapshot extends BeautyConfig {
    presetId?: string | null
    timestamp?: number
}

export interface BeautyPreset {
    id: string
    name: string
    icon: string
    description: string
    beautyEnabled?: boolean
    skinSmoothing: number
    smoothing?: number // Alias tương thích test cũ
    skinToneEvenness?: number
    vLine: number
    bigEyes: number
    blush?: number
    rosyTone?: number
    slimFace: number
    whiteningTone: number
    glowClarity: number
    brightness: number
    contrast: number
}

/**
 * PRESETS CHUẨN HÓA — LIVE VIEW BEAUTY ENGINE (SIMPLIFIED)
 */
export const BEAUTY_PRESETS: BeautyPreset[] = [
    {
        id: 'none',
        name: 'Gốc (Máy ảnh)',
        icon: '📷',
        description:
            '100% thuần khiết, giữ nguyên màu sắc, nhiệt độ và thông số gốc từ máy ảnh Canon',
        beautyEnabled: false,
        skinSmoothing: 0,
        smoothing: 0,
        skinToneEvenness: 0,
        vLine: 0,
        bigEyes: 0,
        blush: 0,
        rosyTone: 0,
        slimFace: 0,
        whiteningTone: 0,
        glowClarity: 0,
        brightness: 100,
        contrast: 100,
    },
    {
        id: 'natural',
        name: 'Tự Nhiên (Natural)',
        icon: '✨',
        description:
            'Chất ảnh Studio tự nhiên: Mịn nhẹ 45%, đều màu da 30%, cằm V-line 4%, mắt to 5%, má hồng 10%',
        beautyEnabled: true,
        skinSmoothing: 45,
        smoothing: 45,
        skinToneEvenness: 30,
        vLine: 4,
        bigEyes: 5,
        blush: 10,
        rosyTone: 10,
        slimFace: 4,
        whiteningTone: 0,
        glowClarity: 0,
        brightness: 100,
        contrast: 100,
    },
    {
        id: 'radiant',
        name: 'Rạng Rỡ (Radiant)',
        icon: '✨',
        description:
            'Làn da sáng trong veo, căng bóng mịn màng và cằm thon gọn thanh thoát',
        beautyEnabled: true,
        skinSmoothing: 55,
        smoothing: 55,
        skinToneEvenness: 40,
        vLine: 6,
        bigEyes: 7,
        blush: 15,
        rosyTone: 15,
        slimFace: 6,
        whiteningTone: 40,
        glowClarity: 25,
        brightness: 105,
        contrast: 98,
    },
    {
        id: 'glam',
        name: 'Studio Glam',
        icon: '👑',
        description:
            'Phong cách idol ấn tượng: Da trắng sáng mịn màng, mắt to tròn, cằm thon gọn V-line',
        beautyEnabled: true,
        skinSmoothing: 68,
        smoothing: 68,
        skinToneEvenness: 50,
        vLine: 40,
        bigEyes: 32,
        blush: 20,
        rosyTone: 20,
        slimFace: 40,
        whiteningTone: 48,
        glowClarity: 30,
        brightness: 108,
        contrast: 102,
    },
]

export const DEFAULT_BEAUTY_CONFIG: BeautyConfig = {
    beautyEnabled: false,
    skinSmoothing: 0,
    skinToneEvenness: 0,
    vLine: 0,
    bigEyes: 0,
    blush: 0,
    rosyTone: 0,
    slimFace: 0,
    whiteningTone: 0,
    glowClarity: 0,
    brightnessAdjust: 100,
    contrastAdjust: 100,
    saturationAdjust: 100,
    mirror: true,
}

// ─────────────────────────────────────────────────────────────────────────────
// SHADER PIPELINE THỐNG NHẤT DÙNG CHUNG CHO CẢ PREVIEW VÀ ẢNH CHỤP CAO CẤP
// ─────────────────────────────────────────────────────────────────────────────

export const BEAUTY_VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
}
`

export const BEAUTY_FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_image;
uniform vec2 u_resolution;

// 1. Cờ Bật / Tắt Beauty
uniform bool u_beautyEnabled;

// 2. 5 Hiệu ứng cốt lõi Live View Beauty Engine (Simplified)
uniform float u_skinSmooth; // 0.0 - 1.0 (Target: 0.45)
uniform float u_skinTone;   // 0.0 - 1.0 (Target: 0.30)
uniform float u_vLine;      // 0.0 - 1.0 (Target: 0.04)
uniform float u_bigEyes;    // 0.0 - 1.0 (Target: 0.05)
uniform float u_rosyTone;   // 0.0 - 1.0 (Target: 0.10)

// Các Uniform giữ lại tương thích API và Unit tests
uniform float u_slimFace;
uniform float u_whitening;
uniform float u_clarity;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;

// Lật gương đồng bộ
uniform bool u_mirror;

// Tọa độ nhận diện khuôn mặt MediaPipe (Tối đa 4 người)
uniform int u_numFaces;
uniform vec4 u_faceBounds[4]; // (centerX, centerY, width, height)
uniform vec4 u_faceVLine[4];  // (chinX, chinY, noseX, noseY)
uniform vec4 u_faceJaw[4];    // (leftJawX, leftJawY, rightJawX, rightJawY)
uniform vec4 u_faceEyes[4];   // (leftEyeX, leftEyeY, rightEyeX, rightEyeY)

varying vec2 v_texCoord;

void main() {
    vec2 uv = v_texCoord;
    if (u_mirror) {
        uv.x = 1.0 - uv.x;
    }

    // Nếu tắt Beauty hoặc không có khuôn mặt, hiển thị 100% nguyên bản camera
    if (!u_beautyEnabled || u_numFaces == 0) {
        gl_FragColor = vec4(texture2D(u_image, uv).rgb, 1.0);
        return;
    }

    // ── 1. PHÓNG TO MẮT TỰ NHIÊN (BIG EYES: Target 0.05) ──
    float effBigEyes = clamp(u_bigEyes * 0.40, 0.0, 0.40);
    if (effBigEyes > 0.001) {
        for (int i = 0; i < 4; i++) {
            if (i >= u_numFaces) break;
            vec4 eyes = u_faceEyes[i];
            vec2 lEye = vec2(eyes.x, eyes.y);
            vec2 rEye = vec2(eyes.z, eyes.w);
            float eyeDist = distance(lEye, rEye);
            float eyeRad = max(eyeDist * 0.32, 0.030);

            // Mắt trái
            float dL = distance(uv, lEye);
            if (dL < eyeRad) {
                float normL = dL / eyeRad;
                float falloffL = 1.0 - normL * normL;
                float zoomL = 1.0 - (falloffL * falloffL) * effBigEyes;
                uv = lEye + (uv - lEye) * zoomL;
            }

            // Mắt phải
            float dR = distance(uv, rEye);
            if (dR < eyeRad) {
                float normR = dR / eyeRad;
                float falloffR = 1.0 - normR * normR;
                float zoomR = 1.0 - (falloffR * falloffR) * effBigEyes;
                uv = rEye + (uv - rEye) * zoomR;
            }
        }
    }

    // ── 2. CẰM THON GỌN V-LINE (V-LINE: Target 0.04) ──
    float vLineParam = max(u_vLine, u_slimFace);
    float effVLine = clamp(vLineParam * 0.28, 0.0, 0.28);
    if (effVLine > 0.001) {
        for (int i = 0; i < 4; i++) {
            if (i >= u_numFaces) break;
            vec4 bounds = u_faceBounds[i];
            vec4 vline = u_faceVLine[i];
            float chinY = vline.y;
            float noseY = vline.w;
            float centerX = bounds.x;
            float faceW = bounds.z;
            float jawRange = max(chinY - noseY, 0.04);
            float dy = uv.y - noseY;

            // Chỉ nắn chỉnh vùng dưới mũi đến đáy cằm
            if (dy > 0.0 && uv.y < chinY) {
                float yNorm = clamp(dy / jawRange, 0.0, 1.0);
                float wY = 4.0 * yNorm * (1.0 - yNorm);

                float dx = uv.x - centerX;
                float xNorm = abs(dx) / max(faceW * 0.50, 0.03);

                // BẢO VỆ 100% KHU VỰC MIỆNG/MÔI (xNorm < 0.20)
                // VÀ BẢO VỆ 100% PHÔNG NỀN NGOÀI KHUÔN MẶT (xNorm > 1.0)
                if (xNorm > 0.20 && xNorm < 1.0) {
                    float tX = (xNorm - 0.20) / 0.80;
                    float wX = 4.0 * tX * (1.0 - tX);
                    uv.x += dx * wY * wX * effVLine;
                }
            }
        }
    }

    uv = clamp(uv, vec2(0.0005, 0.0005), vec2(0.9995, 0.9995));
    vec3 centerColor = texture2D(u_image, uv).rgb;

    // ── 3. MẶT NẠ GIẢI PHẪU: BẢO VỆ MẮT, MÔI, TÓC, QUẦN ÁO & NỀN ──
    float faceSkinMask = 0.0;
    float blushMask = 0.0;

    for (int i = 0; i < 4; i++) {
        if (i >= u_numFaces) break;
        vec4 bounds = u_faceBounds[i];
        vec4 vline = u_faceVLine[i];
        vec4 eyes = u_faceEyes[i];

        float faceW = bounds.z;
        float faceH = bounds.w;
        vec2 fCenter = vec2(bounds.x, bounds.y);
        vec2 lEye = vec2(eyes.x, eyes.y);
        vec2 rEye = vec2(eyes.z, eyes.w);
        float eyeDist = distance(lEye, rEye);

        // 1. Oval da mặt
        float halfW = max(faceW * 0.42, 0.03);
        float halfH = max(faceH * 0.46, 0.04);
        float ellipDist = length(vec2((uv.x - fCenter.x) / halfW, (uv.y - fCenter.y) / halfH));
        float ovalMask = smoothstep(1.0, 0.35, ellipDist);

        // 2. Cắt đáy cằm mượt mà: bảo vệ cổ và cổ áo
        float chinCutoff = smoothstep(vline.y + faceH * 0.02, vline.y - faceH * 0.03, uv.y);
        ovalMask *= chinCutoff;

        // 3. Bảo vệ mắt, lông mi, chân mày (Zero smoothing trên vùng mắt)
        float dEyeL = distance(uv, lEye);
        float dEyeR = distance(uv, rEye);
        float eyeProtectR = max(eyeDist * 0.28, 0.025);
        float eyeGuard = min(smoothstep(eyeProtectR * 0.5, eyeProtectR, dEyeL),
                             smoothstep(eyeProtectR * 0.5, eyeProtectR, dEyeR));
        ovalMask *= eyeGuard;

        // 4. Bảo vệ môi và miệng
        float mouthY = vline.w + (vline.y - vline.w) * 0.48;
        float dMouth = length(vec2((uv.x - bounds.x) / max(faceW * 0.20, 0.02),
                                   (uv.y - mouthY) / max(faceH * 0.10, 0.015)));
        float mouthGuard = smoothstep(0.65, 1.15, dMouth);
        ovalMask *= mouthGuard;

        faceSkinMask = max(faceSkinMask, ovalMask);

        // 5. Vùng má hồng quả táo (Apple Cheek)
        vec2 leftCheek = vec2(lEye.x - faceW * 0.04, lEye.y + faceH * 0.14);
        vec2 rightCheek = vec2(rEye.x + faceW * 0.04, rEye.y + faceH * 0.14);
        vec2 rCheekRad = vec2(max(faceW * 0.15, 0.025), max(faceH * 0.10, 0.02));
        float dL = length((uv - leftCheek) / rCheekRad);
        float dR = length((uv - rightCheek) / rCheekRad);
        float bWeight = max(exp(-dL * dL * 2.2), exp(-dR * dR * 2.2)) * chinCutoff;
        blushMask = max(blushMask, bWeight);
    }

    vec3 resultColor = centerColor;

    // ── 4. LÀM MỊN DA & ĐỀU MÀU DA VỚI MULTI-TAP BILATERAL FILTER ──
    if (faceSkinMask > 0.01 && (u_skinSmooth > 0.001 || u_skinTone > 0.001)) {
        float rSmooth = 2.0 + clamp(u_skinSmooth, 0.0, 1.0) * 6.0;
        vec2 stepUV = vec2(rSmooth / u_resolution.x, rSmooth / u_resolution.y);
        vec3 s1 = texture2D(u_image, uv + vec2(-stepUV.x, -stepUV.y)).rgb;
        vec3 s2 = texture2D(u_image, uv + vec2( stepUV.x, -stepUV.y)).rgb;
        vec3 s3 = texture2D(u_image, uv + vec2(-stepUV.x,  stepUV.y)).rgb;
        vec3 s4 = texture2D(u_image, uv + vec2( stepUV.x,  stepUV.y)).rgb;
        vec3 s5 = texture2D(u_image, uv + vec2(-stepUV.x * 0.5, 0.0)).rgb;
        vec3 s6 = texture2D(u_image, uv + vec2( stepUV.x * 0.5, 0.0)).rgb;
        vec3 s7 = texture2D(u_image, uv + vec2(0.0, -stepUV.y * 0.5)).rgb;
        vec3 s8 = texture2D(u_image, uv + vec2(0.0,  stepUV.y * 0.5)).rgb;
        vec3 softBlur = (centerColor * 0.24) + ((s1 + s2 + s3 + s4) * 0.10) + ((s5 + s6 + s7 + s8) * 0.09);

        // Giữ lại đường nét và vân da tự nhiên (Edge Protection, chống da nhựa)
        float diff = length(centerColor - softBlur);
        float edgeFactor = 1.0 - smoothstep(0.03, 0.22, diff);

        // A. Làm mịn da (Skin Smoothing: 0.45 Target, tỉ lệ với thanh trượt)
        float smoothFactor = clamp(u_skinSmooth * 1.25, 0.0, 1.0) * faceSkinMask * edgeFactor;
        resultColor = mix(centerColor, softBlur, smoothFactor);

        // B. Đều màu da (Skin Tone Evenness: 0.30 Target, tỉ lệ với thanh trượt)
        float evenFactor = clamp(u_skinTone, 0.0, 1.0) * faceSkinMask * 0.65 * edgeFactor;
        vec3 avgTone = (softBlur + s5 + s6 + s7 + s8) * 0.20;
        resultColor = mix(resultColor, avgTone, evenFactor);
    }

    // ── 5. MÁ HỒNG TỰ NHIÊN (BLUSH: 0.10 Target, tỉ lệ với thanh trượt) ──
    float effBlush = clamp(u_rosyTone, 0.0, 1.0);
    if (blushMask > 0.01 && effBlush > 0.001) {
        vec3 blushPeach = vec3(0.96, 0.45, 0.50);
        float bWeight = blushMask * effBlush * 0.55;
        resultColor = mix(resultColor, mix(resultColor, blushPeach, 0.40), bWeight);
    }

    gl_FragColor = vec4(clamp(resultColor, 0.0, 1.0), 1.0);
}
`

/**
 * AI BEAUTY ENGINE CORE — XỬ LÝ ẢNH CHỤP CAO CẤP (HIGH-QUALITY MODE)
 * Đảm bảo 100% WYSIWYG: Preview hiển thị thế nào thì ảnh chụp ra như thế!
 */
export class BeautyEngine {
    private static instance: BeautyEngine
    private offscreenCanvas: HTMLCanvasElement | null = null
    private gl: WebGLRenderingContext | null = null
    private program: WebGLProgram | null = null
    private texture: WebGLTexture | null = null

    public static getInstance(): BeautyEngine {
        if (!BeautyEngine.instance) {
            BeautyEngine.instance = new BeautyEngine()
        }
        return BeautyEngine.instance
    }

    private initWebGLOffscreen(): boolean {
        if (this.gl && this.program) return true
        try {
            const canvas = document.createElement('canvas')
            const gl = (canvas.getContext('webgl2', {
                preserveDrawingBuffer: true,
                alpha: false,
            }) ||
                canvas.getContext('webgl', {
                    preserveDrawingBuffer: true,
                    alpha: false,
                })) as WebGLRenderingContext | null
            if (!gl) return false

            const vs = gl.createShader(gl.VERTEX_SHADER)!
            gl.shaderSource(vs, BEAUTY_VERTEX_SHADER)
            gl.compileShader(vs)

            const fs = gl.createShader(gl.FRAGMENT_SHADER)!
            gl.shaderSource(fs, BEAUTY_FRAGMENT_SHADER)
            gl.compileShader(fs)

            const program = gl.createProgram()!
            gl.attachShader(program, vs)
            gl.attachShader(program, fs)
            gl.linkProgram(program)

            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                console.error(
                    'BeautyEngine HQ Shader link failed:',
                    gl.getProgramInfoLog(program)
                )
                return false
            }

            // Quads
            const posBuffer = gl.createBuffer()
            gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer)
            gl.bufferData(
                gl.ARRAY_BUFFER,
                new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
                gl.STATIC_DRAW
            )
            const aPos = gl.getAttribLocation(program, 'a_position')
            gl.enableVertexAttribArray(aPos)
            gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

            const texBuffer = gl.createBuffer()
            gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer)
            gl.bufferData(
                gl.ARRAY_BUFFER,
                new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]),
                gl.STATIC_DRAW
            )
            const aTex = gl.getAttribLocation(program, 'a_texCoord')
            gl.enableVertexAttribArray(aTex)
            gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, 0, 0)

            const texture = gl.createTexture()
            gl.bindTexture(gl.TEXTURE_2D, texture)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

            this.offscreenCanvas = canvas
            this.gl = gl
            this.program = program
            this.texture = texture
            return true
        } catch (err) {
            console.warn('Cannot init offscreen WebGL for BeautyEngine:', err)
            return false
        }
    }

    /**
     * Xử lý ảnh chụp High-Quality từ Canon R100 hoặc Video Frame:
     * - Phát hiện khuôn mặt và landmarks độ phân giải cao
     * - Áp dụng chính xác cùng bộ shader, quy tắc biến dạng và màu sắc như Preview
     * - Đồng bộ hóa lật gương (Mirroring)
     */
    public async processHighQualityPhoto(
        imageSource: string | HTMLImageElement,
        config: BeautyConfigSnapshot
    ): Promise<{ success: boolean; dataUrl: string; hasFaces: boolean }> {
        // 1. Load ảnh nguồn vào Image element
        let img: HTMLImageElement
        if (typeof imageSource === 'string') {
            img = new Image()
            if (
                imageSource.startsWith('http://') ||
                imageSource.startsWith('https://')
            ) {
                img.crossOrigin = 'anonymous'
            }
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve()
                img.onerror = (e) => reject(e)
                img.src = imageSource
            })
        } else {
            img = imageSource
        }

        const width = img.naturalWidth || img.width || 1920
        const height = img.naturalHeight || img.height || 1080

        // 2. Chạy nhận diện khuôn mặt MediaPipe trên ảnh chất lượng cao
        let detectedFaces: FaceDetectionData[] = []
        try {
            const landmarker = await getImageFaceLandmarker()
            if (landmarker) {
                const results = landmarker.detect(img)
                // Không lật tọa độ ở đây vì shader sẽ tự xử lý lật gương uv.x
                detectedFaces = extractFaceData(results, false)
            }
        } catch (faceErr) {
            console.warn(
                '[BeautyEngine] Offline Image Face Landmark detect warning:',
                faceErr
            )
        }

        // 3. Khởi tạo WebGL Offscreen Context
        const isGlReady = this.initWebGLOffscreen()
        if (
            isGlReady &&
            this.gl &&
            this.program &&
            this.offscreenCanvas &&
            this.texture
        ) {
            const gl = this.gl
            const program = this.program
            const canvas = this.offscreenCanvas

            canvas.width = width
            canvas.height = height
            gl.viewport(0, 0, width, height)
            gl.useProgram(program)

            // Uniforms
            gl.uniform1i(
                gl.getUniformLocation(program, 'u_beautyEnabled'),
                config.beautyEnabled !== false ? 1 : 0
            )
            gl.uniform2f(
                gl.getUniformLocation(program, 'u_resolution'),
                width,
                height
            )
            gl.uniform1f(
                gl.getUniformLocation(program, 'u_slimFace'),
                (config.slimFace || 0) / 100.0
            )
            gl.uniform1f(
                gl.getUniformLocation(program, 'u_vLine'),
                (config.vLine || 0) / 100.0
            )
            gl.uniform1f(
                gl.getUniformLocation(program, 'u_bigEyes'),
                (config.bigEyes || 0) / 100.0
            )
            gl.uniform1f(
                gl.getUniformLocation(program, 'u_skinSmooth'),
                (config.skinSmoothing || 0) / 100.0
            )
            gl.uniform1f(
                gl.getUniformLocation(program, 'u_skinTone'),
                (config.skinToneEvenness !== undefined ? config.skinToneEvenness : 30) / 100.0
            )
            gl.uniform1f(
                gl.getUniformLocation(program, 'u_whitening'),
                (config.whiteningTone || 0) / 100.0
            )
            gl.uniform1f(
                gl.getUniformLocation(program, 'u_rosyTone'),
                (config.blush !== undefined ? config.blush : config.rosyTone || 0) / 100.0
            )
            gl.uniform1f(
                gl.getUniformLocation(program, 'u_clarity'),
                (config.glowClarity || 0) / 100.0
            )

            gl.uniform1f(
                gl.getUniformLocation(program, 'u_brightness'),
                (config.brightnessAdjust || 100) / 100.0
            )
            gl.uniform1f(
                gl.getUniformLocation(program, 'u_contrast'),
                (config.contrastAdjust || 100) / 100.0
            )
            gl.uniform1f(
                gl.getUniformLocation(program, 'u_saturation'),
                (config.saturationAdjust || 100) / 100.0
            )

            // Cờ lật gương: Đảm bảo ảnh chụp phải khớp 100% với Preview
            gl.uniform1i(
                gl.getUniformLocation(program, 'u_mirror'),
                config.mirror ? 1 : 0
            )

            // Nạp dữ liệu khuôn mặt
            const count = Math.min(detectedFaces.length, 4)
            gl.uniform1i(gl.getUniformLocation(program, 'u_numFaces'), count)

            if (count > 0) {
                const boundsData = new Float32Array(16)
                const vlineData = new Float32Array(16)
                const jawData = new Float32Array(16)
                const eyesData = new Float32Array(16)

                for (let i = 0; i < count; i++) {
                    const f = detectedFaces[i]
                    boundsData[i * 4 + 0] = f.centerX
                    boundsData[i * 4 + 1] = f.centerY
                    boundsData[i * 4 + 2] = f.width
                    boundsData[i * 4 + 3] = f.height

                    vlineData[i * 4 + 0] = f.chinX
                    vlineData[i * 4 + 1] = f.chinY
                    vlineData[i * 4 + 2] = f.noseX
                    vlineData[i * 4 + 3] = f.noseY

                    jawData[i * 4 + 0] = f.leftJawX
                    jawData[i * 4 + 1] = f.leftJawY
                    jawData[i * 4 + 2] = f.rightJawX
                    jawData[i * 4 + 3] = f.rightJawY

                    eyesData[i * 4 + 0] = f.leftEyeX
                    eyesData[i * 4 + 1] = f.leftEyeY
                    eyesData[i * 4 + 2] = f.rightEyeX
                    eyesData[i * 4 + 3] = f.rightEyeY
                }

                gl.uniform4fv(
                    gl.getUniformLocation(program, 'u_faceBounds'),
                    boundsData
                )
                gl.uniform4fv(
                    gl.getUniformLocation(program, 'u_faceVLine'),
                    vlineData
                )
                gl.uniform4fv(
                    gl.getUniformLocation(program, 'u_faceJaw'),
                    jawData
                )
                gl.uniform4fv(
                    gl.getUniformLocation(program, 'u_faceEyes'),
                    eyesData
                )
            }

            // Nạp ảnh chụp vào texture
            gl.bindTexture(gl.TEXTURE_2D, this.texture)
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGBA,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                img
            )

            // Vẽ shader quad
            gl.drawArrays(gl.TRIANGLES, 0, 6)

            const outputDataUrl = canvas.toDataURL('image/jpeg', 0.98)
            if (outputDataUrl && outputDataUrl.length > 1000) {
                return {
                    success: true,
                    dataUrl: outputDataUrl,
                    hasFaces: count > 0,
                }
            }
        }

        // 4. Dự phòng 100% Canvas 2D nếu WebGL không khả dụng
        return this.fallback2DProcessing(img, width, height, config)
    }

    private fallback2DProcessing(
        img: HTMLImageElement,
        width: number,
        height: number,
        config: BeautyConfigSnapshot
    ): { success: boolean; dataUrl: string; hasFaces: boolean } {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
            return {
                success: false,
                dataUrl: typeof img.src === 'string' ? img.src : '',
                hasFaces: false,
            }
        }

        // Bộ lọc màu tương tự
        const filters: string[] = []
        const whitening = config.whiteningTone ?? 0
        const brightness = config.brightnessAdjust ?? 100
        const contrast = config.contrastAdjust ?? 100
        const saturation = config.saturationAdjust ?? 100
        const blushVal = config.blush ?? config.rosyTone ?? 0

        const whiteMult = 1 + (whitening / 100) * 0.12
        const totalBright = (brightness / 100) * whiteMult
        if (totalBright !== 1)
            filters.push(`brightness(${totalBright.toFixed(3)})`)

        if (contrast !== 100)
            filters.push(`contrast(${(contrast / 100).toFixed(3)})`)
        if (saturation !== 100)
            filters.push(`saturate(${(saturation / 100).toFixed(3)})`)
        if (config.skinSmoothing > 0)
            filters.push(
                `blur(${(config.skinSmoothing * 0.0065).toFixed(2)}px)`
            )
        if (blushVal > 0) {
            filters.push(
                `hue-rotate(-${(blushVal * 0.075).toFixed(1)}deg) saturate(${(1 + blushVal * 0.0025).toFixed(3)})`
            )
        }

        if (filters.length > 0) ctx.filter = filters.join(' ')

        // Lật gương đồng bộ
        if (config.mirror) {
            ctx.translate(width, 0)
            ctx.scale(-1, 1)
        }

        ctx.drawImage(img, 0, 0, width, height)
        return {
            success: true,
            dataUrl: canvas.toDataURL('image/jpeg', 0.98),
            hasFaces: false,
        }
    }
}

export const beautyEngine = BeautyEngine.getInstance()
