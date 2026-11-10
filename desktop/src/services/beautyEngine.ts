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
            'Chất ảnh Studio Capture One: Mịn màng 100%, xóa mụn 80%, sáng bọng mắt 80% và tone trắng hồng',
        slimFace: 18,
        vLine: 16,
        bigEyes: 12,
        skinSmoothing: 80,
        smoothing: 80,
        whiteningTone: 45,
        rosyTone: 35,
        glowClarity: 38,
        brightness: 104,
        contrast: 94,
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

    // ── 1. PHÓNG TO MẮT TỰ NHIÊN (BIG EYES) ──
    if (u_bigEyes > 0.0 && u_numFaces > 0) {
        for (int i = 0; i < 4; i++) {
            if (i >= u_numFaces) break;
            vec4 eyes = u_faceEyes[i];
            vec2 leftEye = vec2(eyes.x, eyes.y);
            vec2 rightEye = vec2(eyes.z, eyes.w);

            float eyeDist = distance(leftEye, rightEye);
            float eyeRadius = max(eyeDist * 0.28, 0.025);

            // Mắt trái
            float dLeft = distance(uv, leftEye);
            if (dLeft < eyeRadius) {
                float normD = dLeft / eyeRadius;
                float factor = 1.0 - (1.0 - normD * normD) * (u_bigEyes * 0.28);
                uv = leftEye + (uv - leftEye) * factor;
            }

            // Mắt phải
            float dRight = distance(uv, rightEye);
            if (dRight < eyeRadius) {
                float normD = dRight / eyeRadius;
                float factor = 1.0 - (1.0 - normD * normD) * (u_bigEyes * 0.28);
                uv = rightEye + (uv - rightEye) * factor;
            }
        }
    }

    // ── 2. THON GỌN MẶT & CẰM V-LINE (FACE SLIMMING & V-LINE) ──
    float totalSlim = max(u_slimFace, u_vLine);
    if (totalSlim > 0.0 && u_numFaces > 0) {
        for (int i = 0; i < 4; i++) {
            if (i >= u_numFaces) break;
            vec4 bounds = u_faceBounds[i];
            vec4 vline = u_faceVLine[i];
            float chinY = vline.y;
            float noseY = vline.w;
            float centerX = bounds.x;
            float faceW = bounds.z;
            float faceH = bounds.w;

            float dy = uv.y - noseY;
            float jawRange = max(chinY - noseY, 0.05);

            // Vùng tác động: Từ dưới mắt/chóp mũi đến ngay đáy cằm
            if (dy > 0.0 && uv.y < chinY + faceH * 0.08) {
                float yNorm = dy / jawRange; // 0 ở chóp mũi, 1 ở đáy cằm

                // Trọng số bóp má (Face Slimming) quanh gò má và xương hàm (0.10 - 0.70)
                float slimYWeight = smoothstep(0.04, 0.32, yNorm) * smoothstep(0.96, 0.64, yNorm);

                // Trọng số bóp cằm nhọn (V-Line) tập trung ở nửa dưới gần cằm (0.45 - 1.05)
                float vLineYWeight = smoothstep(0.40, 0.85, yNorm) * smoothstep(1.10, 0.85, yNorm);

                float dx = uv.x - centerX;
                float halfJawW = max(faceW * 0.48, 0.04);
                float xNorm = abs(dx) / halfJawW;

                // CHỈ TÁC ĐỘNG BÊN TRONG BÁN KÍNH MẶT, HOÀN TOÀN KHÔNG BỊ KÉO KHUNG HÌNH HAY NỀN
                if (xNorm < 1.0) {
                    float xWeight = smoothstep(1.0, 0.15, xNorm);
                    float warpFactor = (u_slimFace * 0.30 * slimYWeight + u_vLine * 0.35 * vLineYWeight) * xWeight;
                    uv.x += dx * warpFactor;
                }
            }
        }
    }

    // Đảm bảo tọa độ uv luôn nằm an toàn trong giới hạn [0, 1] không bị đen viền
    uv = clamp(uv, vec2(0.0005, 0.0005), vec2(0.9995, 0.9995));

    vec3 centerColor = texture2D(u_image, uv).rgb;

    // ── 3. NHẬN DIỆN MẶT NẠ DA NGƯỜI (DUAL YCBCR + RGB ADAPTIVE & EXCLUDE RED FABRIC) ──
    float Cb = -0.168736 * centerColor.r - 0.331264 * centerColor.g + 0.5 * centerColor.b + 0.5;
    float Cr = 0.5 * centerColor.r - 0.418688 * centerColor.g - 0.081312 * centerColor.b + 0.5;
    bool colorIsSkinYCbCr = (Cb >= 0.22 && Cb <= 0.64 && Cr >= 0.43 && Cr <= 0.82);
    bool colorIsSkinRGB = (centerColor.r > centerColor.g * 0.95) && (centerColor.g > centerColor.b * 0.85) && (centerColor.r > 0.12) && ((centerColor.r - centerColor.b) > 0.02);
    // Loại trừ triệt để vải rèm nhung đỏ có sắc đỏ và độ bão hòa cực lớn
    bool isRedFabric = (centerColor.r > centerColor.g * 1.65) && (centerColor.r > centerColor.b * 2.1);
    bool isLikelySkin = (colorIsSkinYCbCr || colorIsSkinRGB) && !isRedFabric;

    float isSkin = 0.0;
    if (u_numFaces > 0) {
        float faceProx = 0.0;
        for (int i = 0; i < 4; i++) {
            if (i >= u_numFaces) break;
            vec4 bounds = u_faceBounds[i];
            vec2 fCenter = vec2(bounds.x, bounds.y);
            float fRad = max(bounds.z, bounds.w) * 0.62;
            float dFace = distance(uv, fCenter);
            if (dFace < fRad) {
                faceProx = max(faceProx, smoothstep(fRad, fRad * 0.6, dFace));
            }
        }
        // CHỈ XÁC NHẬN VÙNG DA BÊN TRONG BÁN KÍNH KHUÔN MẶT, HOÀN TOÀN KHÔNG LEM RA PHÔNG NỀN
        isSkin = faceProx * (isLikelySkin ? 1.0 : 0.3);
    } else {
        isSkin = isLikelySkin ? 0.85 : 0.0;
    }

    // ── 4. LÀM MỊN DA BILATERAL FILTER GIỮ NGUYÊN CHI TIẾT (SKIN SMOOTHING) ──
    vec3 smoothedColor = centerColor;
    if (u_skinSmooth > 0.01 && isSkin > 0.05) {
        vec3 sumColor = vec3(0.0);
        float sumWeight = 0.0;
        vec2 stepUV = vec2(1.0 / u_resolution.x, 1.0 / u_resolution.y);
        float radius = 1.5 + u_skinSmooth * 6.5;

        for (float x = -3.0; x <= 3.0; x += 1.0) {
            for (float y = -3.0; y <= 3.0; y += 1.0) {
                vec2 offset = vec2(x, y) * stepUV * (radius / 3.0);
                vec3 sampleColor = texture2D(u_image, uv + offset).rgb;

                float distSpatial = dot(vec2(x, y), vec2(x, y));
                float wSpatial = exp(-distSpatial / 8.0);

                float diff = distance(centerColor, sampleColor);
                float wRange = exp(-diff * diff / (0.015 + (1.0 - u_skinSmooth) * 0.035));

                float w = wSpatial * wRange;
                sumColor += sampleColor * w;
                sumWeight += w;
            }
        }
        vec3 skinFiltered = sumColor / max(sumWeight, 0.0001);
        smoothedColor = mix(centerColor, skinFiltered, isSkin * min(u_skinSmooth * 1.25, 1.0));
    }

    // ── 5. NÂNG TONE TRẮNG SÁNG TỰ NHIÊN (SKIN WHITENING) ──
    vec3 result = smoothedColor;
    if (u_whitening > 0.0 && isSkin > 0.01) {
        float whiteEff = u_whitening * isSkin;
        result = mix(result, 1.0 - (1.0 - result) * (1.0 - result), whiteEff * 0.30);
        result += vec3(whiteEff * 0.07);
    }

    // ── 6. TRẮNG HỒNG MÁ ĐÀO (ROSY TONE) ──
    if (u_rosyTone > 0.0 && isSkin > 0.01) {
        float rosyEff = u_rosyTone * isSkin;
        result.r += rosyEff * 0.045;
        result.b += rosyEff * 0.022;
        result.g -= rosyEff * 0.016;
    }

    // ── 7. SÁNG NÉT CHI TIẾT (CLARITY - BẢO VỆ MẮT, LÔNG MI, TÓC) ──
    if (u_clarity > 0.0 && isSkin > 0.01) {
        vec3 detail = centerColor - smoothedColor;
        result += detail * (u_clarity * 0.50 * isSkin);
    }

    // ── 8. ĐỘ SÁNG, TƯƠNG PHẢN & ĐỘ BÃO HÒA (CHỈ TÁC ĐỘNG TRONG VÙNG DA MẶT, BẢO TOÀN PHÔNG NỀN) ──
    vec3 adjusted = result;
    if (u_brightness != 1.0) {
        adjusted *= u_brightness;
    }
    if (u_contrast != 1.0) {
        adjusted = (adjusted - 0.5) * u_contrast + 0.5;
    }
    if (u_saturation != 1.0) {
        float gray = dot(adjusted, vec3(0.299, 0.587, 0.114));
        adjusted = mix(vec3(gray), adjusted, u_saturation);
    }
    result = mix(result, adjusted, isSkin);

    // KẾT HỢP ALPHA BLEND: NGOÀI VÙNG MẶT (isSkin == 0.0) BẢO TOÀN 100% centerColor CỦA MÁY ẢNH
    vec3 finalColor = mix(centerColor, result, smoothstep(0.0, 0.15, isSkin));
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
