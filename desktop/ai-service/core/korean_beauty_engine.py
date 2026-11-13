"""
Fotolism 3.0 — Korean Soft Beauty Engine
========================================
Dedicated pipeline for Korean Studio Soft Portrait Beauty:
1. Multi-Face Landmark Alignment & Anatomical Parsing
2. Non-Destructive Skin Segmentation & Sobel Edge Protection (Glasses / Jewelry / Lashes)
3. Texture-Aware Frequency Separation & Bilateral Denoising (Zero sensor noise amplification)
4. Porcelain Milky Skin Brightening & Soft Lighting Glow (CIELAB L* midtone enhancement)
5. Landmark-Anchored Virtual Makeup:
   - Rosy Blush: Anatomical Zygomatic Cheek Apple gradient (Soft Strawberry / Peach flush)
   - Lip Tint: Gradient lip enhancement with soft blurred border
6. Under-Eye Tear Trough Deficit Lift (Smooth Gaussian Hermite Gate)
7. Selective Eye, Lash & Eyebrow Sharpening (Zero sharpening on smoothed skin)
"""
import logging
import time
import threading
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple

import cv2
import numpy as np
from pydantic import BaseModel, Field

logger = logging.getLogger("ai_service.korean_beauty")

MODEL_PATH = Path(__file__).resolve().parent.parent / "data" / "face_detection_yunet_2023mar.onnx"
DENSE_MODEL_PATH = Path(__file__).resolve().parents[2] / "public" / "mediapipe" / "models" / "face_landmarker.task"
_dense_lock = threading.Lock()
_dense_landmarker = None
_dense_model_mtime = None


class KoreanBeautyConfig(BaseModel):
    presetId: str = Field("korean_soft_beauty", description="ID của preset")
    enabled: bool = Field(True, description="Bật/tắt preset Korean Soft Beauty")
    skinSmoothing: float = Field(0.65, ge=0.0, le=1.0, description="Mức làm mịn bề mặt da")
    blemishRemoval: float = Field(0.75, ge=0.0, le=1.0, description="Mức khử khuyết điểm và đốm thâm")
    selectiveBlemish: bool = Field(False, description="Bảo vệ cạnh nét và nốt tối khi nâng sáng khuyết điểm")
    shineReduction: float = Field(0.0, ge=0.0, le=1.0, description="Giảm phản sáng trên da, giữ lại texture")
    darkCirclesReduction: float = Field(0.40, ge=0.0, le=1.0, description="Nâng sáng quầng thâm dưới mắt")
    protectGlasses: bool = Field(False, description="Hạn chế biến dạng cạnh gọng quanh mắt")
    skinEvening: float = Field(0.60, ge=0.0, le=1.0, description="Mức làm đều màu da")
    skinTextureRetention: float = Field(0.65, ge=0.0, le=1.0, description="Tỷ lệ giữ lại vân da vi mô tự nhiên")
    rosyTone: float = Field(0.0, ge=0.0, le=1.0, description="Hồng nhẹ trên vùng da, độc lập với má hồng")
    skinYellowReduction: float = Field(0.0, ge=0.0, le=1.0, description="Giảm vàng chọn lọc trên da, độc lập cân bằng trắng")
    blushSpread: float = Field(1.0, ge=0.5, le=1.5)
    blushAdaptation: float = Field(0.75, ge=0.0, le=1.0)
    skinDiffuseLight: float = Field(0.0, ge=0.0, le=1.0)
    foundationCoverage: float = Field(0.0, ge=0.0, le=1.0)
    concealerStrength: float = Field(0.40, ge=0.0, le=1.0)
    upperLipStrength: float = Field(0.90, ge=0.0, le=3.0)
    upperLipPasses: int = Field(1, ge=1, le=3)

    @classmethod
    def white_pink(cls):
        return cls(presetId="white_pink", skinSmoothing=1.0, blemishRemoval=0.90,
                   skinEvening=0.50, skinTextureRetention=0.60, skinBrightening=0.55,
                   blushSpread=1.25, blushAdaptation=0.40, skinDiffuseLight=0.30,
                   skinYellowReduction=0.20,
                   rosyTone=0.60, rosyBlush=0.65, softGlow=0.0,
                   lipEnhancement=0.40, lipGloss=0.60, eyeSharpening=0.08,
                   slimFace=0.04, bigEyes=0.10, slimNose=0.10, selectiveBlemish=True,
                   shineReduction=0.30, protectGlasses=True,
                   upperLipStrength=2.70, upperLipPasses=3)

    @classmethod
    def white_pink_v2(cls):
        """Texture-first trial preset; independent of the established V1 values."""
        return cls(presetId="white_pink_v2", skinSmoothing=.70, blemishRemoval=.90,
                   skinEvening=.60, skinTextureRetention=.90, skinBrightening=.50,
                   rosyTone=.925, rosyBlush=.60, blushSpread=1.30,
                   blushAdaptation=.85, softGlow=.13,
                   lipEnhancement=.47, lipGloss=.90, eyeSharpening=.32,
                   slimFace=.10, bigEyes=.10, slimNose=.20, upperLipStrength=.445,
                   darkCirclesReduction=.70, skinYellowReduction=0.,
                   upperLipPasses=1, protectGlasses=True, selectiveBlemish=True,
                   globalSharpening=0., foundationCoverage=0.)

    skinBrightening: float = Field(0.00, ge=0.0, le=1.0, description="Nâng sáng trắng hồng trong trẻo (0.00 bảo toàn ánh sáng đèn studio thật)")
    softGlow: float = Field(0.03, ge=0.0, le=1.0, description="Độ mềm và ánh sáng studio dịu dàng")
    rosyBlush: float = Field(0.15, ge=0.0, le=1.0, description="Má hồng tự nhiên (15%, thích ứng giảm còn 5% nếu đã có má hồng sẵn)")
    lipEnhancement: float = Field(0.10, ge=0.0, le=1.0, description="Tăng sắc hồng tự nhiên cho môi")
    lipGloss: float = Field(0.0, ge=0.0, le=1.0, description="Tăng phản sáng sẵn có trên môi, độc lập sắc môi")
    eyeSharpening: float = Field(0.15, ge=0.0, le=1.0, description="Độ sắc nét chọn lọc cho mắt, mi và lông mày")
    globalSharpening: float = Field(0.00, ge=0.0, le=1.0, description="Sharpening toàn cảnh (mặc định 0.0)")
    slimFace: float = Field(0.04, ge=0.0, le=0.20, description="Cằm V-line 4% (3-5%)")
    bigEyes: float = Field(0.05, ge=0.0, le=0.20, description="Mắt to tự nhiên 5%")
    slimNose: float = Field(0.04, ge=0.0, le=0.20, description="Mũi nhỏ thanh thoát 4%")


