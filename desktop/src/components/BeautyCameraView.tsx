import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import {
    getFaceLandmarker,
    extractFaceData,
    type FaceDetectionData,
} from '../lib/faceDetector'
import {
    BEAUTY_VERTEX_SHADER,
    BEAUTY_FRAGMENT_SHADER,
} from '../services/beautyEngine'

export interface BeautyCameraHandle {
    captureFrame: () => string
    getVideoElement: () => HTMLVideoElement | null
    getImageElement: () => HTMLImageElement | null
    getCanvasElement: () => HTMLCanvasElement | null
}

interface BeautyCameraViewProps {
    stream?: MediaStream | null
    mjpegUrl?: string
    mirrorCamera: boolean
    slimFace: number // 0 - 100 (Thon gọn má)
    vLine?: number // 0 - 100 (Cằm V-Line)
    bigEyes?: number // 0 - 100 (Phóng to mắt)
    skinSmoothing: number // 0 - 100 (Làm mịn da Bilateral)
    whiteningTone: number // 0 - 100 (Nâng tone trắng sáng)
    rosyTone: number // 0 - 100 (Trắng hồng tự nhiên)
    glowClarity: number // 0 - 100 (Sáng nét chi tiết)
    brightnessAdjust?: number // 80 - 130
    contrastAdjust?: number // 80 - 130
    saturationAdjust?: number // 70 - 150
    className?: string
    style?: React.CSSProperties
}

/**
 * Làm mượt tọa độ khuôn mặt giữa các frame để chống rung (Temporal EMA Smoothing)
 */
function smoothFaces(
    prevFaces: FaceDetectionData[],
    newFaces: FaceDetectionData[]
): FaceDetectionData[] {
    if (prevFaces.length === 0 || newFaces.length === 0) return newFaces

    const alpha = 0.65 // 65% mới + 35% cũ
    return newFaces.map((nf, idx) => {
        const pf = prevFaces[idx]
        if (!pf) return nf

        // Nếu khoảng cách nhảy quá xa (> 20% khung hình), xem như khuôn mặt mới không làm mượt
        const dist = Math.hypot(
            nf.centerX - pf.centerX,
            nf.centerY - pf.centerY
        )
        if (dist > 0.2) return nf

        return {
            centerX: pf.centerX * (1 - alpha) + nf.centerX * alpha,
            centerY: pf.centerY * (1 - alpha) + nf.centerY * alpha,
            width: pf.width * (1 - alpha) + nf.width * alpha,
            height: pf.height * (1 - alpha) + nf.height * alpha,
            chinX: pf.chinX * (1 - alpha) + nf.chinX * alpha,
            chinY: pf.chinY * (1 - alpha) + nf.chinY * alpha,
            leftJawX: pf.leftJawX * (1 - alpha) + nf.leftJawX * alpha,
            leftJawY: pf.leftJawY * (1 - alpha) + nf.leftJawY * alpha,
            rightJawX: pf.rightJawX * (1 - alpha) + nf.rightJawX * alpha,
            rightJawY: pf.rightJawY * (1 - alpha) + nf.rightJawY * alpha,
            noseX: pf.noseX * (1 - alpha) + nf.noseX * alpha,
            noseY: pf.noseY * (1 - alpha) + nf.noseY * alpha,
            leftEyeX: pf.leftEyeX * (1 - alpha) + nf.leftEyeX * alpha,
            leftEyeY: pf.leftEyeY * (1 - alpha) + nf.leftEyeY * alpha,
            rightEyeX: pf.rightEyeX * (1 - alpha) + nf.rightEyeX * alpha,
            rightEyeY: pf.rightEyeY * (1 - alpha) + nf.rightEyeY * alpha,
            eyeDistance: pf.eyeDistance * (1 - alpha) + nf.eyeDistance * alpha,
        }
    })
}

export const BeautyCameraView = forwardRef<
    BeautyCameraHandle,
    BeautyCameraViewProps
