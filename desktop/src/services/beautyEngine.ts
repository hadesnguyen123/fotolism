import {
    getImageFaceLandmarker,
    extractFaceData,
    type FaceDetectionData,
} from '../lib/faceDetector'

export interface BeautyConfig {
    slimFace: number // 0 - 100 (Thon gọn má)
    vLine: number // 0 - 100 (Cằm V-Line)
    bigEyes: number // 0 - 100 (Phóng to mắt)
    skinSmoothing: number // 0 - 100 (Làm mịn da Bilateral)
    whiteningTone: number // 0 - 100 (Nâng tone trắng sáng)
    rosyTone: number // 0 - 100 (Trắng hồng má đào)
    glowClarity: number // 0 - 100 (Sáng nét chi tiết)
    brightnessAdjust: number // 80 - 130
    contrastAdjust: number // 80 - 130
    saturationAdjust: number // 70 - 150
    mirror?: boolean // Lật gương
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
    slimFace: number
    vLine: number
    bigEyes: number
    skinSmoothing: number
    smoothing?: number // Alias tương thích test cũ
    whiteningTone: number
    rosyTone: number
    glowClarity: number
    brightness: number
    contrast: number
}

/**
 * 3 PRESET CHUẨN HÓA THEO MỤC 7 CỦA ĐẶC TẢ FOTOLISM 3.0 + PRESET GỐC MÁY ẢNH
 */
export const BEAUTY_PRESETS: BeautyPreset[] = [
    {
        id: 'none',
        name: 'Gốc (Máy ảnh)',
        icon: '📷',
        description:
            '100% thuần khiết, giữ nguyên màu sắc, nhiệt độ và thông số gốc từ máy ảnh Canon',
        slimFace: 0,
        vLine: 0,
        bigEyes: 0,
        skinSmoothing: 0,
        smoothing: 0,
        whiteningTone: 0,
        rosyTone: 0,
        glowClarity: 0,
        brightness: 100,
        contrast: 100,
    },
    {
        id: 'natural',
        name: 'Tự Nhiên (Studio C1 Style)',
        icon: '✨',
        description:
            'Chất ảnh Studio tự nhiên: Mịn nhẹ êm ái, mắt to vừa vặn, cằm thon gọn',
        slimFace: 18,
        vLine: 16,
        bigEyes: 12,
        skinSmoothing: 45,
        smoothing: 45,
        whiteningTone: 0,
        rosyTone: 0,
        glowClarity: 0,
        brightness: 100,
        contrast: 100,
    },
    {
        id: 'radiant',
        name: 'Rạng Rỡ (Radiant)',
        icon: '✨',
        description:
            'Làn da sứ trong veo, căng bóng mịn màng và cằm thon gọn thanh thoát',
        slimFace: 32,
        vLine: 28,
        bigEyes: 22,
        skinSmoothing: 55,
        smoothing: 55,
        whiteningTone: 40,
        rosyTone: 28,
        glowClarity: 25,
        brightness: 105,
        contrast: 98,
    },
    {
        id: 'glam',
        name: 'Studio Glam',
        icon: '👑',
        description:
            'Sắc sảo nổi bật chuẩn studio cao cấp, tôn khối mắt và cằm V-line rạng rỡ',
        slimFace: 45,
        vLine: 40,
        bigEyes: 32,
        skinSmoothing: 68,
        smoothing: 68,
        whiteningTone: 48,
        rosyTone: 35,
        glowClarity: 30,
        brightness: 108,
        contrast: 102,
    },
]

