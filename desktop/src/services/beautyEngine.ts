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

    // ── 2. THON GỌN MŨI TỰ NHIÊN (NOSE SLIMMING) ──
    if (u_slimFace > 0.0 && u_numFaces > 0) {
        for (int i = 0; i < 4; i++) {
            if (i >= u_numFaces) break;
            vec4 bounds = u_faceBounds[i];
            vec4 vline = u_faceVLine[i];
            float noseX = vline.z;
            float noseY = vline.w;
            float faceW = bounds.z;
            float faceH = bounds.w;

            float dNoseY = abs(uv.y - noseY);
            float noseRangeY = max(faceH * 0.14, 0.03);
            if (dNoseY < noseRangeY) {
                float yWeight = smoothstep(noseRangeY, 0.0, dNoseY);
                float dxNose = uv.x - noseX;
                float noseRangeX = max(faceW * 0.16, 0.03);
                if (abs(dxNose) < noseRangeX) {
                    float xWeight = smoothstep(noseRangeX, 0.0, abs(dxNose));
                    uv.x += dxNose * (u_slimFace * 0.14 * yWeight * xWeight);
                }
            }
        }
    }

    // ── 3. THON GỌN MẶT & CẰM V-LINE (FACE SLIMMING & V-LINE) ──
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
            if (dy > 0.0 && uv.y < chinY + faceH * 0.06) {
                float yNorm = dy / jawRange; // 0 ở chóp mũi, 1 ở đáy cằm

                // Trọng số bóp má (Face Slimming) quanh gò má và xương hàm
                float slimYWeight = smoothstep(0.04, 0.32, yNorm) * smoothstep(0.96, 0.64, yNorm);

                // Trọng số bóp cằm nhọn (V-Line) tập trung ở nửa dưới gần cằm
                float vLineYWeight = smoothstep(0.40, 0.85, yNorm) * smoothstep(1.10, 0.85, yNorm);

                float dx = uv.x - centerX;
                float halfJawW = max(faceW * 0.48, 0.04);
                float xNorm = abs(dx) / halfJawW;

                if (xNorm < 1.0) {
                    float xWeight = smoothstep(1.0, 0.15, xNorm);
                    float warpFactor = (u_slimFace * 0.28 * slimYWeight + u_vLine * 0.32 * vLineYWeight) * xWeight;
                    uv.x += dx * warpFactor;
                }
            }
        }
    }

    // Đảm bảo tọa độ uv luôn nằm an toàn trong giới hạn [0, 1] không bị đen viền
    uv = clamp(uv, vec2(0.0005, 0.0005), vec2(0.9995, 0.9995));

    vec3 centerColor = texture2D(u_image, uv).rgb;

    // ── 4. LÀM MỊN DA NHẸ NHÀNG, LIÊN TỤC VÀ TỰ NHIÊN (KHÔNG PHÂN MẢNH, KHÔNG VỠ HẠT) ──
    // Sử dụng mặt nạ hình học liên tục (smooth gradient), loại bỏ hoàn toàn việc threshold màu gây vỡ khối pixel
    float faceSmoothMask = 0.0;
    if (u_numFaces > 0 && u_skinSmooth > 0.01) {
        for (int i = 0; i < 4; i++) {
            if (i >= u_numFaces) break;
            vec4 bounds = u_faceBounds[i];
            vec4 vline = u_faceVLine[i];
            float chinY = vline.y;
            vec2 fCenter = vec2(bounds.x, bounds.y);
            float faceW = bounds.z;
            float faceH = bounds.w;

            // Khóa chặn đáy cằm mượt mà, tuyệt đối không lem ra cổ và ngực áo
            float chinCutoff = smoothstep(chinY + faceH * 0.03, chinY - faceH * 0.02, uv.y);

            // Bán kính oval khuôn mặt với dải chuyển tiếp siêu mượt (smooth gradient)
            float halfW = max(faceW * 0.46, 0.03);
            float halfH = max(faceH * 0.46, 0.04);
            vec2 normDist = vec2((uv.x - fCenter.x) / halfW, (uv.y - fCenter.y) / halfH);
            float ellipDist = length(normDist);

            if (ellipDist < 1.0) {
                float m = smoothstep(1.0, 0.25, ellipDist) * chinCutoff;
                faceSmoothMask = max(faceSmoothMask, m);
            }
        }
    }

    // Làm mịn dịu nhẹ (Soft blur 4 góc đối xứng, bảo toàn 100% cấu trúc chi tiết mắt mũi)
    vec3 finalColor = centerColor;
    if (faceSmoothMask > 0.005) {
        vec2 stepUV = vec2(1.0 / u_resolution.x, 1.0 / u_resolution.y) * (1.2 + u_skinSmooth * 2.2);
        vec3 softBlur = centerColor * 0.36;
        softBlur += texture2D(u_image, uv + vec2(-1.0, -1.0) * stepUV).rgb * 0.16;
        softBlur += texture2D(u_image, uv + vec2(1.0, -1.0) * stepUV).rgb * 0.16;
        softBlur += texture2D(u_image, uv + vec2(-1.0, 1.0) * stepUV).rgb * 0.16;
        softBlur += texture2D(u_image, uv + vec2(1.0, 1.0) * stepUV).rgb * 0.16;

        // Hòa trộn liên tục theo mask oval mượt, mức tối đa vừa phải (~35-40%) để giữ nét thật
        float blendFactor = faceSmoothMask * min(u_skinSmooth * 0.50, 0.42);
        finalColor = mix(centerColor, softBlur, blendFactor);
    }

    // Điều chỉnh độ sáng/tương phản nhẹ nhàng trên toàn khung (nếu có tùy chỉnh)
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