>(
    (
        {
            stream,
            mjpegUrl,
            mirrorCamera,
            slimFace,
            vLine = 0,
            bigEyes = 0,
            skinSmoothing,
            whiteningTone,
            rosyTone,
            glowClarity,
            brightnessAdjust = 100,
            contrastAdjust = 100,
            saturationAdjust = 100,
            className,
            style,
        },
        ref
    ) => {
        const videoRef = useRef<HTMLVideoElement | null>(null)
        const imgRef = useRef<HTMLImageElement | null>(null)
        const canvasRef = useRef<HTMLCanvasElement | null>(null)
        const glRef = useRef<WebGLRenderingContext | null>(null)
        const programRef = useRef<WebGLProgram | null>(null)
        const textureRef = useRef<WebGLTexture | null>(null)
        const animIdRef = useRef<number | null>(null)
        const renderDirectRef = useRef<(() => boolean) | null>(null)

        const detectedFacesRef = useRef<FaceDetectionData[]>([])
        const lastDetectTimeRef = useRef<number>(0)
        const isDetectingRef = useRef<boolean>(false)

        // Khởi tạo MediaPipe Face Landmarker ngầm từ file offline
        useEffect(() => {
            getFaceLandmarker().then((landmarker) => {
                if (landmarker) {
                    console.log(
                        '✨ MediaPipe Face Landmarker đã sẵn sàng (Offline GPU)'
                    )
                }
            })
        }, [])

        // Expose capture frame API to parent component with zero-black-screen guarantee
        useImperativeHandle(ref, () => ({
            captureFrame: () => {
                // 1. Kích hoạt render đồng bộ 1 frame mới nhất vào buffer WebGL
                if (renderDirectRef.current) {
                    renderDirectRef.current()
                }

                const gl = glRef.current
                const canvas = canvasRef.current

                // Kiểm tra xem buffer WebGL có thực sự chứa pixel hình ảnh
                let isWebGlBufferValid = false
                if (gl && canvas && canvas.width > 0 && canvas.height > 0) {
                    try {
                        gl.flush()
                        gl.finish()

                        // Lấy mẫu điểm ảnh ở trung tâm
                        const pCenter = new Uint8Array(4)
                        gl.readPixels(
                            Math.floor(canvas.width / 2),
                            Math.floor(canvas.height / 2),
                            1,
                            1,
                            gl.RGBA,
                            gl.UNSIGNED_BYTE,
                            pCenter
                        )

                        if (pCenter[0] + pCenter[1] + pCenter[2] > 8) {
                            isWebGlBufferValid = true
                        } else {
                            const pLeft = new Uint8Array(4)
                            const pRight = new Uint8Array(4)
                            gl.readPixels(
                                Math.floor(canvas.width * 0.3),
                                Math.floor(canvas.height * 0.5),
                                1,
                                1,
                                gl.RGBA,
                                gl.UNSIGNED_BYTE,
                                pLeft
                            )
                            gl.readPixels(
                                Math.floor(canvas.width * 0.7),
                                Math.floor(canvas.height * 0.5),
                                1,
                                1,
                                gl.RGBA,
                                gl.UNSIGNED_BYTE,
                                pRight
                            )
                            if (
                                pLeft[0] + pLeft[1] + pLeft[2] > 8 ||
                                pRight[0] + pRight[1] + pRight[2] > 8
                            ) {
                                isWebGlBufferValid = true
                            }
                        }

                        if (isWebGlBufferValid) {
                            const dataUrl = canvas.toDataURL('image/jpeg', 0.98)
                            if (
                                dataUrl &&
                                dataUrl.length > 1000 &&
                                !dataUrl.startsWith('data:,')
                            ) {
                                return dataUrl
                            }
                        }
                    } catch (err) {
                        console.warn('WebGL readPixels/toDataURL error:', err)
                    }
                }

                // 2. Chụp trực tiếp từ Canon EDSDK MJPEG Image stream nếu đang kích hoạt
                if (
                    mjpegUrl &&
                    imgRef.current &&
                    (imgRef.current.naturalWidth > 0 ||
                        imgRef.current.width > 0)
                ) {
                    try {
                        const img = imgRef.current
                        const w = img.naturalWidth || 1920
                        const h = img.naturalHeight || 1080
                        const off = document.createElement('canvas')
                        off.width = w
                        off.height = h
                        const ctx = off.getContext('2d')
                        if (ctx) {
                            if (mirrorCamera) {
                                ctx.translate(w, 0)
                                ctx.scale(-1, 1)
                            }
                            ctx.drawImage(img, 0, 0, w, h)
                            const mjpegDataUrl = off.toDataURL(
                                'image/jpeg',
                                0.98
                            )
                            if (mjpegDataUrl && mjpegDataUrl.length > 1000) {
                                return mjpegDataUrl
                            }
                        }
                    } catch (mjpegErr) {
                        console.warn('MJPEG 2D capture error:', mjpegErr)
                    }
                }

                // 3. Chụp trực tiếp từ HTMLVideoElement bằng Canvas 2D
                const video = videoRef.current
                if (video && (video.videoWidth > 0 || video.readyState >= 2)) {
                    try {
                        const w = video.videoWidth || 1920
                        const h = video.videoHeight || 1080
                        const off = document.createElement('canvas')
                        off.width = w
                        off.height = h
                        const ctx = off.getContext('2d')
                        if (ctx) {
                            if (mirrorCamera) {
                                ctx.translate(w, 0)
                                ctx.scale(-1, 1)
                            }
                            ctx.drawImage(video, 0, 0, w, h)
                            const fallbackUrl = off.toDataURL(
                                'image/jpeg',
                                0.98
                            )
                            if (fallbackUrl && fallbackUrl.length > 1000) {
                                return fallbackUrl
                            }
                        }
                    } catch (fallbackErr) {
                        console.warn('Fallback 2D capture error:', fallbackErr)
                    }
                }

                return ''
            },
            getVideoElement: () => videoRef.current,
            getImageElement: () => imgRef.current,
            getCanvasElement: () => canvasRef.current,
        }))

        // Gán stream cho video ngầm khi dùng webcam
        useEffect(() => {
            const video = videoRef.current
            if (!video) return

            if (stream && !mjpegUrl) {
                video.srcObject = stream
                const playVideo = () => {
                    video
                        .play()
                        .catch((err) => console.warn('Video play error:', err))
                }
                video.addEventListener('loadedmetadata', playVideo, {
                    once: true,
                })
                video.addEventListener('canplay', playVideo, { once: true })
                playVideo()
            } else {
                video.srcObject = null
            }
        }, [stream, mjpegUrl])

        // Khởi tạo WebGL Pipeline với preserveDrawingBuffer = true
        useEffect(() => {
            const canvas = canvasRef.current
            if (!canvas) return

            const glOptions: WebGLContextAttributes = {
                preserveDrawingBuffer: true,
                alpha: false,
                premultipliedAlpha: false,
                antialias: false,
            }

            const gl = (canvas.getContext('webgl2', glOptions) ||
                canvas.getContext(
                    'webgl',
                    glOptions
                )) as WebGLRenderingContext | null

            if (!gl) {
                console.warn('WebGL not supported for Beauty Camera')
                return
            }
            glRef.current = gl

            // Compile Shaders
            function createShader(
                type: number,
                source: string
            ): WebGLShader | null {
                if (!gl) return null
                const shader = gl.createShader(type)
                if (!shader) return null
                gl.shaderSource(shader, source)
                gl.compileShader(shader)
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                    console.error(
                        'Shader compile failed:',
                        gl.getShaderInfoLog(shader)
                    )
                    gl.deleteShader(shader)
                    return null
                }
                return shader
            }

            const vs = createShader(gl.VERTEX_SHADER, BEAUTY_VERTEX_SHADER)
            const fs = createShader(gl.FRAGMENT_SHADER, BEAUTY_FRAGMENT_SHADER)
            if (!vs || !fs) return

            const program = gl.createProgram()
            if (!program) return
            gl.attachShader(program, vs)
            gl.attachShader(program, fs)
            gl.linkProgram(program)

            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                console.error(
                    'Program link failed:',
                    gl.getProgramInfoLog(program)
                )
                return
            }
            programRef.current = program
            gl.useProgram(program)

            // Quads: Full viewport coordinates
            const positions = new Float32Array([
                -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
            ])
            const posBuffer = gl.createBuffer()
            gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer)
            gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)
            const posLoc = gl.getAttribLocation(program, 'a_position')
            gl.enableVertexAttribArray(posLoc)
            gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

            // Texture UV coordinates (flipped Y for WebGL texture orientation)
            const texCoords = new Float32Array([
                0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0,
            ])
            const texBuffer = gl.createBuffer()
            gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer)
            gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW)
            const texLoc = gl.getAttribLocation(program, 'a_texCoord')
            gl.enableVertexAttribArray(texLoc)
            gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0)

            // Texture setup
            const texture = gl.createTexture()
            gl.bindTexture(gl.TEXTURE_2D, texture)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
            textureRef.current = texture

            return () => {
                if (animIdRef.current) cancelAnimationFrame(animIdRef.current)
                if (texture) gl.deleteTexture(texture)
                if (program) gl.deleteProgram(program)
            }
        }, [])

        // Real-time 60 FPS Render Loop
        useEffect(() => {
            const gl = glRef.current
            const program = programRef.current
            const canvas = canvasRef.current
            if (!gl || !program || !canvas) return

            const uResolution = gl.getUniformLocation(program, 'u_resolution')
            const uSlimFace = gl.getUniformLocation(program, 'u_slimFace')
            const uVLine = gl.getUniformLocation(program, 'u_vLine')
            const uBigEyes = gl.getUniformLocation(program, 'u_bigEyes')
            const uSkinSmooth = gl.getUniformLocation(program, 'u_skinSmooth')
            const uWhitening = gl.getUniformLocation(program, 'u_whitening')
            const uRosyTone = gl.getUniformLocation(program, 'u_rosyTone')
            const uClarity = gl.getUniformLocation(program, 'u_clarity')
            const uBrightness = gl.getUniformLocation(program, 'u_brightness')
            const uContrast = gl.getUniformLocation(program, 'u_contrast')
            const uSaturation = gl.getUniformLocation(program, 'u_saturation')
            const uMirror = gl.getUniformLocation(program, 'u_mirror')

            // Uniforms cho nhận diện khuôn mặt động MediaPipe
            const uNumFaces = gl.getUniformLocation(program, 'u_numFaces')
            const uFaceBounds = gl.getUniformLocation(program, 'u_faceBounds')
            const uFaceVLine = gl.getUniformLocation(program, 'u_faceVLine')
            const uFaceJaw = gl.getUniformLocation(program, 'u_faceJaw')
            const uFaceEyes = gl.getUniformLocation(program, 'u_faceEyes')

            let isRunning = true

            function doRender() {
                if (!gl || !program || !canvas) return false
                const isMjpeg = Boolean(mjpegUrl && imgRef.current)
                const video = videoRef.current
                const img = imgRef.current

                let mediaSource: TexImageSource | null = null
                let srcW = 1920
                let srcH = 1080

                if (isMjpeg && img) {
                    if (!img.complete || img.naturalWidth <= 0) return false
                    mediaSource = img
                    srcW = img.naturalWidth
                    srcH = img.naturalHeight
                } else if (video) {
                    if (video.readyState < video.HAVE_CURRENT_DATA) {
                        if (video.paused && stream) {
                            video.play().catch(() => {})
                        }
                        return false
                    }
                    mediaSource = video
                    srcW = video.videoWidth || 1920
                    srcH = video.videoHeight || 1080
                }

                if (!mediaSource) return false

                if (canvas.width !== srcW || canvas.height !== srcH) {
                    canvas.width = srcW
                    canvas.height = srcH
                    gl.viewport(0, 0, canvas.width, canvas.height)
                }

                gl.useProgram(program)

                // Cập nhật Uniforms tham số làm đẹp
                gl.uniform2f(uResolution, canvas.width, canvas.height)
                gl.uniform1f(uSlimFace, (slimFace || 0) / 100.0)
                gl.uniform1f(uVLine, (vLine || 0) / 100.0)
                gl.uniform1f(uBigEyes, (bigEyes || 0) / 100.0)
                gl.uniform1f(uSkinSmooth, (skinSmoothing || 0) / 100.0)
                gl.uniform1f(uWhitening, (whiteningTone || 0) / 100.0)
                gl.uniform1f(uRosyTone, (rosyTone || 0) / 100.0)
                gl.uniform1f(uClarity, (glowClarity || 0) / 100.0)
                gl.uniform1f(uBrightness, (brightnessAdjust || 100) / 100.0)
                gl.uniform1f(uContrast, (contrastAdjust || 100) / 100.0)
                gl.uniform1f(uSaturation, (saturationAdjust || 100) / 100.0)
                gl.uniform1i(uMirror, mirrorCamera ? 1 : 0)

                // Cập nhật tọa độ khuôn mặt MediaPipe phát hiện được
                const faces = detectedFacesRef.current
                const count = Math.min(faces.length, 4)
                gl.uniform1i(uNumFaces, count)

                if (count > 0) {
                    const boundsData = new Float32Array(16)
                    const vlineData = new Float32Array(16)
                    const jawData = new Float32Array(16)
                    const eyesData = new Float32Array(16)

                    for (let i = 0; i < count; i++) {
                        const f = faces[i]
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

                    gl.uniform4fv(uFaceBounds, boundsData)
                    gl.uniform4fv(uFaceVLine, vlineData)
                    gl.uniform4fv(uFaceJaw, jawData)
                    gl.uniform4fv(uFaceEyes, eyesData)
                }

                // Nạp khung hình video/image vào WebGL Texture
                gl.bindTexture(gl.TEXTURE_2D, textureRef.current)
                gl.texImage2D(
                    gl.TEXTURE_2D,
                    0,
                    gl.RGBA,
                    gl.RGBA,
                    gl.UNSIGNED_BYTE,
                    mediaSource
                )

                // Render Shader Quad
                gl.drawArrays(gl.TRIANGLES, 0, 6)
                return true
            }

            renderDirectRef.current = doRender

            function renderLoop() {
                if (!isRunning) return

                // Nhận diện khuôn mặt với MediaPipe ở ~25-30 FPS để tối ưu CPU/GPU
                const now = performance.now()
                if (
                    !isDetectingRef.current &&
                    now - lastDetectTimeRef.current >= 33
                ) {
                    lastDetectTimeRef.current = now
                    isDetectingRef.current = true

                    const isMjpeg = Boolean(mjpegUrl && imgRef.current)
                    const mediaElem = isMjpeg
                        ? imgRef.current
                        : videoRef.current
                    const isReady = isMjpeg
                        ? Boolean(
                              imgRef.current &&
                              imgRef.current.complete &&
                              imgRef.current.naturalWidth > 0
                          )
                        : Boolean(
                              videoRef.current &&
                              videoRef.current.readyState >= 2
                          )

                    if (isReady && mediaElem) {
                        getFaceLandmarker()
                            .then((landmarker) => {
                                if (landmarker && isRunning) {
                                    try {
                                        const results =
                                            landmarker.detectForVideo(
                                                mediaElem,
                                                now
                                            )
                                        const rawFaces = extractFaceData(
                                            results,
                                            false
                                        )
                                        if (rawFaces.length > 0) {
                                            detectedFacesRef.current =
                                                smoothFaces(
                                                    detectedFacesRef.current,
                                                    rawFaces
                                                )
                                        } else {
                                            detectedFacesRef.current = []
                                        }
                                    } catch {
                                        // Bỏ qua lỗi tạm thời khi frame đổi
                                    } finally {
                                        isDetectingRef.current = false
                                    }
                                } else {
                                    isDetectingRef.current = false
                                }
                            })
                            .catch(() => {
                                isDetectingRef.current = false
                            })
                    } else {
                        isDetectingRef.current = false
                    }
                }

                doRender()
                animIdRef.current = requestAnimationFrame(renderLoop)
            }

            animIdRef.current = requestAnimationFrame(renderLoop)

            return () => {
                isRunning = false
                if (animIdRef.current) {
                    cancelAnimationFrame(animIdRef.current)
                    animIdRef.current = null
                }
            }
        }, [
            stream,
            mjpegUrl,
            mirrorCamera,
            slimFace,
            vLine,
            bigEyes,
            skinSmoothing,
            whiteningTone,
            rosyTone,
            glowClarity,
            brightnessAdjust,
            contrastAdjust,
            saturationAdjust,
        ])

        return (
            <div
                className={`beauty-camera-container ${className || ''}`}
                style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    overflow: 'hidden',
                    backgroundColor: '#000',
                    ...style,
                }}
            >
                {/* Nguồn Video Webcam (ngầm) */}
                <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: 1,
                        height: 1,
                        opacity: 0.01,
                        pointerEvents: 'none',
                        zIndex: -999,
                    }}
                />

                {/* Nguồn MJPEG Canon EDSDK Live View (ngầm) */}
                {mjpegUrl && (
                    <img
                        ref={imgRef}
                        src={mjpegUrl}
                        alt="Canon EDSDK LiveView Source"
                        crossOrigin="anonymous"
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: 1,
                            height: 1,
                            opacity: 0.01,
                            pointerEvents: 'none',
                            zIndex: -999,
                        }}
                        onError={(_e) => {
                            setTimeout(() => {
                                if (imgRef.current && mjpegUrl) {
                                    imgRef.current.src = `${mjpegUrl}?retry=${Date.now()}`
                                }
                            }, 1200)
                        }}
                    />
                )}

                {/* Khung hiển thị WebGL Real-time Beauty Shader Canvas thống nhất cho cả Canon R100 và Webcam */}
                <canvas
                    ref={canvasRef}
                    className="camera-preview-element"
                    style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                    }}
                />
            </div>
        )
    }
)

BeautyCameraView.displayName = 'BeautyCameraView'
