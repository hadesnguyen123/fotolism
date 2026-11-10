import {
    FilesetResolver,
    FaceLandmarker,
    type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision'

let videoLandmarkerInstance: FaceLandmarker | null = null
let imageLandmarkerInstance: FaceLandmarker | null = null
let isInitializingVideo = false
let isInitializingImage = false
let initVideoPromise: Promise<FaceLandmarker | null> | null = null
let initImagePromise: Promise<FaceLandmarker | null> | null = null

export interface FaceDetectionData {
    centerX: number
    centerY: number
    width: number
    height: number
    chinX: number
    chinY: number
    leftJawX: number
    leftJawY: number
    rightJawX: number
    rightJawY: number
    noseX: number
    noseY: number
    leftEyeX: number
    leftEyeY: number
    rightEyeX: number
    rightEyeY: number
    eyeDistance: number
}

/**
 * Khởi tạo MediaPipe FaceLandmarker cho Real-time Video Stream (100% Offline)
 */
export async function getFaceLandmarker(): Promise<FaceLandmarker | null> {
    if (videoLandmarkerInstance) return videoLandmarkerInstance
    if (initVideoPromise) return initVideoPromise

    if (isInitializingVideo) return null
    isInitializingVideo = true

    initVideoPromise = (async () => {
        try {
            const vision =
                await FilesetResolver.forVisionTasks('/mediapipe/wasm')
            const landmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: '/mediapipe/models/face_landmarker.task',
                    delegate: 'GPU',
                },
                runningMode: 'VIDEO',
                numFaces: 4,
                outputFaceBlendshapes: false,
                outputFacialTransformationMatrixes: false,
            })
            videoLandmarkerInstance = landmarker
            isInitializingVideo = false
            return landmarker
        } catch (err) {
            console.warn(
                'Cannot initialize MediaPipe FaceLandmarker offline, falling back to CDN:',
                err
            )
            try {
                const cdnVision = await FilesetResolver.forVisionTasks(
                    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
                )
                const landmarker = await FaceLandmarker.createFromOptions(
                    cdnVision,
                    {
                        baseOptions: {
                            modelAssetPath:
                                'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                            delegate: 'GPU',
                        },
                        runningMode: 'VIDEO',
                        numFaces: 4,
                    }
                )
                videoLandmarkerInstance = landmarker
                isInitializingVideo = false
                return landmarker
            } catch (cdnErr) {
                console.error(
                    'Failed to load FaceLandmarker from CDN as well:',
                    cdnErr
                )
                isInitializingVideo = false
                return null
            }
        }
    })()

    return initVideoPromise
}

/**
 * Khởi tạo MediaPipe FaceLandmarker cho High-Quality Image Mode (100% Offline)
 */
export async function getImageFaceLandmarker(): Promise<FaceLandmarker | null> {
    if (imageLandmarkerInstance) return imageLandmarkerInstance
    if (initImagePromise) return initImagePromise

    if (isInitializingImage) return null
    isInitializingImage = true

    initImagePromise = (async () => {
        try {
            const vision =
                await FilesetResolver.forVisionTasks('/mediapipe/wasm')
            const landmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: '/mediapipe/models/face_landmarker.task',
                    delegate: 'GPU',
                },
                runningMode: 'IMAGE',
                numFaces: 4,
                outputFaceBlendshapes: false,
                outputFacialTransformationMatrixes: false,
            })
            imageLandmarkerInstance = landmarker
            isInitializingImage = false
            return landmarker
        } catch (err) {
            console.warn(
                'Cannot initialize Image FaceLandmarker offline, falling back to CDN:',
                err
            )
            try {
                const cdnVision = await FilesetResolver.forVisionTasks(
                    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
                )
                const landmarker = await FaceLandmarker.createFromOptions(
                    cdnVision,
                    {
                        baseOptions: {
                            modelAssetPath:
                                'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                            delegate: 'GPU',
                        },
                        runningMode: 'IMAGE',
                        numFaces: 4,
                    }
                )
                imageLandmarkerInstance = landmarker
                isInitializingImage = false
                return landmarker
            } catch (cdnErr) {
                console.error(
                    'Failed to load Image FaceLandmarker from CDN as well:',
                    cdnErr
                )
                isInitializingImage = false
                return null
            }
        }
    })()

    return initImagePromise
}