class KoreanBeautyEngine:
    def __init__(self, model_path: Optional[Path] = None):
        self.model_path = model_path or MODEL_PATH
        self._detector_cache = threading.local()
        self.last_timings = {}

    def detect_faces(self, img_bgr: np.ndarray) -> List[Dict[str, Any]]:
        """Nhận diện khuôn mặt và 5 điểm Landmark giải phẫu bằng YuNet tỉ lệ chuẩn."""
        if not self.model_path.is_file():
            logger.warning(f"Model YuNet không tồn tại: {self.model_path}")
            return []

        h, w, _ = img_bgr.shape
        det_w, det_h = 960, 720
        small = cv2.resize(img_bgr, (det_w, det_h))
        # OpenCV detectors are mutable: cache one per request thread, never share across threads.
        key = (str(self.model_path), self.model_path.stat().st_mtime_ns, det_w, det_h)
        if getattr(self._detector_cache, 'key', None) != key:
            self._detector_cache.detector = cv2.FaceDetectorYN_create(str(self.model_path), '', (det_w, det_h), score_threshold=0.6)
            self._detector_cache.key = key
        detector = self._detector_cache.detector
        _, raw_faces = detector.detect(small)

        faces = []
        if raw_faces is not None:
            scale_x = w / det_w
            scale_y = h / det_h
            for face in raw_faces:
                box = face[0:4] * [scale_x, scale_y, scale_x, scale_y]
                landmarks = face[4:14] * ([scale_x, scale_y] * 5)
                faces.append({
                    "box": box.astype(int),
                    "landmarks": landmarks.reshape(5, 2).astype(int),
                    "conf": float(face[-1])
                })
        # Sắp xếp từ trái sang phải
        faces.sort(key=lambda f: f["box"][0])
        return faces

    def detect_dense_landmarks(self, img_bgr: np.ndarray, max_faces: int = 8, faces=None):
        """Run checked-in MediaPipe locally; use YuNet face crops for small/group faces."""
        global _dense_landmarker, _dense_model_mtime
        if not DENSE_MODEL_PATH.is_file():
            logger.warning("Dense Face Landmarker unavailable: local task model missing; using YuNet 5-point fallback")
            return None
        try:
            import mediapipe as mp
            mtime = DENSE_MODEL_PATH.stat().st_mtime_ns
            with _dense_lock:
                if _dense_landmarker is None or _dense_model_mtime != mtime:
                    if _dense_landmarker is not None:
                        _dense_landmarker.close()
                    options = mp.tasks.vision.FaceLandmarkerOptions(
                        base_options=mp.tasks.BaseOptions(model_asset_path=str(DENSE_MODEL_PATH)),
                        running_mode=mp.tasks.vision.RunningMode.IMAGE,
                        num_faces=max_faces,
                        output_face_blendshapes=False,
                        output_facial_transformation_matrixes=False)
                    _dense_landmarker = mp.tasks.vision.FaceLandmarker.create_from_options(options)
                    _dense_model_mtime = mtime
                # Run per YuNet face ROI so distant faces in a 24MP/group photo
                # are not lost when the whole frame is reduced to thumbnail size.
                # If YuNet gave no candidate, try the complete image once.
                h,w=img_bgr.shape[:2]
                regions=[]
                if faces:
                    for f in faces[:max_faces]:
                        x,y,bw,bh=map(int,f['box']);pad=int(max(bw,bh)*.25)
                        x0=max(0,x-pad);y0=max(0,y-pad);x1=min(w,x+bw+pad);y1=min(h,y+bh+pad)
                        if x1>x0 and y1>y0:
                            regions.append((img_bgr[y0:y1,x0:x1],x0,y0))
                if not regions:
                    scale=min(1.,1280./max(h,w))
                    small=cv2.resize(img_bgr,None,fx=scale,fy=scale,interpolation=cv2.INTER_AREA) if scale<1 else img_bgr
                    regions=[(small,0,0)]
                dense=[]
                for region,x0,y0 in regions:
                    rh,rw=region.shape[:2]
                    scale=min(1.,1280./max(rh,rw))
                    small=cv2.resize(region,None,fx=scale,fy=scale,interpolation=cv2.INTER_AREA) if scale<1 else region
                    rgb=cv2.cvtColor(small,cv2.COLOR_BGR2RGB)
                    mp_image=mp.Image(image_format=mp.ImageFormat.SRGB,data=rgb)
                    result=_dense_landmarker.detect(mp_image)
                    sh,sw=small.shape[:2]
                    for detected in result.face_landmarks:
                        pts=np.asarray([[p.x*sw/scale+x0,p.y*sh/scale+y0] for p in detected],dtype=np.float32)
                        if len(pts)>=468 and np.all(np.isfinite(pts)):
                            dense.append(pts)
            return dense
        except Exception as exc:
            logger.warning("Dense Face Landmarker failed; using YuNet 5-point fallback: %s", type(exc).__name__)
            return None

    @staticmethod
    def attach_dense_landmarks(faces, dense_landmarks):
        if not dense_landmarks:
            return False
        remaining=list(dense_landmarks)
        attached = 0
        for face in faces:
            x,y,bw,bh=face['box']
            center=np.array([x+bw*.5,y+bh*.5],np.float32)
            candidates=[]
            for i, pts in enumerate(remaining):
                pts=np.asarray(pts)
                if len(pts) < 468 or not np.all(np.isfinite(pts)):
                    continue
                lo=np.min(pts,axis=0);hi=np.max(pts,axis=0)
                ix=max(0.,min(x+bw,hi[0])-max(x,lo[0]));iy=max(0.,min(y+bh,hi[1])-max(y,lo[1]))
                overlap=(ix*iy)/max(1.,min(bw*bh,max(1.,(hi[0]-lo[0])*(hi[1]-lo[1]))))
                dense_center=(lo+hi)*.5
                center_error=np.linalg.norm((dense_center-center)/np.maximum([bw,bh],1.))
                if overlap >= .12 and center_error <= .65:
                    candidates.append((center_error-0.25*overlap,i,pts))
            if not candidates:
                continue
            _,idx,pts=min(candidates,key=lambda item:item[0])
            remaining.pop(idx)
            pts=np.asarray(pts,dtype=np.float32)
            if len(pts) < 468 or not np.all(np.isfinite(pts)):
                continue
            face['dense_landmarks']=pts
            attached += 1
        return attached == len(faces) and attached > 0

    @staticmethod
    def apply_dense_jaw_mapping(map_x, map_y, landmarks, strength):
        """
        Inverse jaw warp bounded by measured anatomical contours and chin landmark 152.
        Phân bố lực chuẩn giải phẫu (Smoothstep Bell Curve & Mouth Protection):
        - Trục ngang: Trọng số 0 tại vùng miệng (fraction <= 0.20), đạt đỉnh tại thân hàm (0.60),
          và hạ êm ái về 0 tại mép viền hàm (fraction >= 1.0) theo hàm sin^2(pi * u_x),
          triệt tiêu hoàn toàn shear boundary tearing ở ranh giới tóc/phông nền.
        - Trục dọc: Uốn cong liên tục theo sin^2(pi * t) từ chóp mũi đến đáy cằm,
          bảo vệ tuyệt đối vùng cổ bên dưới cằm (vertical >= 0 bằng 0 tuyệt đối).
        - Mouth Guard: Bảo vệ 100% hình thái khóe miệng, môi và răng không bị méo lệch.
        """
        h, w = map_x.shape
        pts = np.asarray(landmarks, dtype=np.float32)
        if len(pts) < 468 or not np.all(np.isfinite(pts)):
            return np.zeros((h, w), np.float32)
        chin = pts[152]
        eyes = (pts[33] + pts[133] + pts[362] + pts[263]) * 0.25
        down = chin - eyes
        face_height = float(np.linalg.norm(down))
        if face_height < 16:
            return np.zeros((h, w), np.float32)
        down /= face_height
        axis = np.array([down[1], -down[0]], np.float32)
        if axis[0] < 0:
            axis *= -1
        top = float(np.dot(pts[2] - chin, down))
        if top >= -face_height * 0.15:
            return np.zeros((h, w), np.float32)

        left = [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152]
        right = [454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152]
        oval = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
        outline = pts[oval]

        x0 = max(0, int(outline[:, 0].min()) - 4)
        x1 = min(w, int(outline[:, 0].max()) + 5)
        y0 = max(0, int(outline[:, 1].min()) - 4)
        y1 = min(h, int(outline[:, 1].max()) + 5)
        if x1 <= x0 or y1 <= y0:
            return np.zeros((h, w), np.float32)

        yy, xx = np.mgrid[y0:y1, x0:x1]
        dx = xx - chin[0]
        dy = yy - chin[1]
        horizontal = dx * axis[0] + dy * axis[1]
        vertical = dx * down[0] + dy * down[1]

        profiles = []
        for ids in (left, right):
            offset = pts[ids] - chin
            heights = offset @ down
            positions = offset @ axis
            order = np.argsort(heights)
            values = np.interp(vertical, heights[order], positions[order])
            profiles.append(values)

        widths = np.where(horizontal < 0, np.abs(profiles[0]), np.abs(profiles[1]))
        fraction = np.abs(horizontal) / np.maximum(widths, 1.0)

        # Trọng số dọc: Uốn cong liên tục theo sin^2(pi * t) từ mũi đến đáy cằm
        t = np.clip((vertical - top) / (-top), 0.0, 1.0)
        w_y = np.sin(np.pi * t) ** 2

        # Trọng số ngang: Hàm hình chuông C^1 smooth, 0 ở fraction <= 0.20 và fraction >= 1.0, cực đại ở 0.60
        u_x = np.clip((fraction - 0.20) / 0.80, 0.0, 1.0)
        w_x = np.sin(np.pi * u_x) ** 2

        # Chỉ áp dụng ở vùng khuôn mặt trên đáy cằm (vertical < 0), vùng cổ bên dưới giữ 0.0 tuyệt đối
        active = (vertical > top) & (vertical < 0) & (widths > 3)

        # Mouth Guard: Bảo vệ khuôn miệng và khóe môi không bị kéo méo khi cười
        mouth_center = (pts[61] + pts[291]) * 0.5
        mouth_w = max(10.0, float(np.linalg.norm(pts[291] - pts[61])))
        m_dx = xx - mouth_center[0]
        m_dy = yy - mouth_center[1]
        m_horiz = m_dx * axis[0] + m_dy * axis[1]
        m_vert = m_dx * down[0] + m_dy * down[1]
        m_dist = (m_horiz / (mouth_w * 0.65)) ** 2 + (m_vert / (mouth_w * 0.45)) ** 2
        mouth_guard = np.clip((m_dist - 0.50) / 0.60, 0.0, 1.0)
        mouth_guard = mouth_guard * mouth_guard * (3.0 - 2.0 * mouth_guard)

        weight = w_y * w_x * active * mouth_guard
        displacement = horizontal * weight * strength

        map_x[y0:y1, x0:x1] += displacement * axis[0]
        map_y[y0:y1, x0:x1] += displacement * axis[1]

        support = np.zeros((h, w), np.float32)
        support[y0:y1, x0:x1] = weight
        return support

    def apply_subtle_reshaping(
        self,
        img_bgr: np.ndarray,
        faces: List[Dict[str, Any]],
        slim_face: float = 0.045,
        big_eyes: float = 0.045,
        slim_nose: float = 0.045,
        protect_glasses: bool = False,
        pose_aware: bool = False
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Áp dụng vi chỉnh hình thể khuôn mặt nhẹ nhàng (4-5%):
        - Thon gọn viền hàm và má (Slim Face)
        - Phóng to tròng mắt tự nhiên (Big Eyes)
        - Thu gọn cánh mũi thanh thoát (Slim Nose)
        Bảo toàn C^1 continuity, hoàn toàn không méo mó phông nền hay chi tiết ngoại vi.
        """
        if len(faces) == 0 or (slim_face <= 0.001 and big_eyes <= 0.001 and slim_nose <= 0.001):
            return img_bgr, np.zeros(img_bgr.shape[:2], dtype=np.float32)

        h, w, _ = img_bgr.shape
        map_x, map_y = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
        reshape_mask = np.zeros((h, w), dtype=np.float32)

        for f in faces:
            bx, by, bw, bh = f["box"]
            lm = f["landmarks"]
            dense=f.get('reshape_landmarks') if pose_aware else None
            if dense is not None and len(dense)>=468 and np.all(np.isfinite(dense)):
                # Dense coordinates are confined to reshape. Retouch and makeup
                # continue using the established V2 masks and configuration.
                lm=np.array([(dense[33]+dense[133])*.5,(dense[362]+dense[263])*.5,dense[1],dense[61],dense[291]],np.float32)
            else:dense=None
            r_eye, l_eye, nose, m_r, m_l = lm

            # 1. MẮT TO TỰ NHIÊN (4-5%)
            if big_eyes > 0.001:
                eye_dist = np.linalg.norm(l_eye - r_eye)
                r_eye_rad = float(eye_dist * 0.35)

                for eye_pt in [r_eye, l_eye]:
                    ex, ey = float(eye_pt[0]), float(eye_pt[1])
                    x1 = max(0, int(ex - r_eye_rad * 1.5))
                    x2 = min(w, int(ex + r_eye_rad * 1.5))
                    y1 = max(0, int(ey - r_eye_rad * 1.5))
                    y2 = min(h, int(ey + r_eye_rad * 1.5))
                    if x2 <= x1 or y2 <= y1:
                        continue

                    roi_x = map_x[y1:y2, x1:x2]
                    roi_y = map_y[y1:y2, x1:x2]
                    dx = roi_x - ex
                    dy = roi_y - ey
                    dist_sq = dx**2 + dy**2
                    rad_sq = r_eye_rad**2

                    in_eye = dist_sq < rad_sq
                    norm_d = np.sqrt(dist_sq[in_eye]) / r_eye_rad
                    factor = 1.0 - ((1.0 - norm_d**2)**2) * big_eyes
                    roi_x[in_eye] = ex + dx[in_eye] * factor
                    roi_y[in_eye] = ey + dy[in_eye] * factor
                    map_x[y1:y2, x1:x2] = roi_x
                    map_y[y1:y2, x1:x2] = roi_y
                    reshape_mask[y1:y2, x1:x2] = np.maximum(reshape_mask[y1:y2, x1:x2], ((dist_sq < rad_sq).astype(np.float32)))

            # 2. MŨI NHỎ THANH THOÁT (4-5%)
            if slim_nose > 0.001:
                nx, ny = float(nose[0]), float(nose[1])
                r_nx = float(bw * 0.16)
                r_ny = float(bh * 0.14)

                x1 = max(0, int(nx - r_nx * 1.5))
                x2 = min(w, int(nx + r_nx * 1.5))
                y1 = max(0, int(ny - r_ny * 1.5))
                y2 = min(h, int(ny + r_ny * 1.5))
                if x2 > x1 and y2 > y1:
                    roi_x = map_x[y1:y2, x1:x2]
                    roi_y = map_y[y1:y2, x1:x2]
                    dx = roi_x - nx
                    dy = roi_y - ny
                    dist_norm = (dx / r_nx)**2 + (dy / r_ny)**2
                    in_nose = dist_norm < 1.0

                    w_nose = ((1.0 - dist_norm[in_nose])**2) * slim_nose
                    roi_x[in_nose] = roi_x[in_nose] + dx[in_nose] * w_nose
                    map_x[y1:y2, x1:x2] = roi_x
                    reshape_mask[y1:y2, x1:x2] = np.maximum(reshape_mask[y1:y2, x1:x2], (in_nose.astype(np.float32)))

            # 3. MẶT THON GỌN V-LINE (4-5%)
            if slim_face > 0.001 and dense is not None:
                dense_mask=self.apply_dense_jaw_mapping(map_x,map_y,dense,slim_face)
                reshape_mask=np.maximum(reshape_mask,dense_mask)
            elif slim_face > 0.001 and pose_aware:
                # YuNet has no chin landmark. Estimate a lower-face frame from
                # eyes/nose/mouth and skip inconsistent or strong-yaw geometry.
                eye_axis=(l_eye-r_eye).astype(np.float32)
                eye_distance=float(np.linalg.norm(eye_axis))
                mouth=(m_r+m_l).astype(np.float32)*.5
                lower=mouth-nose
                lower_length=float(np.linalg.norm(lower))
                if eye_distance>=8 and lower_length>=eye_distance*.2:
                    eye_axis/=eye_distance
                    down=np.array([-eye_axis[1],eye_axis[0]],np.float32)
                    lower/=lower_length
                    eye_center=(r_eye+l_eye)*.5
                    yaw=abs(float(np.dot(nose-eye_center,eye_axis)))/eye_distance
                    alignment=float(np.dot(lower,down))
                    mouth_width=float(np.linalg.norm(m_l-m_r))/eye_distance
                    if alignment>.75 and yaw<.40 and .45<mouth_width<1.4:
                        down=.65*down+.35*lower;down/=np.linalg.norm(down)
                        axis=np.array([down[1],-down[0]],np.float32)
                        eye_to_mouth=float(np.dot(mouth-eye_center,down))
                        chin_distance=max(eye_distance*.35,eye_to_mouth*.55)
                        top=float(np.dot(nose-mouth,down))
                        extent=eye_distance*1.35+chin_distance
                        x1=max(0,int(mouth[0]-extent));x2=min(w,int(mouth[0]+extent)+1)
                        y1=max(0,int(mouth[1]-extent));y2=min(h,int(mouth[1]+extent)+1)
                        yy,xx=np.mgrid[y1:y2,x1:x2]
                        dx=xx-mouth[0];dy=yy-mouth[1]
                        horizontal=dx*axis[0]+dy*axis[1]
                        vertical=dx*down[0]+dy*down[1]
                        t=np.clip((vertical-top)/max(1.,chin_distance-top),0.,1.)
                        half_width=eye_distance*1.20*(1.-.40*t*t)
                        side=np.abs(horizontal)/np.maximum(half_width,1.)
                        band=np.clip((side-.20)/.85,0.,1.)
                        active=(side>.20)&(side<1.05)&(vertical>top)&(vertical<chin_distance)
                        weight=(4.*t*(1.-t))*(4.*band*(1.-band))*active
                        # Skin evidence suppresses displacement in hair/background.
                        region=img_bgr[y1:y2,x1:x2]
                        ycc=cv2.cvtColor(region,cv2.COLOR_BGR2YCrCb)
                        hsv=cv2.cvtColor(region,cv2.COLOR_BGR2HSV)
                        skin=((ycc[...,0]>=65)&(ycc[...,1]>=130)&(ycc[...,2]>=85)&(ycc[...,2]<=138)&(hsv[...,1]<=165)).astype(np.float32)
                        skin=cv2.GaussianBlur(skin,(0,0),1.2)
                        displacement=horizontal*weight*slim_face*skin
                        map_x[y1:y2,x1:x2]+=displacement*axis[0]
                        map_y[y1:y2,x1:x2]+=displacement*axis[1]
                        reshape_mask[y1:y2,x1:x2]=np.maximum(reshape_mask[y1:y2,x1:x2],weight*skin)
            elif slim_face > 0.001:
                cx = float(bx + bw / 2.0)
                ny = float(nose[1])
                chin_y = float(by + bh * 0.94)
                jaw_w = float(bw * 0.52)
                jaw_range = max(10.0, chin_y - ny)

                y1 = max(0, int(ny - bh * 0.06))
                y2 = min(h, int(chin_y + bh * 0.08))
                x1 = max(0, int(cx - jaw_w * 1.4))
                x2 = min(w, int(cx + jaw_w * 1.4))

                if x2 > x1 and y2 > y1:
                    roi_x = map_x[y1:y2, x1:x2]
                    roi_y = map_y[y1:y2, x1:x2]
                    dx = roi_x - cx
                    dy = roi_y - ny

                    y_norm = np.clip(dy / jaw_range, 0.0, 1.0)
                    w_y = 4.0 * y_norm * (1.0 - y_norm)

                    x_norm = np.abs(dx) / jaw_w
                    in_jaw = (x_norm > 0.15) & (x_norm < 1.05) & (y_norm > 0.02) & (y_norm < 0.98)
                    t_x = np.clip((x_norm[in_jaw] - 0.15) / 0.90, 0.0, 1.0)
                    w_x = 4.0 * t_x * (1.0 - t_x)
                    warp = w_y[in_jaw] * w_x * slim_face

                    roi_x[in_jaw] = roi_x[in_jaw] + dx[in_jaw] * warp
                    map_x[y1:y2, x1:x2] = roi_x

                    m_jaw = np.zeros_like(roi_x)
                    m_jaw[in_jaw] = 1.0
                    reshape_mask[y1:y2, x1:x2] = np.maximum(reshape_mask[y1:y2, x1:x2], m_jaw)

        if protect_glasses:
            # Edge heuristic in the spectacle belt, excluding the central eye areas.
            # This does not semantically detect glasses; feather displacement, not image pixels.
            edge, _ = self.build_edge_protection(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY))
            belt = np.zeros((h, w), dtype=np.float32)
            for face in faces:
                eyes = face['landmarks'][:2]
                distance = max(1.0, float(np.linalg.norm(eyes[1] - eyes[0])))
                cx, cy = np.mean(eyes, axis=0)
                x1, x2 = max(0, int(cx-distance)), min(w, int(cx+distance))
                y1, y2 = max(0, int(cy-distance*.5)), min(h, int(cy+distance*.6))
                yy, xx = np.ogrid[y1:y2, x1:x2]
                region = np.ones((y2-y1, x2-x1), dtype=np.float32)
                for ex, ey in eyes:
                    radius = np.sqrt((xx-ex)**2 + (yy-ey)**2) / distance
                    region *= np.clip((radius-.18)/.12, 0.0, 1.0)
                belt[y1:y2, x1:x2] = np.maximum(belt[y1:y2, x1:x2], region)
            guard = cv2.GaussianBlur(edge * belt, (7, 7), 1.5)
            identity_x, identity_y = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
            map_x = identity_x + (map_x-identity_x) * (1.0-guard)
            map_y = identity_y + (map_y-identity_y) * (1.0-guard)

        warped = cv2.remap(img_bgr, map_x, map_y, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
        reshape_mask = cv2.GaussianBlur(reshape_mask, (15, 15), 5.0)
        return warped, reshape_mask

    def build_edge_protection(self, gray_img: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """Bảo vệ tuyệt đối gọng kính kim loại, lông mi, viền mắt bằng gradient Sobel bậc 1."""
        gx = cv2.Sobel(gray_img, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(gray_img, cv2.CV_32F, 0, 1, ksize=3)
        sobel_mag = cv2.magnitude(gx, gy)
        wire_raw = np.clip((sobel_mag - 22.0) / 15.0, 0.0, 1.0)
        wire_dilated = cv2.dilate(wire_raw, np.ones((3, 3), np.uint8))
        wire_prot = cv2.GaussianBlur(wire_dilated, (3, 3), 0.8)
        return wire_prot, wire_prot[..., np.newaxis]

    def build_highlight_mask(self, gray_img: np.ndarray) -> np.ndarray:
        """Bảo vệ nốt phản quang catchlights tự nhiên trên trán, sống mũi, gò má."""
        g = gray_img.astype(np.float32)
        t = np.clip((g - 165.0) / 70.0, 0.0, 1.0)
        smooth_mask = t * t * (3.0 - 2.0 * t)
        return cv2.GaussianBlur(smooth_mask, (5, 5), 1.2)[..., np.newaxis]

    def generate_anatomical_masks(
        self,
        img_bgr: np.ndarray,
        faces: List[Dict[str, Any]],
        wire_prot: np.ndarray,
        blush_spread: float = 1.0,
        cheekbone_strength: float = 0.0,
        protect_glasses: bool = False,
        collect_debug: bool = False,
        continuous_skin: bool = False
    ) -> Dict[str, np.ndarray]:
        """Tạo các mặt nạ giải phẫu chuyên biệt: Da, Má hồng, Môi, Mắt."""
        mask_started = time.perf_counter()
        h, w, _ = img_bgr.shape
        full_skin_mask = np.zeros((h, w), dtype=np.float32)
        full_colour_mask = np.zeros((h, w), dtype=np.float32)
        blush_mask = np.zeros((h, w), dtype=np.float32)
        lip_mask = np.zeros((h, w), dtype=np.float32)
        eye_sharp_mask = np.zeros((h, w), dtype=np.float32)
        under_eye_mask = np.zeros((h, w), dtype=np.uint8)
        eye_region_mask = np.zeros((h, w), dtype=np.float32) if collect_debug else None
        eyebrow_mask = np.zeros((h, w), dtype=np.float32) if collect_debug else None
        nose_mask = np.zeros((h, w), dtype=np.float32) if collect_debug else None
        jaw_mask = np.zeros((h, w), dtype=np.float32) if collect_debug else None

        ycrcb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2YCrCb)
        hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
        lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

        # Makeup is low-frequency colour: do not punch pore-sized holes into blush.
        makeup_edge_guard = cv2.GaussianBlur(wire_prot, (0, 0), 3.0)

        for f in faces:
            bx, by, bw, bh = f["box"]
            lm = f["landmarks"]
            r_eye, l_eye, nose, m_r, m_l = lm

            pad_x = int(bw * (0.30 if continuous_skin else 0.18))
            pad_y = int(bh * 0.18)
            x1 = max(0, bx - pad_x)
            y1 = max(0, by - pad_y)
            x2 = min(w, bx + bw + pad_x)
            y2 = min(h, by + bh + pad_y)

            # 1. Skin Mask: Oval kết hợp sắc tố da đa không gian (HSV + YCrCb + RGB)
            # Khử triệt để việc nhận nhầm nền rèm nhung đỏ hoặc vải bão hòa cao là da người
            face_roi = np.zeros((y2 - y1, x2 - x1), dtype=np.uint8)
            center = (int((bx + bw / 2) - x1), int((by + bh * 0.52) - y1))
            axes = (int(bw * 0.46), int(bh * 0.50))
            cv2.ellipse(face_roi, center, axes, 0, 0, 360, 255, -1)
            dense=f.get('dense_landmarks')
            glasses_roi=np.zeros_like(face_roi)
            if dense is not None and len(dense)>=468:
                oval=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
                face_roi.fill(0)
                cv2.fillPoly(face_roi,[np.rint(dense[oval]-[x1,y1]).astype(np.int32)],255)
            face_oval = face_roi.copy()

            roi_ycrcb = ycrcb[y1:y2, x1:x2]
            roi_hsv = hsv[y1:y2, x1:x2]
            roi_bgr = img_bgr[y1:y2, x1:x2].astype(np.float32)

            r_c = roi_bgr[..., 2]
            g_c = roi_bgr[..., 1]
            b_c = roi_bgr[..., 0]
            s_c = roi_hsv[..., 1]

            # Rèm nhung đỏ có S cực cao (>165) và độ chênh lệch R/B cực lớn ((R-B)/R > 0.7)
            is_not_red_fabric = (s_c <= 165) & ((r_c - b_c) / (r_c + 1e-5) <= 0.68) & (g_c >= b_c * 0.82)
            is_skin_ycrcb = (roi_ycrcb[..., 0] >= 65) & (roi_ycrcb[..., 1] >= 130) & (roi_ycrcb[..., 2] >= 85) & (roi_ycrcb[..., 2] <= 138)
            is_skin = is_skin_ycrcb & is_not_red_fabric
            face_roi = cv2.bitwise_and(face_roi, face_roi, mask=is_skin.astype(np.uint8) * 255)

            # Loại trừ nhãn cầu mắt chính xác hình elip
            for eye_pt in [r_eye, l_eye]:
                ex, ey = eye_pt[0] - x1, eye_pt[1] - y1
                cv2.ellipse(face_roi, (ex, ey), (int(bw * 0.085), int(bh * 0.042)), 0, 0, 360, 0, -1)
            if dense is not None and len(dense)>=468:
                for ids in ([33,160,158,133,153,144],[362,385,387,263,373,380],
                            [70,63,105,66,107,55,65,52,53,46],[300,293,334,296,336,285,295,282,283,276]):
                    cv2.fillPoly(face_roi,[np.rint(dense[ids]-[x1,y1]).astype(np.int32)],0)
                    if ids[0] in (33,362):
                        if collect_debug:
                            cv2.fillPoly(eye_region_mask[y1:y2,x1:x2],[np.rint(dense[ids]-[x1,y1]).astype(np.int32)],1.)
                        if protect_glasses:
                            eye_center=np.mean(dense[ids],axis=0).astype(int)-[x1,y1]
                            cv2.ellipse(glasses_roi,tuple(eye_center),(max(2,int(bw*.22)),max(2,int(bh*.14))),0,0,360,255,-1)
                    elif collect_debug:
                        cv2.fillPoly(eyebrow_mask[y1:y2,x1:x2],[np.rint(dense[ids]-[x1,y1]).astype(np.int32)],1.)

                # Separate lower-eyelid skin from the protected eyeball/lash polygons.
                # Build a shallow anatomical strip along each lower lid, extending
                # toward the cheek with a face-pose-aware downward normal.
                eye_lower_specs = (
                    ([33, 144, 145, 153, 154, 155, 133], 33, 133),
                    ([263, 373, 374, 380, 381, 382, 362], 263, 362),
                )
                under_local = np.zeros_like(face_roi)
                for lower_ids, outer_id, inner_id in eye_lower_specs:
                    lower_curve = dense[lower_ids].astype(np.float32)
                    axis = dense[inner_id].astype(np.float32) - dense[outer_id].astype(np.float32)
                    axis_len = float(np.linalg.norm(axis))
                    if axis_len < 2.0:
                        continue
                    axis /= axis_len
                    down = np.array([-axis[1], axis[0]], dtype=np.float32)
                    if down[1] < 0:
                        down *= -1.0
                    thickness = min(axis_len * 0.55, bh * 0.060)
                    lash_clearance = max(1.0, bh * 0.007)
                    # Keep a small lash clearance; no Gaussian smoothing is used
                    # to create or hide the under-eye treatment region.
                    near_curve = lower_curve + down * lash_clearance
                    far_curve = lower_curve + down * (lash_clearance + thickness)
                    polygon = np.vstack((near_curve, far_curve[::-1]))
                    polygon -= np.array([x1, y1], dtype=np.float32)
                    cv2.fillPoly(under_local, [np.rint(polygon).astype(np.int32)], 255)
                if np.any(under_local):
                    eye_exclusion = np.zeros_like(under_local)
                    for eye_ids in ([33,160,158,133,153,144], [362,385,387,263,373,380]):
                        cv2.fillPoly(eye_exclusion, [np.rint(dense[eye_ids] - [x1, y1]).astype(np.int32)], 255)
                    exclusion_size = max(3, int(bw * .012) | 1)
                    eye_exclusion = cv2.dilate(eye_exclusion, cv2.getStructuringElement(
                        cv2.MORPH_ELLIPSE, (exclusion_size, exclusion_size)))
                    under_local[eye_exclusion > 0] = 0
                    # Feather inward from the anatomical boundary and suppress
                    # high-gradient lash/eyelid pixels without blurring image detail.
                    inside = cv2.distanceTransform((under_local > 0).astype(np.uint8), cv2.DIST_L2, 5)
                    feather_px = max(2.0, bw * 0.012)
                    under_alpha = np.clip(inside / feather_px, 0.0, 1.0)
                    under_alpha = under_alpha * under_alpha * (3.0 - 2.0 * under_alpha)
                    local_gray = gray[y1:y2, x1:x2]
                    egx = cv2.Sobel(local_gray, cv2.CV_32F, 1, 0, ksize=3)
                    egy = cv2.Sobel(local_gray, cv2.CV_32F, 0, 1, ksize=3)
                    lash_guard = np.clip((cv2.magnitude(egx, egy) - 90.0) / 80.0, 0.0, 0.75)
                    under_alpha *= 1.0 - lash_guard
                    # Keep the treatment inside the same face skin support while
                    # retaining the independent mask for diagnosis and tuning.
                    under_alpha *= (face_oval > 0).astype(np.float32)
                    old = under_eye_mask[y1:y2, x1:x2]
                    under_eye_mask[y1:y2, x1:x2] = np.maximum(
                        old, np.rint(np.clip(under_alpha, 0.0, 1.0) * 255.0).astype(np.uint8)
                    )

            # Loại trừ môi
            mouth_center = ((m_r + m_l) / 2).astype(int)
            mx, my = mouth_center[0] - x1, mouth_center[1] - y1
            mouth_w = int(np.linalg.norm(m_l - m_r) * 0.55)
            mouth_h = int(bh * 0.065)
            cv2.ellipse(face_roi, (mx, my), (mouth_w, mouth_h), 0, 0, 360, 0, -1)
            lip_ids=[61,146,91,181,84,17,314,405,321,375,291,308,324,318,402,317,14,87,178,88,95,78]
            if dense is not None and len(dense)>=468:
                cv2.fillPoly(face_roi,[np.rint(dense[lip_ids]-[x1,y1]).astype(np.int32)],0)
                dense_lip=np.zeros_like(face_roi)
                cv2.fillPoly(dense_lip,[np.rint(dense[lip_ids]-[x1,y1]).astype(np.int32)],255)
                lip_alpha=cv2.GaussianBlur(dense_lip.astype(np.float32)/255.,(0,0),max(1.,bw*.006))
                lip_mask[y1:y2,x1:x2]=np.maximum(lip_mask[y1:y2,x1:x2],lip_alpha)

            # Fill small segmentation holes only for low-frequency colour, not texture.
            colour_kernel = max(3, int(bw * 0.05) | 1)
            colour_roi = cv2.morphologyEx(face_roi, cv2.MORPH_CLOSE,
                                         cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (colour_kernel, colour_kernel)))
            # The old oval is a seed, not the visible cheek boundary. Grow only
            # connected, similar-colour skin within a bounded face neighbourhood.
            seed = (face_roi > 0)
            roi_lab = lab[y1:y2, x1:x2].astype(np.float32)
            if np.count_nonzero(seed) >= 32:
                reference = np.median(roi_lab[seed], axis=0)
                search = np.zeros_like(face_roi)
                if dense is not None and len(dense)>=468:
                    search = face_oval.copy()
                else:
                    search = np.zeros_like(face_roi)
                    cv2.ellipse(search, center, (max(1, int(bw * (.72 if continuous_skin else .62))), max(1, int(bh * .52))), 0, 0, 360, 255, -1)
                chroma_distance = np.linalg.norm(roi_lab[..., 1:] - reference[1:], axis=2)
                candidate = ((search > 0) & is_not_red_fabric &
                             (chroma_distance < (30.0 if dense is not None and len(dense)>=468 else 18.0)) &
                             (roi_lab[..., 0] > max(70., reference[0] * .65)))
                _, labels = cv2.connectedComponents(candidate.astype(np.uint8), connectivity=8)
                connected = np.unique(labels[seed & candidate])
                connected = connected[connected != 0]
                colour_roi = (np.isin(labels, connected).astype(np.uint8) * 255)
                colour_roi = cv2.morphologyEx(colour_roi, cv2.MORPH_CLOSE,
                    cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (colour_kernel, colour_kernel)))
            else:
                colour_roi = cv2.bitwise_and(colour_roi, face_oval)
                reference = np.median(roi_lab[face_oval > 0], axis=0) if np.any(face_oval) else np.array([128.,138.,128.])
                chroma_distance = np.linalg.norm(roi_lab[...,1:] - reference[1:],axis=2)
            for eye_pt in [r_eye, l_eye]:
                ex, ey = eye_pt[0] - x1, eye_pt[1] - y1
                cv2.ellipse(colour_roi, (ex, ey), (int(bw * 0.085), int(bh * 0.042)), 0, 0, 360, 0, -1)
            if dense is not None and len(dense)>=468:
                for ids in ([33,160,158,133,153,144],[362,385,387,263,373,380],
                            [70,63,105,66,107,55,65,52,53,46],[300,293,334,296,336,285,295,282,283,276]):
                    cv2.fillPoly(colour_roi,[np.rint(dense[ids]-[x1,y1]).astype(np.int32)],0)
                cv2.fillPoly(colour_roi,[np.rint(dense[lip_ids]-[x1,y1]).astype(np.int32)],0)
            if protect_glasses:
                colour_roi[glasses_roi>0]=0
                face_roi[glasses_roi>0]=0
            if dense is not None and len(dense)>=468 and collect_debug:
                nose_ids=[1,2,98,327,168,6,197,195,5,4]
                temp=np.zeros_like(face_roi);cv2.fillPoly(temp,[np.rint(dense[nose_ids]-[x1,y1]).astype(np.int32)],255)
                nose_feather=cv2.GaussianBlur(temp.astype(np.float32)/255.,(0,0),max(1.,bw*.008))
                nose_mask[y1:y2,x1:x2]=np.maximum(nose_mask[y1:y2,x1:x2],nose_feather)
                jaw_ids=[234,93,132,172,58,136,150,149,176,148,152,377,400,378,379,365,397,288,361,323,454]
                temp=np.zeros_like(face_roi);cv2.polylines(temp,[np.rint(dense[jaw_ids]-[x1,y1]).astype(np.int32)],False,255,max(1,int(bw*.012)))
                jaw_feather=cv2.GaussianBlur(temp.astype(np.float32)/255.,(0,0),max(1.,bw*.006))
                jaw_mask[y1:y2,x1:x2]=np.maximum(jaw_mask[y1:y2,x1:x2],jaw_feather)
            # Colour protection should cover the lip, not the whole philtrum.
            mouth_angle = float(np.degrees(np.arctan2(m_l[1]-m_r[1], m_l[0]-m_r[0])))
            lip_region = np.zeros_like(colour_roi)
            cv2.ellipse(lip_region, (mx, my), (mouth_w, max(2, int(bh * .055))), mouth_angle, 0, 360, 255, -1)
            reference_a = float(np.median(roi_lab[...,1][seed])) if np.any(seed) else 138.
            red_lip = np.clip((roi_lab[...,1]-reference_a-2.)/6., 0., 1.)
            lip_protection = red_lip * (lip_region.astype(np.float32)/255.)
            # A narrow central band also protects naturally pale lips/mouth line.
            lip_core = np.zeros_like(colour_roi)
            cv2.ellipse(lip_core, (mx, my), (mouth_w, max(2, int(bh*.018))), mouth_angle, 0, 360, 255, -1)
            lip_protection = np.maximum(lip_protection, lip_core.astype(np.float32)/255.)
            lip_protection = cv2.GaussianBlur(lip_protection, (0,0), max(.7,bw*.004))
            if continuous_skin:
                # YuNet mouth corners delimit a search area, not the lip contour.
                # Refine with local pigment; do not protect a solid band of philtrum.
                mouth_axis=(m_l-m_r).astype(np.float32)
                mouth_width=max(1.,float(np.linalg.norm(mouth_axis)))
                mouth_axis/=mouth_width
                down=np.array([-mouth_axis[1],mouth_axis[0]],np.float32)
                yy_l,xx_l=np.mgrid[y1:y2,x1:x2]
                dx_l=(xx_l-mouth_center[0])*mouth_axis[0]+(yy_l-mouth_center[1])*mouth_axis[1]
                dy_l=(xx_l-mouth_center[0])*down[0]+(yy_l-mouth_center[1])*down[1]
                side_samples=(np.abs(dx_l)>mouth_width*.65)&(np.abs(dx_l)<mouth_width*.95)&(dy_l<-mouth_width*.08)&(dy_l>-mouth_width*.35)&seed
                local_a=float(np.median(roi_lab[...,1][side_samples])) if np.count_nonzero(side_samples)>=16 else reference_a
                pigment=np.clip((roi_lab[...,1]-local_a-3.)/8.,0.,1.)
                pigment=pigment*pigment*(3.-2.*pigment)
                search_lip=(dx_l/(mouth_width*.62))**2+((dy_l-mouth_width*.12)/max(2.,bh*.085))**2<1.
                candidate=(pigment>.08)&search_lip
                _,components=cv2.connectedComponents(candidate.astype(np.uint8),connectivity=8)
                anchors=(pigment>.55)&search_lip&(np.abs(dx_l)<mouth_width*.48)&(dy_l>-mouth_width*.08)
                chosen=np.unique(components[anchors]);chosen=chosen[chosen!=0]
                if chosen.size:
                    refined=pigment*np.isin(components,chosen)
                    # Smooth confidence, then intersect original pigment to avoid
                    # tint/skin protection bleeding over the visible lip border.
                    refined=cv2.GaussianBlur(refined,(0,0),max(.6,bw*.002))*np.clip(pigment*2.,0.,1.)
                else:
                    # Ambiguous pale/occluded lips: retain conservative protection.
                    refined=lip_protection
                lip_protection=np.clip(refined,0.,1.)
                lip_mask[y1:y2,x1:x2]=np.maximum(lip_mask[y1:y2,x1:x2],lip_protection)
            # Feather inward: Gaussian tails must not tint adjacent hair/background.
            distance = cv2.distanceTransform(colour_roi, cv2.DIST_L2, 5)
            colour_soft = np.clip(distance / max(2.0, bw * .025), 0., 1.)
            colour_soft = colour_soft * colour_soft * (3. - 2. * colour_soft)
            colour_soft *= 1. - lip_protection
            if dense is not None and len(dense)>=468:
                # Dense geometry provides a continuous face boundary. Color
                # agreement is a soft confidence, not a binary per-pixel cut,
                # so pores and natural shading do not create holes in the mask.
                dense_skin=face_oval.copy()
                for ids in ([33,160,158,133,153,144],[362,385,387,263,373,380],
                            [70,63,105,66,107,55,65,52,53,46],[300,293,334,296,336,285,295,282,283,276],lip_ids):
                    cv2.fillPoly(dense_skin,[np.rint(dense[ids]-[x1,y1]).astype(np.int32)],0)
                if protect_glasses:
                    dense_skin[glasses_roi>0]=0
                geom=(dense_skin>0).astype(np.uint8)
                geom_dist=cv2.distanceTransform(geom,cv2.DIST_L2,5)
                edge_alpha=np.clip(geom_dist/max(2.,bw*.025),0.,1.)
                edge_alpha=edge_alpha*edge_alpha*(3.-2.*edge_alpha)
                chroma_conf=np.clip((38.-chroma_distance)/22.,0.,1.)
                light_conf=np.clip((roi_lab[...,0]-95.)/30.,0.,1.)
                colour_soft=edge_alpha*chroma_conf*light_conf
                face_gray=gray[y1:y2,x1:x2]
                gx=cv2.Sobel(face_gray,cv2.CV_32F,1,0,ksize=3)
                gy=cv2.Sobel(face_gray,cv2.CV_32F,0,1,ksize=3)
                strong_edge=np.clip((cv2.magnitude(gx,gy)-72.)/55.,0.,1.)
                strong_edge=cv2.dilate(strong_edge,np.ones((3,3),np.uint8))
                strong_edge=cv2.GaussianBlur(strong_edge,(0,0),1.2)
                colour_soft*=1.-.80*strong_edge
            # Fade added colour before the lower search boundary; do not leave
            # a narrow bright strip where the geometric search stops on the neck.
            yy = np.arange(y1, y2, dtype=np.float32)[:, None]
            lower = np.clip((yy - (by + bh * .90)) / max(1., bh * .14), 0., 1.)
            colour_soft *= 1. - lower * lower * (3. - 2. * lower)
            full_colour_mask[y1:y2, x1:x2] = np.maximum(full_colour_mask[y1:y2, x1:x2], colour_soft)

            # Keep thin high-frequency boundaries (lashes, eyewear rims) out
            # of the skin composite; dense geometry bounds hair and backdrop.
            # Reuse the bounded connected skin region for retouching so hard
            # YCrCb threshold speckles do not punch holes through the mask.
            if continuous_skin or (dense is not None and len(dense)>=468):
                feathered_skin=colour_soft
            else:
                feathered_skin=cv2.GaussianBlur(face_roi.astype(np.float32)/255.,(41,41),15.)
            full_skin_mask[y1:y2,x1:x2]=np.maximum(full_skin_mask[y1:y2,x1:x2],feathered_skin)

            # 2. Rosy Blush Mask: Gò má quả táo Zygomaticus
            blush_rx = max(1, int(bw * 0.16 * blush_spread))
            blush_ry = max(1, int(bh * 0.11 * blush_spread))
            if continuous_skin:
                blush_rx=max(1,int(blush_rx*1.15))
                blush_ry=max(1,int(blush_ry*1.05))
            if dense is not None and len(dense)>=468:
                r_blush_c=tuple(np.rint(dense[117]).astype(int));l_blush_c=tuple(np.rint(dense[346]).astype(int))
            else:
                r_blush_c = (int(r_eye[0] - bw * 0.04), int(r_eye[1] + bh * 0.15))
                l_blush_c = (int(l_eye[0] + bw * 0.04), int(l_eye[1] + bh * 0.15))

            blush_centers = [(r_blush_c, 1.), (l_blush_c, 1.)]
            if cheekbone_strength > 0:
                axis = (l_eye-r_eye).astype(np.float32)
                axis /= max(1., float(np.linalg.norm(axis)))
                down = np.array([-axis[1], axis[0]], np.float32)
                for bc, direction in ((r_blush_c, -1.), (l_blush_c, 1.)):
                    outer = np.array(bc) + axis * (direction*bw*.09) - down*(bh*.04)
                    blush_centers.append((tuple(outer.astype(int)), cheekbone_strength))

            for bc, blush_weight in blush_centers:
                bx_c, by_c = bc
                x1_b, x2_b = max(0, bx_c - blush_rx * 2), min(w, bx_c + blush_rx * 2)
                y1_b, y2_b = max(0, by_c - blush_ry * 2), min(h, by_c + blush_ry * 2)
                pw, ph = x2_b - x1_b, y2_b - y1_b
                if pw <= 0 or ph <= 0:
                    continue
                yg, xg = np.ogrid[:ph, :pw]
                dist_sq = ((xg - (bx_c - x1_b))**2 / (blush_rx**2) + (yg - (by_c - y1_b))**2 / (blush_ry**2))
                b_gaussian = np.exp(-0.5 * dist_sq * 2.2) * np.clip(1.0 - dist_sq * 0.35, 0.0, 1.0)
                if continuous_skin:
                    taper=np.clip(1.-dist_sq/4.,0.,1.)
                    b_gaussian=np.exp(-.8*dist_sq)*taper*taper*(3.-2.*taper)
                b_gaussian *= blush_weight
                # Giới hạn trong da và loại trừ gọng kính
                b_gaussian *= full_colour_mask[y1_b:y2_b, x1_b:x2_b] * (1.0 - makeup_edge_guard[y1_b:y2_b, x1_b:x2_b])
                blush_mask[y1_b:y2_b, x1_b:x2_b] = np.maximum(blush_mask[y1_b:y2_b, x1_b:x2_b], b_gaussian)

            # 3. Lip Tint Mask: Viền môi ombre mềm mại
            mouth_dist = np.linalg.norm(m_l - m_r)
            lip_rx = int(mouth_dist * 0.58)
            lip_ry = int(bh * 0.058)
            lx1, lx2 = max(0, mouth_center[0] - lip_rx - 15), min(w, mouth_center[0] + lip_rx + 15)
            ly1, ly2 = max(0, mouth_center[1] - lip_ry - 15), min(h, mouth_center[1] + lip_ry + 15)
            lpw, lph = lx2 - lx1, ly2 - ly1
            if lpw > 0 and lph > 0 and not continuous_skin and not (dense is not None and len(dense)>=468):
                lyg, lxg = np.ogrid[:lph, :lpw]
                ldist = ((lxg - (mouth_center[0] - lx1))**2 / (lip_rx**2) + (lyg - (mouth_center[1] - ly1))**2 / (lip_ry**2))
                l_ellipse = np.clip(1.0 - ldist, 0.0, 1.0)**1.2
                roi_lab = lab[ly1:ly2, lx1:lx2]
                lip_chroma = np.clip((roi_lab[..., 1].astype(float) - 136.0) / 16.0, 0.0, 1.0)
                l_final = l_ellipse * (0.35 + 0.65 * lip_chroma)
                if continuous_skin:
                    # Five-point mouth geometry is only a search window. Require
                    # pigment above adjacent skin so tint does not paint philtrum.
                    pigment = np.clip((roi_lab[...,1].astype(float)-reference_a-2.)/8.,0.,1.)
                    l_final = l_ellipse * pigment
                l_feathered = cv2.GaussianBlur(l_final.astype(np.float32), (9, 9), 2.5)
                lip_mask[ly1:ly2, lx1:lx2] = np.maximum(lip_mask[ly1:ly2, lx1:lx2], l_feathered)

            # 4. Eye Detail Sharpening Mask
            for eye_pt in [r_eye, l_eye]:
                ex, ey = eye_pt[0], eye_pt[1]
                erx, ery = int(bw * 0.09), int(bh * 0.045)
                ex1, ex2 = max(0, ex - erx), min(w, ex + erx)
                ey1, ey2 = max(0, ey - ery), min(h, ey + ery)
                if ex2 > ex1 and ey2 > ey1:
                    egray = gray[ey1:ey2, ex1:ex2]
                    elap = np.clip((np.abs(cv2.Laplacian(egray, cv2.CV_32F)) - 10.0) / 20.0, 0.0, 1.0)
                    eye_sharp_mask[ey1:ey2, ex1:ex2] = np.maximum(eye_sharp_mask[ey1:ey2, ex1:ex2], elap)
            if dense is not None and len(dense)>=468 and collect_debug:
                for ids in ([33,160,158,133,153,144],[362,385,387,263,373,380]):
                    eye=np.zeros((h,w),np.uint8)
                    cv2.polylines(eye,[np.rint(dense[ids]).astype(np.int32)],True,255,max(2,int(bw*.012)))
                    eye_sharp_mask=np.maximum(eye_sharp_mask,cv2.GaussianBlur(eye.astype(np.float32)/255.,(0,0),max(1.,bw*.004)))

        self.last_timings['mask_ms'] = self.last_timings.get('mask_ms', 0.) + (time.perf_counter()-mask_started)*1000.
        return {
            "skin": full_skin_mask,
            "colour": full_colour_mask,
            "blush": blush_mask,
            "lip": lip_mask,
            "eye_sharp": eye_sharp_mask,
            "eyes": cv2.GaussianBlur(eye_region_mask,(0,0),1.2) if collect_debug else None,
            "under_eye": under_eye_mask,
            "eyebrows": cv2.GaussianBlur(eyebrow_mask,(0,0),1.2) if collect_debug else None,
            "nose": nose_mask,
            "jaw": jaw_mask,
            "cheeks": blush_mask
        }

    def process_image(
        self,
        img_bgr: np.ndarray,
        cfg: Optional[KoreanBeautyConfig] = None,
        original_img: Optional[np.ndarray] = None
    ) -> np.ndarray:
        """
        Thực thi toàn bộ pipeline Korean Soft Beauty:
        Retouching da vi mô + Trang điểm tự nhiên + Nâng sáng trong trẻo.
        Bảo toàn tuyệt đối 100% màu sắc và chất liệu của phông nền, trang phục và tóc bên ngoài.
        """
        if cfg is None:
            cfg = KoreanBeautyConfig()

        clean_bg = original_img if original_img is not None else img_bgr

        if not cfg.enabled:
            return clean_bg.copy()

        t0 = time.perf_counter()
        self.last_timings = {'face_count': 0, 'dense_face_count': 0, 'yunet_ms': 0., 'landmarker_ms': 0., 'mask_ms': 0.}
        h, w, _ = img_bgr.shape

        # 1. Nhận diện khuôn mặt
        detect_started=time.perf_counter()
        faces = self.detect_faces(img_bgr)
        self.last_timings['yunet_ms']=(time.perf_counter()-detect_started)*1000.
        self.last_timings['face_count']=len(faces)
        if len(faces) == 0:
            logger.info("Không phát hiện khuôn mặt; giữ nguyên ảnh gốc.")
            return clean_bg.copy()
        if cfg.presetId == 'white_pink_v2':
            dense_started=time.perf_counter()
            dense=self.detect_dense_landmarks(img_bgr,max_faces=max(1,len(faces)),faces=faces)
            self.attach_dense_landmarks(faces,dense)
            for face in faces:
                if 'dense_landmarks' in face:
                    face['reshape_landmarks']=face.pop('dense_landmarks')
            self.last_timings['landmarker_ms']=(time.perf_counter()-dense_started)*1000.
            self.last_timings['dense_face_count']=sum('reshape_landmarks' in f for f in faces)
            logger.info('V2 MediaPipe reshape: %s/%s faces; YuNet geometry fallback for unmatched faces',self.last_timings['dense_face_count'],len(faces))

        # Tăng tốc độ đột phá (15x) cho ảnh độ phân giải cao (24MP 6000x4000):
        # Chỉ xử lý vùng ROI bao quanh các khuôn mặt thay vì tính toán 24 triệu điểm ảnh toàn phông nền
        if (w > 1800 or h > 1800) and len(faces) > 0:
            min_x = min(f["box"][0] for f in faces)
            min_y = min(f["box"][1] for f in faces)
            max_x = max(f["box"][0] + f["box"][2] for f in faces)
            max_y = max(f["box"][1] + f["box"][3] for f in faces)

            avg_bw = float(np.mean([f["box"][2] for f in faces]))
            avg_bh = float(np.mean([f["box"][3] for f in faces]))
            pad_x = int(avg_bw * 0.45)
            pad_y = int(avg_bh * 0.45)

            rx1 = max(0, min_x - pad_x)
            ry1 = max(0, min_y - pad_y)
            rx2 = min(w, max_x + pad_x)
            ry2 = min(h, max_y + pad_y)

            roi_img = img_bgr[ry1:ry2, rx1:rx2].copy()
            roi_clean = clean_bg[ry1:ry2, rx1:rx2].copy()

            roi_faces = []
            for f in faces:
                r_box = f["box"].copy()
                r_box[0] -= rx1
                r_box[1] -= ry1
                r_lm = f["landmarks"].copy()
                r_lm[:, 0] -= rx1
                r_lm[:, 1] -= ry1
                copied={"box": r_box, "landmarks": r_lm, "conf": f["conf"]}
                if f.get('dense_landmarks') is not None:
                    dense=f['dense_landmarks'].copy();dense[:,0]-=rx1;dense[:,1]-=ry1
                    copied['dense_landmarks']=dense
                if f.get('reshape_landmarks') is not None:
                    dense=f['reshape_landmarks'].copy();dense[:,0]-=rx1;dense[:,1]-=ry1
                    copied['reshape_landmarks']=dense
                roi_faces.append(copied)

            proc_roi = self._process_core(roi_img, roi_faces, cfg, roi_clean)

            out_img = clean_bg.copy()
            out_img[ry1:ry2, rx1:rx2] = proc_roi
            self.last_timings['total_ms']=(time.perf_counter()-t0)*1000.
            logger.info(f"Hoàn tất Korean Soft Beauty ROI ({rx2-rx1}x{ry2-ry1}) trong {self.last_timings['total_ms']:.1f}ms.")
            return out_img

        result=self._process_core(img_bgr, faces, cfg, clean_bg)
        self.last_timings['total_ms']=(time.perf_counter()-t0)*1000.
        return result

    def apply_foundation(self, image, faces, coverage, concealer_strength, protect_glasses=False):
        """Even local skin chroma before beauty, retaining original luminance texture."""
        if coverage <= 0 or not faces:
            return image.copy()
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        wire, _ = self.build_edge_protection(gray)
        masks = self.generate_anatomical_masks(image, faces, wire, protect_glasses=protect_glasses)
        mask = masks['colour'] * (1.0 - np.clip(masks['lip'] + masks['eye_sharp'], 0, 1))
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB).astype(np.float32)
        corrected = lab.copy()
        for face in faces:
            x, y, bw, bh = map(int, face['box'])
            x1, y1 = max(0, x-int(bw*.2)), max(0, y-int(bh*.2))
            x2, y2 = min(image.shape[1], x+int(bw*1.2)), min(image.shape[0], y+int(bh*1.2))
            patch = lab[y1:y2, x1:x2]
            weight = mask[y1:y2, x1:x2]
            if patch.size == 0:
                continue
            sigma = max(1.0, bw*.045)
            colour_base = cv2.GaussianBlur(patch[..., 1:], (0, 0), sigma)
            corrected[y1:y2, x1:x2, 1:] += np.clip(colour_base-patch[..., 1:], -8, 8) * (coverage*weight[..., None])
            kernel = max(3, int(bw*.035) | 1)
            local_l = cv2.medianBlur(patch[..., 0].astype(np.uint8), kernel).astype(np.float32)
            deficit = np.maximum(local_l-patch[..., 0], 0)
            # Avoid filling strong dark marks/strands; do not claim semantic acne detection.
            guard = np.clip((24.0-deficit)/12.0, 0, 1) * (1.0-wire[y1:y2, x1:x2])
            corrected[y1:y2, x1:x2, 0] += np.minimum(deficit, 8) * coverage * concealer_strength * weight * guard
        output = cv2.cvtColor(np.rint(np.clip(corrected, 0, 255)).astype(np.uint8), cv2.COLOR_LAB2BGR)
        output[mask <= 1e-4] = image[mask <= 1e-4]
        return output

    def soften_upper_lip_shadow(self, lab, source_lab, faces, skin, strength):
        """Lift low-frequency upper-lip darkness against adjacent skin, not lips.

        Five-point geometry provides a conservative region, not a hair classifier.
        Bound the lift and skip faces without a reliable adjacent skin reference.
        """
        h, w = skin.shape
        lift = np.zeros((h, w), np.float32)
        for face in faces:
            points = face['landmarks'].astype(np.float32)
            nose, left, right = points[2], points[3], points[4]
            center = (left + right) * .5
            width = float(np.linalg.norm(right-left))
            if width < 8:
                continue
            u = (right-left)/width
            v = np.array([-u[1], u[0]], np.float32)
            height = float(np.dot(center-nose, v))
            if height < width*.20 or height > width*1.2:
                continue
            x1=max(0,int(center[0]-width));x2=min(w,int(center[0]+width)+1)
            y1=max(0,int(center[1]-height-width*.4));y2=min(h,int(center[1]+width*.4)+1)
            yy,xx=np.mgrid[y1:y2,x1:x2]
            dx=xx-center[0];dy=yy-center[1]
            horizontal=(dx*u[0]+dy*u[1])/(width*.5)
            vertical=(dx*v[0]+dy*v[1])/height
            src=source_lab[y1:y2,x1:x2]
            weights=skin[y1:y2,x1:x2]
            reference=(np.abs(horizontal)>1.05)&(np.abs(horizontal)<1.6)&(vertical>-.8)&(vertical<-.2)&(weights>.7)
            if np.count_nonzero(reference)<12:
                continue
            target=np.median(lab[y1:y2,x1:x2][reference],axis=0)
            source_target=np.median(src[reference],axis=0)
            # Cover the lateral upper-lip skin as well as the central philtrum.
            # A broad plateau avoids leaving a dark ring around a bright centre.
            distance=(horizontal/1.20)**2+((vertical+.50)/.43)**2
            zone=np.clip((1.-distance)/.55,0.,1.)
            zone=zone*zone*(3.-2.*zone)
            # Join the lateral upper-lip skin to the central correction. The
            # former ellipse tapered too early near the corners of the mouth.
            side_distance=((np.abs(horizontal)-.78)/.55)**2+((vertical+.36)/.29)**2
            side_zone=np.clip((1.-side_distance)/.65,0.,1.)
            side_zone=side_zone*side_zone*(3.-2.*side_zone)
            zone=np.maximum(zone,side_zone)
            # Nose/nostril shadows are outside upper-lip cleanup, even at 3x.
            below_nose=np.clip((vertical+.70)/.20,0.,1.)
            zone*=below_nose*below_nose*(3.-2.*below_nose)
            # Preserve red lip pigment and very dark anatomical features.
            safe=np.clip((source_target[1]+9.-src[...,1])/6.,0.,1.)*np.clip((src[...,0]-85.)/40.,0.,1.)
            base=cv2.GaussianBlur(lab[y1:y2,x1:x2,0],(0,0),max(1.,width*.045))
            deficit=np.clip(target[0]-base,0.,14.)
            correction=deficit*zone*safe*weights*strength
            # Multiple strong passes converge toward surrounding skin; they must
            # never accumulate beyond its luminance or brighten existing highlights.
            source_base=cv2.GaussianBlur(src[...,0],(0,0),max(1.,width*.045))
            # A fixed, feathered total budget prevents repeated passes erasing
            # texture or eventually lifting the entire edge to a flat colour.
            total_budget=np.minimum(np.maximum(target[0]-source_base,0.),18.)*zone*safe*weights
            already_added=np.maximum(lab[y1:y2,x1:x2,0]-src[...,0],0.)
            headroom=np.maximum(total_budget-already_added,0.)
            headroom=np.minimum(headroom,np.maximum(target[0]-lab[y1:y2,x1:x2,0],0.))
            correction=np.minimum(correction,headroom)
            lift[y1:y2,x1:x2]=np.maximum(lift[y1:y2,x1:x2],correction)
        lab[...,0]+=lift
        return lift

    def apply_rosy_blush(self, lab, cfg, blush_mask, A_surround):
        L, A, B = lab[...,0], lab[...,1], lab[...,2]
        # D. Virtual Makeup: Rosy Blush (gò má quả táo Zygomaticus)
        # Reduce blush smoothly on already rosy skin while preserving slider sensitivity.
        if cfg.rosyBlush > 0.001 and np.sum(blush_mask) > 0:
            if cfg.presetId == 'white_pink':
                # Broad local adaptation avoids one red cheek controlling every face.
                redness = np.clip((A_surround-132.0)/16.0,0,1)
            elif cfg.presetId == 'white_pink_v2':
                # Local adaptation prevents one cheek/person setting the blush
                # strength for all faces; use the harmonized skin before makeup.
                local_a=cv2.GaussianBlur(A,(0,0),max(3.,min(A.shape)*.015))
                redness=np.clip((local_a-132.)/16.,0.,1.)
            else:
                cheek_core = blush_mask > 0.40
                cur_a = float(np.mean(A[cheek_core])) if np.any(cheek_core) else 128.0
                redness = float(np.clip((cur_a - 132.0) / 16.0, 0.0, 1.0))
            redness = redness * redness * (3.0 - 2.0 * redness)
            eff_blush = cfg.rosyBlush * (1.0 - cfg.blushAdaptation * redness)

            A += (16.0 * eff_blush) * blush_mask
            B -= (2.5 * eff_blush) * blush_mask
            L += (2.0 * eff_blush) * blush_mask


    @staticmethod
    def skin_guided_base(patch, confidence, radius):
        """Weighted guided regression; excluded lips/background are not samples."""
        size=(2*radius+1,2*radius+1)
        def box(a): return cv2.boxFilter(a,cv2.CV_32F,size,normalize=False)
        weight=confidence.astype(np.float32)
        norm=np.maximum(box(weight),1e-5)
        guide=patch[...,0]
        mean_g=box(guide*weight)/norm
        mean_p=box(patch*weight[...,None])/norm[...,None]
        var=np.maximum(box(guide*guide*weight)/norm-mean_g*mean_g,0.)
        cov=box(patch*(guide*weight)[...,None])/norm[...,None]-mean_p*mean_g[...,None]
        a=cov/(var[...,None]+36.)
        b=mean_p-a*mean_g[...,None]
        mean_a=box(a*weight[...,None])/norm[...,None]
        mean_b=box(b*weight[...,None])/norm[...,None]
        return mean_a*guide[...,None]+mean_b

    @staticmethod
    def smooth_skin_correction(desired, guide, confidence, support):
        """Screened diffusion of the correction, anchored to zero at its border."""
        active=(support>1e-4)&(confidence>1e-4)
        desired=desired*active[...,None]
        result=desired.copy()
        edge_x=np.exp(-np.abs(np.diff(guide,axis=1))/8.)*np.minimum(confidence[:,1:],confidence[:,:-1])
        edge_y=np.exp(-np.abs(np.diff(guide,axis=0))/8.)*np.minimum(confidence[1:],confidence[:-1])
        data=np.maximum(support,.15)
        for _ in range(12):
            total=np.zeros_like(result); degree=np.zeros_like(guide)
            total[:,1:]+=result[:,:-1]*edge_x[...,None]; degree[:,1:]+=edge_x
            total[:,:-1]+=result[:,1:]*edge_x[...,None]; degree[:,:-1]+=edge_x
            total[1:]+=result[:-1]*edge_y[...,None]; degree[1:]+=edge_y
            total[:-1]+=result[1:]*edge_y[...,None]; degree[:-1]+=edge_y
            result=(desired*data[...,None]+.7*total)/(data+.7*degree)[...,None]
            result[~active]=0.
        return result

    def harmonize_connected_skin(self, lab, faces, skin, lips):
        """One continuous chroma correction on each connected face, before makeup.

        Reference patches estimate skin colour versus illumination. They are
        samples, not treatment boundaries; luminance and texture are untouched.
        """
        h,w=skin.shape
        accumulated=np.zeros_like(lab)
        coverage=np.zeros_like(skin)
        for face in faces:
            bx,by,bw,bh=map(int,face['box'])
            points=face['landmarks'].astype(np.float32)
            axis=points[1]-points[0];length=float(np.linalg.norm(axis))
            if length<8: continue
            axis/=length;down=np.array([-axis[1],axis[0]],np.float32)
            center=points[:2].mean(axis=0)
            x0=max(0,bx-int(bw*.35));x1=min(w,bx+int(bw*1.35))
            y0=max(0,by);y1=min(h,by+bh)
            patch=lab[y0:y1,x0:x1]
            if patch.size==0: continue
            safe=skin[y0:y1,x0:x1]*(1.-np.clip(lips[y0:y1,x0:x1],0.,1.))
            yy,xx=np.mgrid[y0:y1,x0:x1]
            selected=np.zeros_like(safe,dtype=bool)
            # Forehead, inner cheeks and lower cheeks: avoid eyeballs, nose,
            # philtrum and hairline. Each valid patch has equal reference weight.
            samples=[]
            for u,v in ((0.,-.20),(-.28,.18),(.28,.18),(-.22,.38),(.22,.38)):
                anchor=center+axis*(u*bw)+down*(v*bh)
                dx=(xx-anchor[0])*axis[0]+(yy-anchor[1])*axis[1]
                dy=(xx-anchor[0])*down[0]+(yy-anchor[1])*down[1]
                pick=(dx/max(2.,bw*.07))**2+(dy/max(2.,bh*.04))**2<1.
                pick&=(safe>.9)&(patch[...,0]>110.)&(patch[...,0]<235.)
                if np.count_nonzero(pick)<24: continue
                pixels=patch[pick]
                samples.append(np.median(pixels,axis=0));selected|=pick
            if len(samples)<3: continue
            samples=np.array(samples,np.float32)
            median=np.median(samples,axis=0)
            # Fit only a bounded illumination dependence, not separate targets
            # for the two cheeks. Trim anomalous makeup/occlusion references.
            valid=np.linalg.norm(samples[:,1:]-median[1:],axis=1)<8.
            samples=samples[valid]
            if len(samples)<3: continue
            pivot=float(np.median(samples[:,0]))
            design=np.column_stack((np.ones(len(samples)),(samples[:,0]-pivot)/40.))
            coefficients=np.linalg.lstsq(design,samples[:,1:],rcond=None)[0]
            coefficients[1]=np.clip(coefficients[1],-1.5,1.5)
            base=self.skin_guided_base(patch,safe,max(2,int(bw*.025)))
            target=coefficients[0]+((base[...,0]-pivot)/40.)[...,None]*coefficients[1]
            desired=np.zeros_like(patch)
            residual=target-base[...,1:]
            deviation=np.linalg.norm(residual,axis=2)
            adaptation=np.clip((deviation-1.)/4.,0.,1.)
            adaptation=adaptation*adaptation*(3.-2.*adaptation)
            reference_error=float(np.median(np.linalg.norm(samples[:,1:]-design@coefficients,axis=1)))
            reliability=float(np.clip(1.-reference_error/10.,.4,1.))
            gain=.70+.25*adaptation*reliability
            limit=2.5+1.5*adaptation
            desired[...,1:]=np.clip(residual*gain[...,None],-limit[...,None],limit[...,None])
            # Treat the connected face containing reference samples, rather than
            # isolated ellipses. Reject disconnected skin-coloured objects.
            _,labels=cv2.connectedComponents((safe>.05).astype(np.uint8),connectivity=8)
            components=np.unique(labels[selected]);components=components[components!=0]
            safe*=np.isin(labels,components)
            scale=min(1.,256./max(safe.shape))
            size=(max(2,int(safe.shape[1]*scale)),max(2,int(safe.shape[0]*scale)))
            weight=cv2.resize(safe,size,interpolation=cv2.INTER_AREA)
            desired=cv2.resize(desired,size,interpolation=cv2.INTER_AREA)
            guide=cv2.resize(base[...,0],size,interpolation=cv2.INTER_AREA)
            field=self.smooth_skin_correction(desired,guide,weight,weight)
            field=cv2.resize(field,(safe.shape[1],safe.shape[0]),interpolation=cv2.INTER_LINEAR)
            field*=safe[...,None]
            # Overlapping faces average their fields, rather than adding twice.
            accumulated[y0:y1,x0:x1]+=field
            coverage[y0:y1,x0:x1]+=(safe>1e-4)
        correction=accumulated/np.maximum(coverage,1.)[...,None]
        lab+=correction
        return correction

    def lift_outer_cheeks(self, lab, faces, skin, lips):
        """Bounded, gradual fill light outside the cheekbone; never equalize light."""
        h,w=skin.shape
        lift=np.zeros_like(skin)
        for face in faces:
            bx,by,bw,bh=map(int,face['box'])
            eyes=face['landmarks'][:2].astype(np.float32)
            axis=eyes[1]-eyes[0];length=float(np.linalg.norm(axis))
            if length<8:continue
            axis/=length;down=np.array([-axis[1],axis[0]],np.float32)
            center=eyes.mean(axis=0)
            x0=max(0,bx-int(bw*.35));x1=min(w,bx+int(bw*1.35))
            y0=max(0,by);y1=min(h,by+bh)
            patch=lab[y0:y1,x0:x1]
            if patch.size==0:continue
            safe=skin[y0:y1,x0:x1]*(1.-np.clip(lips[y0:y1,x0:x1],0.,1.))
            yy,xx=np.mgrid[y0:y1,x0:x1]
            u=((xx-center[0])*axis[0]+(yy-center[1])*axis[1])/max(1,bw)
            v=((xx-center[0])*down[0]+(yy-center[1])*down[1])/max(1,bh)
            def smooth(t):
                t=np.clip(t,0.,1.);return t*t*(3.-2.*t)
            vertical=smooth((v-.08)/.10)*smooth((.50-v)/.14)
            local=np.zeros_like(safe)
            for side in (-1.,1.):
                ref=((u-side*.30)/.07)**2+((v-.21)/.04)**2<1.
                ref&=(safe>.9)&(patch[...,0]>110.)&(patch[...,0]<235.)
                if np.count_nonzero(ref)<24:continue
                target=float(np.median(patch[...,0][ref]))
                # Smooth the added light only. The image's texture is not filtered.
                desired=np.clip((target-patch[...,0])*.30,0.,2.5)
                zone=smooth((side*u-.32)/.20)*vertical*safe
                amount=desired*zone
                numerator=cv2.GaussianBlur(amount*safe,(0,0),max(1.,bw*.012))
                norm=cv2.GaussianBlur(safe,(0,0),max(1.,bw*.012))
                amount=numerator/np.maximum(norm,1e-5)
                amount*=safe*(zone>1e-4)
                local=np.maximum(local,amount)
            region=lift[y0:y1,x0:x1]
            np.maximum(region,local,out=region)
        lab[...,0]+=lift
        return lift

    def harmonize_local_skin(self, lab, faces, skin, lips):
        """Blend philtrum and lateral cheek tone toward adjacent skin only.

        Correct a low-frequency colour field, never blur the output texture.
        Five-point geometry bounds the search; reliable skin supplies references.
        """
        h,w=skin.shape
        correction=np.zeros_like(lab)
        for face in faces:
            bx,by,bw,bh=map(int,face['box'])
            points=face['landmarks'].astype(np.float32)
            eyes=points[:2]; nose=points[2]; mouth=points[3:].mean(axis=0)
            axis=eyes[1]-eyes[0]; eye_distance=float(np.linalg.norm(axis))
            if eye_distance<8: continue
            axis/=eye_distance
            down=np.array([-axis[1],axis[0]],np.float32)
            x0=max(0,bx-int(bw*.35)); x1=min(w,bx+int(bw*1.35))
            y0=max(0,by); y1=min(h,by+bh)
            patch=lab[y0:y1,x0:x1]
            safe=skin[y0:y1,x0:x1]*(1.-np.clip(lips[y0:y1,x0:x1],0.,1.))
            base=self.skin_guided_base(patch,safe,max(2,int(bw*.025)))
            yy,xx=np.mgrid[y0:y1,x0:x1]
            local=np.zeros_like(patch)
            support=np.zeros_like(safe)
            numerator=np.zeros_like(patch)
            eye_center=eyes.mean(axis=0)
            # Lateral cheeks now belong to the connected chroma field. Keep
            # this bounded luminance cleanup only for the philtrum.
            regions=[]
            height=float(np.dot(mouth-nose,down))
            width=float(np.linalg.norm(points[4]-points[3]))
            if height>width*.2:
                center=mouth-down*(height*.22)
                # Both sides of philtrum, outside lip pigment and nose wings.
                refs=[]
                for side in (-1.,1.):
                    ref=mouth+axis*(side*width*.75)-down*(height*.40)
                    refs.append(ref)
                regions.append((center,refs,width*.68,height*.30,True))
            for center,reference,rx,ry,is_philtrum in regions:
                refs=reference if is_philtrum else [reference]
                samples=[]
                for ref in refs:
                    dx=(xx-ref[0])*axis[0]+(yy-ref[1])*axis[1]
                    dy=(xx-ref[0])*down[0]+(yy-ref[1])*down[1]
                    pick=(dx/(bw*.065))**2+(dy/(bh*.035))**2<1.
                    pick &= safe>.85
                    if np.count_nonzero(pick)>=16: samples.append(np.median(base[pick],axis=0))
                if not samples or (is_philtrum and len(samples)<2): continue
                target=np.mean(samples,axis=0)
                dx=(xx-center[0])*axis[0]+(yy-center[1])*axis[1]
                dy=(xx-center[0])*down[0]+(yy-center[1])*down[1]
                zone=np.clip(1.-(dx/max(rx,1.))**2-(dy/max(ry,1.))**2,0.,1.)
                zone=zone*zone*(3.-2.*zone)*safe
                delta=np.zeros_like(patch)
                # Partial lift keeps natural shading; pigment correction is symmetric.
                delta[...,0]=np.clip((target[0]-base[...,0])*.45,0.,5.)
                delta[...,1:]=np.clip((target[1:]-base[...,1:])*.65,-3.,3.)
                numerator+=delta*zone[...,None]
                support+=zone
            local=numerator/np.maximum(support,1.)[...,None]
            local=self.smooth_skin_correction(local,base[...,0],safe,np.clip(support,0.,1.))
            region=correction[y0:y1,x0:x1]
            take=np.abs(local)>np.abs(region)
            region[take]=local[take]
        lab+=correction
        return correction

    def soften_nose_wing_shadow(self, lab, source_lab, faces, skin):
        """Small luminance-only lift beside the nose; preserve dark nostrils."""
        h,w=skin.shape
        lift=np.zeros((h,w),np.float32)
        for face in faces:
            points=face['landmarks'].astype(np.float32)
            nose=points[2];mouth=(points[3]+points[4])*.5
            width=float(np.linalg.norm(points[4]-points[3]))
            if width<8:
                continue
            axis=(points[4]-points[3])/width
            down=np.array([-axis[1],axis[0]],np.float32)
            height=float(np.dot(mouth-nose,down))
            if height<width*.2 or height>width*1.2:
                continue
            x1=max(0,int(nose[0]-width));x2=min(w,int(nose[0]+width)+1)
            y1=max(0,int(nose[1]-height));y2=min(h,int(nose[1]+height*.45)+1)
            yy,xx=np.mgrid[y1:y2,x1:x2]
            dx=xx-nose[0];dy=yy-nose[1]
            horizontal=(dx*axis[0]+dy*axis[1])/width
            vertical=(dx*down[0]+dy*down[1])/height
            patch=lab[y1:y2,x1:x2];src=source_lab[y1:y2,x1:x2]
            weight=skin[y1:y2,x1:x2]
            reference=(np.abs(horizontal)>.60)&(np.abs(horizontal)<.9)&(np.abs(vertical)<.35)&(weight>.7)
            if np.count_nonzero(reference)<12:
                continue
            target=float(np.median(patch[...,0][reference]))
            distance=((np.abs(horizontal)-.38)/.23)**2+((vertical+.10)/.48)**2
            zone=np.clip(1.-distance,0.,1.)
            zone=zone*zone*(3.-2.*zone)
            safe=np.clip((src[...,0]-100.)/45.,0.,1.)
            deficit=np.clip(target-patch[...,0],0.,16.)
            correction=np.minimum(deficit*.25,4.)*zone*safe*weight
            lift[y1:y2,x1:x2]=np.maximum(lift[y1:y2,x1:x2],correction)
        lab[...,0]+=lift
        return lift

    def brighten_neck_toward_face(self, lab, source_bgr, faces, wire_prot):
        """Slightly close face/neck luminance gap on confidently detected skin."""
        source_lab=cv2.cvtColor(source_bgr,cv2.COLOR_BGR2LAB).astype(np.float32)
        ycc=cv2.cvtColor(source_bgr,cv2.COLOR_BGR2YCrCb)
        h,w=lab.shape[:2]
        applied=np.zeros((h,w),np.float32)
        for face in faces:
            bx,by,bw,bh=map(int,face['box'])
            fx1,fx2=max(0,bx),min(w,bx+bw)
            fy1,fy2=max(0,by+int(bh*.65)),min(h,by+int(bh*.98))
            nx1,nx2=max(0,bx+int(bw*.30)),min(w,bx+int(bw*.70))
            ny1,ny2=max(0,by+int(bh*.99)),min(h,by+int(bh*1.30))
            if fx2<=fx1 or fy2<=fy1 or nx2<=nx1 or ny2<=ny1: continue
            face_mask=np.zeros((fy2-fy1,fx2-fx1),bool)
            face_mask[:]=((ycc[fy1:fy2,fx1:fx2,0]>=65)&(ycc[fy1:fy2,fx1:fx2,1]>=130)&
                (ycc[fy1:fy2,fx1:fx2,2]>=85)&(ycc[fy1:fy2,fx1:fx2,2]<=138))
            face_l=source_lab[fy1:fy2,fx1:fx2,0][face_mask]
            if face_l.size<32: continue
            neck_ycc=ycc[ny1:ny2,nx1:nx2]
            neck_ok=((neck_ycc[...,0]>=65)&(neck_ycc[...,1]>=130)&(neck_ycc[...,2]>=85)&(neck_ycc[...,2]<=138))
            neck_l=source_lab[ny1:ny2,nx1:nx2,0]
            if np.count_nonzero(neck_ok)<max(24,int(neck_ok.size*.12)): continue
            face_level=float(np.median(face_l));neck_level=float(np.median(neck_l[neck_ok]))
            amount=min(max(face_level-neck_level,0.)*.12,2.5)
            if amount<.15: continue
            matte=np.zeros((h,w),np.float32);matte[ny1:ny2,nx1:nx2]=neck_ok.astype(np.float32)
            matte=cv2.GaussianBlur(matte,(0,0),max(1.,bw*.025))
            matte*=1.-np.clip(wire_prot,0.,1.)
            applied=np.maximum(applied,matte*amount)
        lab[...,0]+=applied
        return applied

    def harmonize_face_tone(self, before_lab, after_lab, source, faces, skin):
        """Limit added face colour when a compatible neck reference is visible.

        Never recolour the neck/body or undo the source's natural shading. Samples
        failing the skin/chroma checks leave that face unchanged.
        """
        h, w = source.shape[:2]
        source_lab = cv2.cvtColor(source, cv2.COLOR_BGR2LAB).astype(np.float32)
        corrections = np.zeros_like(after_lab)
        for face in faces:
            bx, by, bw, bh = map(int, face['box'])
            x1, x2 = max(0,bx-int(bw*.18)), min(w,bx+int(bw*1.18))
            y1, y2 = max(0,by-int(bh*.18)), min(h,by+int(bh*1.18))
            nx1,nx2 = max(0,int(bx+bw*.30)),min(w,int(bx+bw*.70))
            ny1,ny2 = max(0,int(by+bh*1.05)),min(h,int(by+bh*1.35))
            if x2<=x1 or y2<=y1 or nx2<=nx1 or ny2<=ny1:
                continue
            face_pixels = source_lab[y1:y2,x1:x2][skin[y1:y2,x1:x2]>.6]
            if len(face_pixels)<32:
                continue
            cheek_chroma = np.median(face_pixels[:,1:],axis=0)
            neck = source_lab[ny1:ny2,nx1:nx2].reshape(-1,3)
            valid = (neck[:,0]>100)&(neck[:,0]<245)&(np.linalg.norm(neck[:,1:]-cheek_chroma,axis=1)<16)
            if np.count_nonzero(valid)<max(32,len(neck)*.25):
                continue
            reference = np.median(neck[valid],axis=0)
            yy = np.arange(y1,y2,dtype=np.float32)[:,None]
            t = np.clip((yy-(by+bh*.55))/max(1,bh*.45),0,1)
            taper = (.35+.65*t*t*(3-2*t))*skin[y1:y2,x1:x2]
            before = before_lab[y1:y2,x1:x2]
            after = after_lab[y1:y2,x1:x2]
            delta = after-before
            adjust = np.zeros_like(after)
            # Preserve natural face/neck differences; only limit added brightness,
            # excess pink and excess blue at the lower-face transition.
            for channel,allowance,direction in ((0,4.,1.),(1,1.5,1.),(2,1.5,-1.)):
                added = np.maximum(delta[...,channel]*direction,0)
                excess = np.maximum((after[...,channel]-reference[channel])*direction-allowance,0)
                adjust[...,channel] = np.minimum(added,excess)*taper*direction
            region = corrections[y1:y2,x1:x2]
            # Do not apply two corrections if adjacent face boxes overlap.
            take = np.abs(adjust)>np.abs(region)
            region[take] = adjust[take]
        after_lab -= corrections

    def _process_core(
        self,
        img_bgr: np.ndarray,
        faces: List[Dict[str, Any]],
        cfg: KoreanBeautyConfig,
        clean_bg: np.ndarray
    ) -> np.ndarray:
        t0 = time.time()
        h, w, _ = img_bgr.shape

        img_bgr = self.apply_foundation(img_bgr, faces, cfg.foundationCoverage, cfg.concealerStrength, cfg.protectGlasses)

        # 1.5. Vi chỉnh hình thể nhẹ nhàng (Subtle Reshaping: Mặt thon, Mắt to, Mũi nhỏ 4-5%)
        proc_img, reshape_mask = self.apply_subtle_reshaping(
            img_bgr, faces,
            slim_face=cfg.slimFace,
            big_eyes=cfg.bigEyes,
            slim_nose=cfg.slimNose,
            protect_glasses=cfg.protectGlasses,
            pose_aware=cfg.presetId=='white_pink_v2'
        )

        # Tính toán kernel size tương thích tỉ lệ giải phẫu (Scale-adaptive Kernels)
        avg_bw = float(np.mean([f["box"][2] for f in faces]))
        k_small = max(3, int(avg_bw * 0.015) | 1)
        k_med = max(7, int(avg_bw * 0.040) | 1)
        k_large = max(15, int(avg_bw * 0.090) | 1)

        gray = cv2.cvtColor(proc_img, cv2.COLOR_BGR2GRAY)

        # 2. Xây dựng Edge Protection & Catchlight Masks
        wire_prot, wire_3c = self.build_edge_protection(gray)
        high_mask = self.build_highlight_mask(gray)

        # 3. Frequency Separation thích nghi phương sai cục bộ (Variance-Guided Smoothing)
        low_freq = cv2.GaussianBlur(proc_img, (k_small, k_small), avg_bw * 0.008)
        high_freq = proc_img.astype(np.float32) - low_freq.astype(np.float32)

        smooth_surface = cv2.GaussianBlur(proc_img, (k_large, k_large), avg_bw * 0.035)
        mid_freq = low_freq.astype(np.float32) - smooth_surface.astype(np.float32)

        # Đo độ thô nhám cục bộ: vùng da đã phẳng mịn -> giảm smoothing để bảo toàn khối 3D tự nhiên
        gray_f = gray.astype(np.float32)
        local_base = cv2.GaussianBlur(gray_f, (k_med, k_med), 0)
        local_var = cv2.GaussianBlur((gray_f - local_base)**2, (k_med, k_med), 0)
        smooth_adaptive = np.clip(local_var / 35.0, 0.35, 1.0)[..., np.newaxis]

        # Skin Evening & Blemish Compression
        evening_fac = np.clip(cfg.skinEvening * cfg.skinSmoothing, 0.0, 0.95) * smooth_adaptive
        mid_evening = mid_freq * (1.0 - evening_fac)

        tau = 16.0 / (1.0 + 3.0 * cfg.blemishRemoval)
        mid_blemish = np.tanh(mid_evening / tau) * tau

        clarity_mod = np.clip(-cfg.softGlow * 30.0 / 300.0, -0.15, 0.15)
        mid_final = mid_blemish * (1.0 + clarity_mod)
        if cfg.presetId == 'white_pink':
            # Retain broad anatomical shading rather than compressing every
            # mid-frequency feature as though it were a blemish.
            mid_final = mid_final * .65 + mid_freq * .35

        # Tái hòa nhập vân da thật vi mô (bảo toàn 60% high-frequency texture nguyên bản, chống da nhựa)
        tex_retention = float(np.clip(cfg.skinTextureRetention, 0.0, 1.0))
        retouched_face = smooth_surface.astype(np.float32) + mid_final + high_freq * tex_retention
        retouched_face = retouched_face * (1.0 - high_mask) + proc_img.astype(np.float32) * high_mask
        retouched_face = retouched_face * (1.0 - wire_3c) + proc_img.astype(np.float32) * wire_3c
        retouched_face = np.clip(retouched_face, 0, 255)

        # 4. Trích xuất Anatomical Masks
        masks = self.generate_anatomical_masks(proc_img, faces, wire_prot,
            cfg.blushSpread * (0.80 if cfg.presetId == 'white_pink' else 1.0),
            cheekbone_strength=.55 if cfg.presetId in ('white_pink', 'white_pink_v2') else 0.,
            protect_glasses=cfg.protectGlasses and cfg.presetId=='white_pink_v2',
            continuous_skin=cfg.presetId=='white_pink_v2')
        skin_mask = masks["skin"]
        blush_mask = masks["blush"]
        lip_mask = masks["lip"]
        eye_sharp_mask = masks["eye_sharp"]
        nose_mask = masks["nose"]
        jaw_mask = masks["jaw"]

        # 5. Hòa trộn vùng da mịn vào nền gốc (Bảo toàn 100% tóc, trang phục, phông nền)
        mask_3c = skin_mask[..., np.newaxis]
        blended = retouched_face * mask_3c + proc_img.astype(np.float32) * (1.0 - mask_3c)
        blended = np.clip(blended, 0, 255).astype(np.uint8)
        if cfg.presetId == 'white_pink_v2':
            # Smooth luminance detail only. A shared integer RGB offset preserves
            # colour differences exactly; remove the broad illumination change.
            raw_luma=cv2.cvtColor(retouched_face.astype(np.float32),cv2.COLOR_BGR2GRAY)-gray.astype(np.float32)
            support=skin_mask*(1.-wire_prot)
            sigma=max(2.,avg_bw*.06)
            broad=cv2.GaussianBlur(raw_luma*support,(0,0),sigma)
            norm=cv2.GaussianBlur(support,(0,0),sigma)
            detail=np.clip(raw_luma-broad/np.maximum(norm,1e-5),-6.,6.)*support
            offset=np.rint(detail).astype(np.int16)
            offset=np.maximum(offset,-proc_img.min(axis=2).astype(np.int16))
            offset=np.minimum(offset,255-proc_img.max(axis=2).astype(np.int16))
            blended=(proc_img.astype(np.int16)+offset[...,None]).astype(np.uint8)

        # 6. Multi-scale Blemish Removal (Khử sạch khuyết điểm còn sót trên trán, má, cằm)
        gray_bl = cv2.cvtColor(blended, cv2.COLOR_BGR2GRAY).astype(np.float32)
        clean_base = cv2.medianBlur(gray_bl.astype(np.uint8), k_med).astype(np.float32)
        dark_deficit = np.maximum(0.0, clean_base - gray_bl)

        # Brightness-based candidates; this is not a semantic mole/acne classifier.
        blemish_w = np.clip((dark_deficit - 2.0) / 4.0, 0.0, 1.0) * np.clip((45.0 - dark_deficit) / 12.0, 0.0, 1.0)
        lift = np.minimum(dark_deficit, 32.0) * (cfg.blemishRemoval * 0.88 * blemish_w) * skin_mask * (1.0 - wire_prot)
        if cfg.selectiveBlemish:
            # Keep strong dark marks/strands and anatomical edges from being lifted.
            gx = cv2.Sobel(gray_bl, cv2.CV_32F, 1, 0, ksize=3, scale=0.125)
            gy = cv2.Sobel(gray_bl, cv2.CV_32F, 0, 1, ksize=3, scale=0.125)
            edge_guard = np.exp(-cv2.magnitude(gx, gy) / 10.0)
            dark_guard = np.clip((24.0 - dark_deficit) / 12.0, 0.0, 1.0)
            anatomy_guard = 1.0 - np.clip(lip_mask + eye_sharp_mask, 0.0, 1.0)
            lift *= edge_guard * dark_guard * anatomy_guard
        blended = np.clip(blended.astype(np.float32) + lift[..., np.newaxis], 0, 255).astype(np.uint8)

        # 7. Selective under-eye correction. Dense V2 uses its dedicated lower-lid
        # skin mask and local cheek reference; V1/landmark fallback retain the
        # existing path unchanged. No image blur is used to conceal texture.
        dense_under_eye = cfg.presetId == "white_pink_v2" and np.any(masks["under_eye"])
        if dense_under_eye:
            ue_lab = cv2.cvtColor(blended, cv2.COLOR_BGR2LAB).astype(np.float32)
            ue_l, ue_a, ue_b = cv2.split(ue_lab)
            for f in faces:
                dense = f.get("dense_landmarks")
                if dense is None or len(dense) < 468:
                    continue
                bx, by, bw, bh = map(int, f["box"])
                eye_specs = ((33, 133, [33, 144, 145, 153, 154, 155, 133]),
                             (263, 362, [263, 373, 374, 380, 381, 382, 362]))
                for outer_id, inner_id, lower_ids in eye_specs:
                    p_outer = dense[outer_id].astype(np.float32)
                    p_inner = dense[inner_id].astype(np.float32)
                    eye_width = float(np.linalg.norm(p_inner - p_outer))
                    if eye_width < 3.0:
                        continue
                    curve = dense[lower_ids].astype(np.float32)
                    x0 = max(0, int(np.floor(min(p_outer[0], p_inner[0]) - eye_width * .12)))
                    x1 = min(w, int(np.ceil(max(p_outer[0], p_inner[0]) + eye_width * .12)))
                    y0 = max(0, int(np.floor(curve[:, 1].min() - bh * .01)))
                    y1 = min(h, int(np.ceil(curve[:, 1].max() + bh * .060)))
                    sy0 = max(0, int(np.ceil(curve[:, 1].max() + bh * .018)))
                    sy1 = min(h, int(np.ceil(curve[:, 1].max() + bh * .13)))
                    if x1 <= x0 or y1 <= y0 or sy1 <= sy0:
                        continue

                    sample_support = ((masks["skin"][sy0:sy1, x0:x1] > .25) |
                                      (masks["colour"][sy0:sy1, x0:x1] > .25))
                    sample_support &= masks["blush"][sy0:sy1, x0:x1] < .12
                    sample_support &= wire_prot[sy0:sy1, x0:x1] < .35
                    cheek_pixels = ue_lab[sy0:sy1, x0:x1][sample_support]
                    if cheek_pixels.shape[0] < 12:
                        continue

                    target_l = float(np.percentile(cheek_pixels[:, 0], 65))
                    target_a = float(np.median(cheek_pixels[:, 1]))
                    target_b = float(np.median(cheek_pixels[:, 2]))
                    alpha = masks["under_eye"][y0:y1, x0:x1].astype(np.float32) / 255.0
                    local_a = ue_a[y0:y1, x0:x1]
                    local_b = ue_b[y0:y1, x0:x1]
                    local_l = ue_l[y0:y1, x0:x1]
                    chroma_distance = np.sqrt((local_a - target_a) ** 2 + (local_b - target_b) ** 2)
                    # The legacy eye-protection ellipse can remove the entire
                    # tear-trough from skin_mask. Validate the dense polygon
                    # independently against nearby cheek chroma/luminance.
                    photo_skin = np.clip((52.0 - chroma_distance) / 24.0, 0.0, 1.0)
                    photo_skin *= np.clip((local_l - 35.0) / 35.0, 0.0, 1.0)
                    frame_edges = wire_prot[y0:y1, x0:x1]
                    frame_guard = 1.0 - np.clip((frame_edges - .68) / .32, 0.0, .90)
                    alpha *= photo_skin * frame_guard
                    active = alpha > .025
                    if not np.any(active):
                        continue

                    local_l = ue_l[y0:y1, x0:x1]
                    local_a = ue_a[y0:y1, x0:x1]
                    local_b = ue_b[y0:y1, x0:x1]

                    # Lift only meaningful local darkness, with a bounded amount
                    # so the tear-trough/bag shadow remains visible.
                    l_deficit = np.clip(target_l - local_l - 4.0, 0.0, 16.0)
                    l_gain = l_deficit * cfg.darkCirclesReduction * .65 * alpha
                    local_l += l_gain

                    # Gently neutralize a blue/purple cast toward nearby cheek
                    # chroma without recolouring the eyelid or drawing makeup.
                    chroma_strength = cfg.darkCirclesReduction * .18 * alpha
                    local_a += np.clip(target_a - local_a, -3.0, 3.0) * chroma_strength
                    local_b += np.clip(target_b - local_b, -3.0, 3.0) * chroma_strength

            blended = cv2.cvtColor(np.uint8(np.clip(cv2.merge([ue_l, ue_a, ue_b]), 0, 255)), cv2.COLOR_LAB2BGR)
        else:
            gray_ue = cv2.cvtColor(blended, cv2.COLOR_BGR2GRAY).astype(np.float32)
            gray_sm_ue = cv2.GaussianBlur(gray_ue, (k_small, k_small), 1.2)
            edge_mag_ue = np.abs(cv2.Laplacian(gray_sm_ue, cv2.CV_32F))
            out_ue = blended.astype(np.float32).copy()

            for f in faces:
                bx, by, bw, bh = f["box"]
                lm = f["landmarks"]
                for eye_pt in [lm[0], lm[1]]:
                    ex, ey = int(eye_pt[0]), int(eye_pt[1])
                    rx = int(bw * 0.22)
                    ry = int(bh * 0.080)
                    cen_x, cen_y = ex, ey + int(bh * 0.100)

                    loc_y1, loc_y2 = max(0, ey + int(bh * 0.12)), min(h, ey + int(bh * 0.22))
                    loc_x1, loc_x2 = max(0, ex - int(bw * 0.10)), min(w, ex + int(bw * 0.10))
                    target_local = float(np.percentile(gray_ue[loc_y1:loc_y2, loc_x1:loc_x2], 75)) if loc_x2 > loc_x1 else 185.0

                    x1_u, x2_u = max(0, cen_x - rx), min(w, cen_x + rx)
                    y1_u, y2_u = max(0, ey - int(ry * 0.1)), min(h, cen_y + int(ry * 1.5))
                    pw, ph = x2_u - x1_u, y2_u - y1_u
                    if pw <= 0 or ph <= 0:
                        continue
                    yg, xg = np.ogrid[:ph, :pw]
                    cx, cy = cen_x - x1_u, cen_y - y1_u
                    cres = np.clip(1.0 - (((xg - cx)**2 / rx**2 + (yg - cy)**2 / ry**2)), 0.0, 1.0)**1.1
                    safe_m = ey + int(bh * 0.055) - y1_u
                    t_h = max(1.0, float(int(bh * 0.035)))
                    vt = np.clip((yg - safe_m) / t_h, 0.0, 1.0)
                    vert_gate = vt * vt * (3.0 - 2.0 * vt)
                    cres *= vert_gate
                    cres *= np.exp(-edge_mag_ue[y1_u:y2_u, x1_u:x2_u] / 10.0)
                    cres = cv2.GaussianBlur(cres, (7, 7), 2.0)

                    defic = np.maximum(0.0, target_local - gray_ue[y1_u:y2_u, x1_u:x2_u])
                    lift_ue = defic * cres * cfg.darkCirclesReduction
                    out_ue[y1_u:y2_u, x1_u:x2_u] += lift_ue[..., np.newaxis]

            blended = np.clip(out_ue, 0, 255).astype(np.uint8)

        if cfg.presetId == 'white_pink_v2':
            # Correct upper-lip darkness during retouch, before tone exaggerates
            # differences. Reuse the bounded V1 lift without blurring image detail.
            retouch_lab = cv2.cvtColor(blended, cv2.COLOR_BGR2LAB).astype(np.float32)
            retouch_source = retouch_lab.copy()
            retouch_roundtrip = cv2.cvtColor(retouch_source.astype(np.uint8), cv2.COLOR_LAB2BGR)
            upper_skin = masks['colour'] * (1. - masks['lip'])
            for _ in range(cfg.upperLipPasses):
                self.soften_upper_lip_shadow(retouch_lab, retouch_source, faces, upper_skin, cfg.upperLipStrength)
            corrected = cv2.cvtColor(np.clip(retouch_lab,0,255).astype(np.uint8), cv2.COLOR_LAB2BGR)
            blended = np.clip(blended.astype(np.float32) + corrected.astype(np.float32) - retouch_roundtrip.astype(np.float32),0,255).astype(np.uint8)

        # 8. Korean Porcelain Tone, Anti-Redness & Virtual Makeup (CIELAB)
        # Tone uses a separate smooth mask; detail processing above retains edge protection.
        skin_mask = masks["colour"]
        before_colour_bgr = blended.copy()
        lab = cv2.cvtColor(blended, cv2.COLOR_BGR2LAB).astype(np.float32)
        colour_roundtrip = cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2BGR)
        harmonized_tone = cfg.presetId in ('white_pink', 'white_pink_v2')
        tone_before = lab.copy() if harmonized_tone else None
        neck_support = np.zeros((h,w),np.float32)
        L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]

        if harmonized_tone and cfg.skinEvening > 0:
            # Even chroma without filtering luminance/skin texture.
            # Normalize by skin coverage so a red backdrop/hair cannot colour the face.
            field = np.dstack((lab[...,1:]*skin_mask[...,None],skin_mask))
            field = cv2.GaussianBlur(field,(0,0),max(2.,avg_bw*.06))
            chroma_base = field[...,:2]/np.maximum(field[...,2:],1e-5)
            lab[...,1:] += np.clip(chroma_base-lab[...,1:],-6.,6.) * (cfg.skinEvening*skin_mask[...,None])

        # A. Porcelain Skin Brightening (Chỉ nâng sáng midtone dải 150-190, bảo toàn highlight)
        bright_curve = np.clip(1.0 - np.abs(L - 170.0) / 75.0, 0.0, 1.0)
        if harmonized_tone:
            # Preserve broad facial shading instead of lifting shadows equally.
            broad_light = cv2.GaussianBlur(tone_before[..., 0], (0, 0), max(2., avg_bw * .09))
            depth_weight = .70 + .30 * np.clip((broad_light - 130.) / 70., 0., 1.)
            bright_curve = np.clip(1.0 - np.abs(broad_light - 170.0) / 75.0, 0., 1.) * depth_weight
        L += bright_curve * (cfg.skinBrightening * 36.0) * skin_mask * (1.0 - high_mask[..., 0])
        if cfg.skinDiffuseLight > 0:
            local_light = cv2.GaussianBlur(L, (k_large, k_large), 0)
            shadow_lift = np.clip(local_light - L, 0.0, 8.0)
            L += shadow_lift * cfg.skinDiffuseLight * skin_mask * (1.0 - wire_prot)

        # B. Tinh chỉnh sắc da: giảm vàng sạm mà KHÔNG tăng đỏ toàn mặt
        if cfg.presetId != 'white_pink_v2':
            B -= (2.5 * cfg.skinBrightening) * skin_mask
        # Optional skin-only grading, not global white balance. Bound the chroma change.
        if cfg.presetId != 'white_pink_v2':
            B -= np.clip(B - 140.0, 0.0, 12.0) * cfg.skinYellowReduction * skin_mask

        # C. Khử sắc đỏ mụn/viêm cục bộ (Inflammatory Redness Neutralization):
        A_surround = cv2.GaussianBlur(A, (k_large, k_large), 0)
        red_excess = np.maximum(0.0, A - A_surround)
        if cfg.presetId != 'white_pink_v2':
            A -= red_excess * (0.65 * cfg.blemishRemoval * skin_mask)

        # Lift green/neutral skin gently toward pink; leave already rosy skin alone.
        pink_deficit = np.clip(138.0 - A, 0.0, 6.0)
        A += pink_deficit * cfg.rosyTone * skin_mask * (1.0 - high_mask[..., 0])

        if cfg.presetId != 'white_pink_v2':
            self.apply_rosy_blush(lab,cfg,blush_mask,A_surround)

        if tone_before is not None:
            self.harmonize_face_tone(tone_before,lab,proc_img,faces,skin_mask)
            # Smooth only the ADDED light around nose/philtrum. Original shadows,
            # pores and facial hair remain in tone_before without reconstruction.
            local_zone = np.zeros((h, w), np.float32)
            for face in faces:
                bx, by, bw, bh = face['box']
                nx, ny = face['landmarks'][2]
                mx, my = np.mean(face['landmarks'][3:], axis=0)
                yy, xx = np.ogrid[:h, :w]
                d = ((xx-nx)/max(1., bw*.22))**2 + ((yy-(ny+my)*.5)/max(1., bh*.16))**2
                zone = np.clip(1.-d, 0., 1.)
                local_zone = np.maximum(local_zone, zone*zone*(3.-2.*zone))
            added = lab[...,0] - tone_before[...,0]
            weight = skin_mask.astype(np.float32)
            sigma = max(1., avg_bw*.045)
            field = cv2.GaussianBlur(added*weight, (0,0), sigma)
            norm = cv2.GaussianBlur(weight, (0,0), sigma)
            correction = np.clip(field/np.maximum(norm, 1e-5)-added, -5., 5.)
            lab[...,0] += correction * local_zone * skin_mask

        if tone_before is not None:
            neck_lift = self.brighten_neck_toward_face(lab,proc_img,faces,wire_prot)
            if cfg.presetId == 'white_pink_v2':
                neck_support = (neck_lift > 1e-4).astype(np.float32)
            self.soften_nose_wing_shadow(lab, tone_before, faces, skin_mask)
            upper_lip_source = lab.copy()
            if cfg.presetId == 'white_pink':
                for _ in range(cfg.upperLipPasses):
                    self.soften_upper_lip_shadow(lab, upper_lip_source, faces, skin_mask, cfg.upperLipStrength)

        if cfg.presetId == 'white_pink_v2':
            self.harmonize_local_skin(lab,faces,skin_mask,lip_mask)
            self.lift_outer_cheeks(lab,faces,skin_mask,lip_mask)
            self.apply_rosy_blush(lab,cfg,blush_mask,A_surround)

        # E. Virtual Makeup: Lip Tint (son môi ombre san hô)
        lip_strength = cfg.lipEnhancement
        if tone_before is not None:
            lip_strength = lip_strength * (1. - .75*np.clip((tone_before[...,1]-145.)/20., 0., 1.))
        A += (20.0 * lip_strength) * lip_mask
        B += (3.5 * lip_strength) * lip_mask
        L += (2.0 * cfg.lipEnhancement) * lip_mask
        if cfg.lipGloss > 0 and np.any(lip_mask > 0.3):
            original_l = tone_before[...,0] if tone_before is not None else L
            threshold = float(np.percentile(original_l[lip_mask > 0.3], 60))
            gloss = np.clip((original_l - threshold) / max(255.0 - threshold, 1.0), 0.0, 1.0)
            if cfg.presetId == 'white_pink':
                gloss *= np.clip(lip_mask / .5, 0., 1.)
            L += (255.0 - L) * gloss * lip_mask * cfg.lipGloss * 0.5

        lab_final = cv2.merge([np.clip(L, 0, 255), np.clip(A, 0, 255), np.clip(B, 0, 255)])
        if cfg.shineReduction > 0 and np.any(skin_mask > 0.5):
            # Suppress only the bright tail of skin luminance; never blur its texture.
            threshold = max(185.0, float(np.percentile(L[skin_mask > 0.5], 75)))
            shine = np.clip((L - threshold) / max(255.0 - threshold, 1.0), 0.0, 1.0)
            shine = shine * shine * (3.0 - 2.0 * shine)
            safe_skin = skin_mask * (1.0 - np.clip(wire_prot + lip_mask + eye_sharp_mask, 0.0, 1.0))
            lab_final[..., 0] -= shine * safe_skin * (20.0 * cfg.shineReduction)
        blended = cv2.cvtColor(lab_final.astype(np.uint8), cv2.COLOR_LAB2BGR)
        # Colour operations already contain their feather weights. Preserve their
        # delta separately so final background compositing does not square alpha.
        colour_delta = blended.astype(np.float32) - colour_roundtrip.astype(np.float32)
        colour_support = np.clip(skin_mask + blush_mask + lip_mask + neck_support, 0., 1.) > 1e-4
        colour_delta[~colour_support] = 0.
        blended = before_colour_bgr

        # 9. Selective Eye Sharpening
        if cfg.eyeSharpening > 0 and np.sum(eye_sharp_mask) > 0:
            k_sharp = np.array([[0, -1, 0], [-1, 4, -1], [0, -1, 0]], dtype=np.float32)
            lap_c = cv2.filter2D(blended, cv2.CV_32F, k_sharp)
            lap_clamped = np.clip(lap_c, -16.0, 16.0)
            if cfg.presetId == 'white_pink':
                # Reinforce only existing eye detail, without painting new lashes.
                lap_clamped *= 1.35
            sharpened = blended.astype(np.float32) + lap_clamped * (cfg.eyeSharpening * 1.4 * eye_sharp_mask[..., np.newaxis])
            # Keep sharpened pixels inside existing local extrema to avoid halos.
            local_min = cv2.erode(blended, np.ones((3,3), np.uint8)).astype(np.float32)
            local_max = cv2.dilate(blended, np.ones((3,3), np.uint8)).astype(np.float32)
            blended = np.rint(np.clip(sharpened, local_min, local_max)).astype(np.uint8)

        # 10. Global Sharpening (nếu được bật tường minh)
        if cfg.globalSharpening > 0:
            k_sharp = np.array([[0, -1, 0], [-1, 4, -1], [0, -1, 0]], dtype=np.float32)
            lap_g = cv2.filter2D(blended, cv2.CV_32F, k_sharp)
            blended = np.clip(blended.astype(np.float32) + lap_g * (cfg.globalSharpening * 0.15), 0, 255).astype(np.uint8)

        # 11. Bảo Toàn Tuyệt Đối Màu Nền Gốc (Background Color & Object Preservation)
        # Hợp nhất toàn bộ mặt nạ giải phẫu và biến dạng đã can thiệp
        treatment_mask = np.clip(masks["skin"] + skin_mask + blush_mask + lip_mask + eye_sharp_mask + reshape_mask + neck_support, 0.0, 1.0)
        if dense_under_eye:
            # The legacy skin mask intentionally excludes eye-protection regions.
            # Include only the dedicated lower-lid geometry in final compositing,
            # otherwise the under-eye correction is silently replaced by input.
            for face in faces:
                x, y, bw, bh = map(int, face["box"])
                x0, y0 = max(0, x), max(0, y)
                x1, y1 = min(w, x + bw), min(h, y + bh)
                if x1 > x0 and y1 > y0:
                    under = masks["under_eye"][y0:y1, x0:x1].astype(np.float32) / 255.0
                    region = treatment_mask[y0:y1, x0:x1]
                    np.maximum(region, under, out=region)
        mask_3c = treatment_mask[..., np.newaxis]

        # Soft Alpha Blending mượt mà chuyển tiếp giữa vùng làm đẹp và ảnh gốc
        bg_float = clean_bg.astype(np.float32)
        blended = np.clip(np.round(blended.astype(np.float32) * mask_3c + bg_float * (1.0 - mask_3c) + colour_delta), 0, 255).astype(np.uint8)

        # Cam kết sai lệch RGB ngoài vùng xử lý bằng tuyệt đối 0.0 trước khi nén JPEG
        outside_zone = (treatment_mask <= 1e-4)
        blended[outside_zone] = clean_bg[outside_zone]

        duration = time.time() - t0
        logger.info(f"Korean Soft Beauty V3 (Reshaping 4.5% + Retouch) xử lý thành công trong {duration:.2f}s.")
        return blended


korean_beauty_engine = KoreanBeautyEngine()