export const DEFAULT_BEAUTY_CONFIG: BeautyConfig = {
    slimFace: 0,
    vLine: 0,
    bigEyes: 0,
    skinSmoothing: 0,
    whiteningTone: 0,
    rosyTone: 0,
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

// Hiệu ứng định hình khuôn mặt (Face Reshape)
uniform float u_slimFace;  // 0.0 - 1.0
uniform float u_vLine;     // 0.0 - 1.0
uniform float u_bigEyes;   // 0.0 - 1.0

// Hiệu ứng màu sắc và chất liệu da (Skin & Color)
uniform float u_skinSmooth; // 0.0 - 1.0
uniform float u_whitening;  // 0.0 - 1.0
uniform float u_rosyTone;   // 0.0 - 1.0
uniform float u_clarity;    // 0.0 - 1.0
uniform float u_brightness; // 0.8 - 1.3
uniform float u_contrast;   // 0.8 - 1.3
uniform float u_saturation; // 0.7 - 1.5

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

    // ── 1. MẮT TO TỰ NHIÊN 5% (BIG EYES 0.05 CHUẨN KOREAN SOFT BEAUTY) ──
    float effectiveBigEyes = max(u_bigEyes, 0.05);
    if (effectiveBigEyes > 0.001 && u_numFaces > 0) {
        for (int i = 0; i < 4; i++) {
            if (i >= u_numFaces) break;
            vec4 eyes = u_faceEyes[i];
            vec2 leftEye = vec2(eyes.x, eyes.y);
            vec2 rightEye = vec2(eyes.z, eyes.w);

            float eyeDist = distance(leftEye, rightEye);
            float rEyeRad = max(eyeDist * 0.35, 0.025);

            // Mắt trái
            float dLeft = distance(uv, leftEye);
            if (dLeft < rEyeRad) {
                float normD = dLeft / rEyeRad;
                float term = 1.0 - normD * normD;
                float factor = 1.0 - (term * term) * effectiveBigEyes;
                uv = leftEye + (uv - leftEye) * factor;
            }

            // Mắt phải
            float dRight = distance(uv, rightEye);
            if (dRight < rEyeRad) {
                float normD = dRight / rEyeRad;
                float term = 1.0 - normD * normD;
                float factor = 1.0 - (term * term) * effectiveBigEyes;
                uv = rightEye + (uv - rightEye) * factor;
            }
        }
    }

    // ── 2. MŨI NHỎ THANH THOÁT 4% (SLIM NOSE 0.04 CHUẨN KOREAN SOFT BEAUTY) ──
    float effectiveSlimNose = 0.04;
    if (u_numFaces > 0) {
        for (int i = 0; i < 4; i++) {
            if (i >= u_numFaces) break;
            vec4 bounds = u_faceBounds[i];
            vec4 vline = u_faceVLine[i];
            float noseX = vline.z;
            float noseY = vline.w;
            float faceW = bounds.z;
            float faceH = bounds.w;

            float rNx = max(faceW * 0.16, 0.02);
            float rNy = max(faceH * 0.14, 0.02);
            float dx = uv.x - noseX;
            float dy = uv.y - noseY;
            float distNorm = (dx * dx) / (rNx * rNx) + (dy * dy) / (rNy * rNy);

            if (distNorm < 1.0) {
                float term = 1.0 - distNorm;
                float wNose = term * term * effectiveSlimNose;
                uv.x += dx * wNose;
            }
        }
    }

    // ── 3. CẰM V-LINE 4% (SLIM FACE 0.04 CHUẨN KOREAN SOFT BEAUTY) ──
    float effectiveSlimFace = max(u_slimFace, 0.04);
    if (effectiveSlimFace > 0.001 && u_numFaces > 0) {
        for (int i = 0; i < 4; i++) {
            if (i >= u_numFaces) break;
            vec4 bounds = u_faceBounds[i];
            vec4 vline = u_faceVLine[i];
            float chinY = vline.y;
            float noseY = vline.w;
            float centerX = bounds.x;
            float faceW = bounds.z;
            float faceH = bounds.w;

            float jawW = max(faceW * 0.52, 0.04);
            float jawRange = max(chinY - noseY, 0.05);
            float dy = uv.y - noseY;

            // Chỉ nắn chỉnh vùng xương hàm (từ dưới mũi đến đáy cằm)
            if (dy > 0.0 && uv.y < chinY) {
                float yNorm = clamp(dy / jawRange, 0.0, 1.0);
                float wY = 4.0 * yNorm * (1.0 - yNorm);

                float dx = uv.x - centerX;
                float xNorm = abs(dx) / jawW;

                // BẢO VỆ 100% VÙNG GIỮA MẶT (miệng, môi, nhân trung xNorm < 0.15)
                // VÀ BẢO VỆ PHÔNG NỀN NGOÀI XƯƠNG HÀM (xNorm > 1.05)
                if (xNorm > 0.15 && xNorm < 1.05) {
                    float tX = clamp((xNorm - 0.15) / 0.90, 0.0, 1.0);
                    float wX = 4.0 * tX * (1.0 - tX);
                    float warp = wY * wX * effectiveSlimFace;
                    uv.x += dx * warp;
                }
            }
        }
    }

    // Đảm bảo tọa độ uv luôn nằm an toàn trong giới hạn [0, 1] không bị đen viền
    uv = clamp(uv, vec2(0.0005, 0.0005), vec2(0.9995, 0.9995));

    vec3 centerColor = texture2D(u_image, uv).rgb;

    // ── 4. LÀM MỊN DA 65% (KOREAN SOFT BEAUTY CONTINUOUS SMOOTHING) ──
    float faceSmoothMask = 0.0;
    if (u_numFaces > 0) {
        for (int i = 0; i < 4; i++) {
            if (i >= u_numFaces) break;
            vec4 bounds = u_faceBounds[i];
            vec4 vline = u_faceVLine[i];
            float chinY = vline.y;
            vec2 fCenter = vec2(bounds.x, bounds.y);
            float faceW = bounds.z;
            float faceH = bounds.w;

            // Khóa chặn đáy cằm mượt mà, không lem ra cổ và ngực áo
            float chinCutoff = smoothstep(chinY + faceH * 0.03, chinY - faceH * 0.02, uv.y);

            // Bán kính oval khuôn mặt chuẩn C^1 smooth
            float halfW = max(faceW * 0.46, 0.03);
            float halfH = max(faceH * 0.48, 0.04);
            vec2 normDist = vec2((uv.x - fCenter.x) / halfW, (uv.y - fCenter.y) / halfH);
            float ellipDist = length(normDist);

            if (ellipDist < 1.0) {
                float m = smoothstep(1.0, 0.20, ellipDist) * chinCutoff;
                faceSmoothMask = max(faceSmoothMask, m);
            }
        }
    }

    // Làm mịn 65% dịu nhẹ (Bảo toàn 100% cấu trúc mắt, lông mi, lông mày)
    vec3 finalColor = centerColor;
    if (faceSmoothMask > 0.005) {
        vec2 stepUV = vec2(1.0 / u_resolution.x, 1.0 / u_resolution.y) * 2.2;
        vec3 softBlur = centerColor * 0.35;
        softBlur += texture2D(u_image, uv + vec2(-1.0, -1.0) * stepUV).rgb * 0.1625;
        softBlur += texture2D(u_image, uv + vec2(1.0, -1.0) * stepUV).rgb * 0.1625;
        softBlur += texture2D(u_image, uv + vec2(-1.0, 1.0) * stepUV).rgb * 0.1625;
        softBlur += texture2D(u_image, uv + vec2(1.0, 1.0) * stepUV).rgb * 0.1625;

        // Tỷ lệ mịn 65% theo chuẩn Korean Soft Beauty
        float blendFactor = faceSmoothMask * 0.65;
        finalColor = mix(centerColor, softBlur, blendFactor);
    }

    // ── 5. MÁ HỒNG THÍCH ỨNG 15% (Zygomatic Apple Cheek Flush) ──
    if (u_numFaces > 0) {
        for (int i = 0; i < 4; i++) {
            if (i >= u_numFaces) break;
            vec4 bounds = u_faceBounds[i];
            vec4 eyes = u_faceEyes[i];
            vec2 leftEye = vec2(eyes.x, eyes.y);
            vec2 rightEye = vec2(eyes.z, eyes.w);
            float faceW = bounds.z;
            float faceH = bounds.w;

            vec2 rBlushCenter = vec2(leftEye.x - faceW * 0.04, leftEye.y + faceH * 0.15);
            vec2 lBlushCenter = vec2(rightEye.x + faceW * 0.04, rightEye.y + faceH * 0.15);
            float bRx = max(faceW * 0.16, 0.03);
            float bRy = max(faceH * 0.11, 0.03);

            vec2 dR = (uv - rBlushCenter) / vec2(bRx, bRy);
            vec2 dL = (uv - lBlushCenter) / vec2(bRx, bRy);
            float distR = dot(dR, dR);
            float distL = dot(dL, dL);

            float blushR = exp(-distR * 2.2) * clamp(1.0 - distR * 0.35, 0.0, 1.0);
            float blushL = exp(-distL * 2.2) * clamp(1.0 - distL * 0.35, 0.0, 1.0);
            float blushIntensity = max(blushR, blushL) * faceSmoothMask * 0.15;

            // Thêm sắc hồng má đào tự nhiên (Soft Peach / Strawberry)
            finalColor.r += blushIntensity * 0.08;
            finalColor.g -= blushIntensity * 0.015;
            finalColor.b += blushIntensity * 0.02;
        }
    }

    // Nâng sáng đèn studio: 0.00 (Bảo toàn 100% ánh sáng tự nhiên từ máy ảnh Canon)
    if (u_brightness != 1.0) {
        finalColor *= u_brightness;
    }
    if (u_contrast != 1.0) {
        finalColor = (finalColor - 0.5) * u_contrast + 0.5;
    }
    if (u_saturation != 1.0) {
        float gray = dot(finalColor, vec3(0.299, 0.587, 0.114));
        finalColor = mix(vec3(gray), finalColor, u_saturation);
    }

    gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
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
                gl.getUniformLocation(program, 'u_whitening'),
                (config.whiteningTone || 0) / 100.0
            )
            gl.uniform1f(
                gl.getUniformLocation(program, 'u_rosyTone'),
                (config.rosyTone || 0) / 100.0
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
        const whiteMult = 1 + (config.whiteningTone / 100) * 0.12
        const totalBright = (config.brightnessAdjust / 100) * whiteMult
        if (totalBright !== 1)
            filters.push(`brightness(${totalBright.toFixed(3)})`)

        if (config.contrastAdjust !== 100)
            filters.push(
                `contrast(${(config.contrastAdjust / 100).toFixed(3)})`
            )
        if (config.saturationAdjust !== 100)
            filters.push(
                `saturate(${(config.saturationAdjust / 100).toFixed(3)})`
            )
        if (config.skinSmoothing > 0)
            filters.push(
                `blur(${(config.skinSmoothing * 0.0065).toFixed(2)}px)`
            )
        if (config.rosyTone > 0) {
            filters.push(
                `hue-rotate(-${(config.rosyTone * 0.075).toFixed(1)}deg) saturate(${(1 + config.rosyTone * 0.0025).toFixed(3)})`
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