/**
 * Trích xuất tọa độ trọng tâm, cằm, xương hàm và hai mắt từ landmarks của từng khuôn mặt
 */
export function extractFaceData(
    result: FaceLandmarkerResult,
    mirror: boolean = false
): FaceDetectionData[] {
    if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
        return []
    }

    const faces: FaceDetectionData[] = []

    for (const landmarks of result.faceLandmarks) {
        // MediaPipe landmark indices:
        // 1: Chóp mũi (Nose Tip)
        // 10: Giữa trán (Forehead Top)
        // 152: Điểm dưới cùng của cằm (Chin Tip)
        // 234: Xương hàm góc trái (Left Jaw Angle)
        // 454: Xương hàm góc phải (Right Jaw Angle)
        // Mắt trái: 33 (góc ngoài), 133 (góc trong), 159 (mí trên), 145 (mí dưới)
        // Mắt phải: 263 (góc ngoài), 362 (góc trong), 386 (mí trên), 374 (mí dưới)

        const nose = landmarks[1]
        const forehead = landmarks[10]
        const chin = landmarks[152]
        const leftJaw = landmarks[234]
        const rightJaw = landmarks[454]

        if (!nose || !chin || !leftJaw || !rightJaw || !forehead) continue

        // Tính tâm mắt trái & mắt phải
        const leftEyeCornerOut = landmarks[33] || landmarks[130]
        const leftEyeCornerIn = landmarks[133] || landmarks[243]
        const rightEyeCornerIn = landmarks[362] || landmarks[463]
        const rightEyeCornerOut = landmarks[263] || landmarks[359]

        let leftEyeX = (leftEyeCornerOut.x + leftEyeCornerIn.x) * 0.5
        let leftEyeY = (leftEyeCornerOut.y + leftEyeCornerIn.y) * 0.5
        let rightEyeX = (rightEyeCornerIn.x + rightEyeCornerOut.x) * 0.5
        let rightEyeY = (rightEyeCornerIn.y + rightEyeCornerOut.y) * 0.5

        // Tính toán bounding box
        let minX = 1,
            maxX = 0,
            minY = 1,
            maxY = 0
        for (const p of landmarks) {
            if (p.x < minX) minX = p.x
            if (p.x > maxX) maxX = p.x
            if (p.y < minY) minY = p.y
            if (p.y > maxY) maxY = p.y
        }

        const width = maxX - minX
        const height = maxY - minY
        let centerX = (minX + maxX) / 2
        let chinX = chin.x
        let leftJawX = leftJaw.x
        let rightJawX = rightJaw.x
        let noseX = nose.x

        if (mirror) {
            centerX = 1 - centerX
            chinX = 1 - chinX
            const tempLeft = 1 - rightJawX
            rightJawX = 1 - leftJawX
            leftJawX = tempLeft
            noseX = 1 - noseX

            const tempEyeLeft = 1 - rightEyeX
            rightEyeX = 1 - leftEyeX
            leftEyeX = tempEyeLeft
        }

        const dxEyes = rightEyeX - leftEyeX
        const dyEyes = rightEyeY - leftEyeY
        const eyeDistance = Math.max(
            Math.sqrt(dxEyes * dxEyes + dyEyes * dyEyes),
            0.05
        )

        faces.push({
            centerX,
            centerY: (minY + maxY) / 2,
            width,
            height,
            chinX,
            chinY: chin.y,
            leftJawX,
            leftJawY: leftJaw.y,
            rightJawX,
            rightJawY: rightJaw.y,
            noseX,
            noseY: nose.y,
            leftEyeX,
            leftEyeY,
            rightEyeX,
            rightEyeY,
            eyeDistance,
        })
    }

    return faces
}
