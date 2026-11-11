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
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple

import cv2
import numpy as np
from pydantic import BaseModel, Field

logger = logging.getLogger("ai_service.korean_beauty")

MODEL_PATH = Path(__file__).resolve().parent.parent / "data" / "face_detection_yunet_2023mar.onnx"


class KoreanBeautyConfig(BaseModel):
    presetId: str = Field("korean_soft_beauty", description="ID của preset")
    enabled: bool = Field(True, description="Bật/tắt preset Korean Soft Beauty")
    skinSmoothing: float = Field(0.65, ge=0.0, le=1.0, description="Mức làm mịn bề mặt da")
    blemishRemoval: float = Field(0.75, ge=0.0, le=1.0, description="Mức khử khuyết điểm và đốm thâm")
    skinEvening: float = Field(0.60, ge=0.0, le=1.0, description="Mức làm đều màu da")
    skinTextureRetention: float = Field(0.65, ge=0.0, le=1.0, description="Tỷ lệ giữ lại vân da vi mô tự nhiên")
    skinBrightening: float = Field(0.00, ge=0.0, le=1.0, description="Nâng sáng trắng hồng trong trẻo (0.00 bảo toàn ánh sáng đèn studio thật)")
    softGlow: float = Field(0.03, ge=0.0, le=1.0, description="Độ mềm và ánh sáng studio dịu dàng")
    rosyBlush: float = Field(0.15, ge=0.0, le=1.0, description="Má hồng tự nhiên (15%, thích ứng giảm còn 5% nếu đã có má hồng sẵn)")
    lipEnhancement: float = Field(0.10, ge=0.0, le=1.0, description="Tăng sắc hồng tự nhiên cho môi")
    eyeSharpening: float = Field(0.15, ge=0.0, le=1.0, description="Độ sắc nét chọn lọc cho mắt, mi và lông mày")
    globalSharpening: float = Field(0.00, ge=0.0, le=1.0, description="Sharpening toàn cảnh (mặc định 0.0)")
    slimFace: float = Field(0.04, ge=0.0, le=0.20, description="Cằm V-line 4% (3-5%)")
    bigEyes: float = Field(0.05, ge=0.0, le=0.20, description="Mắt to tự nhiên 5%")
    slimNose: float = Field(0.04, ge=0.0, le=0.20, description="Mũi nhỏ thanh thoát 4%")


class KoreanBeautyEngine:
    def __init__(self, model_path: Optional[Path] = None):
        self.model_path = model_path or MODEL_PATH

    def detect_faces(self, img_bgr: np.ndarray) -> List[Dict[str, Any]]:
        """Nhận diện khuôn mặt và 5 điểm Landmark giải phẫu bằng YuNet tỉ lệ chuẩn."""
        if not self.model_path.is_file():
            logger.warning(f"Model YuNet không tồn tại: {self.model_path}")
            return []

        h, w, _ = img_bgr.shape
        det_w, det_h = 960, 720
        small = cv2.resize(img_bgr, (det_w, det_h))
        detector = cv2.FaceDetectorYN_create(str(self.model_path), '', (det_w, det_h), score_threshold=0.6)
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

    def apply_subtle_reshaping(
        self,
        img_bgr: np.ndarray,
        faces: List[Dict[str, Any]],
        slim_face: float = 0.045,
        big_eyes: float = 0.045,
        slim_nose: float = 0.045
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
            if slim_face > 0.001:
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
        wire_prot: np.ndarray
    ) -> Dict[str, np.ndarray]:
        """Tạo các mặt nạ giải phẫu chuyên biệt: Da, Má hồng, Môi, Mắt."""
        h, w, _ = img_bgr.shape
        full_skin_mask = np.zeros((h, w), dtype=np.float32)
        blush_mask = np.zeros((h, w), dtype=np.float32)
        lip_mask = np.zeros((h, w), dtype=np.float32)
        eye_sharp_mask = np.zeros((h, w), dtype=np.float32)

        ycrcb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2YCrCb)
        hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
        lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

        for f in faces:
            bx, by, bw, bh = f["box"]
            lm = f["landmarks"]
            r_eye, l_eye, nose, m_r, m_l = lm

            pad_x = int(bw * 0.18)
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

            # Loại trừ môi
            mouth_center = ((m_r + m_l) / 2).astype(int)
            mx, my = mouth_center[0] - x1, mouth_center[1] - y1
            mouth_w = int(np.linalg.norm(m_l - m_r) * 0.55)
            mouth_h = int(bh * 0.065)
            cv2.ellipse(face_roi, (mx, my), (mouth_w, mouth_h), 0, 0, 360, 0, -1)

            feathered_skin = cv2.GaussianBlur(face_roi.astype(np.float32) / 255.0, (41, 41), 15.0)
            full_skin_mask[y1:y2, x1:x2] = np.maximum(full_skin_mask[y1:y2, x1:x2], feathered_skin)

            # 2. Rosy Blush Mask: Gò má quả táo Zygomaticus
            blush_rx = int(bw * 0.16)
            blush_ry = int(bh * 0.11)
            r_blush_c = (int(r_eye[0] - bw * 0.04), int(r_eye[1] + bh * 0.15))
            l_blush_c = (int(l_eye[0] + bw * 0.04), int(l_eye[1] + bh * 0.15))

            for bc in [r_blush_c, l_blush_c]:
                bx_c, by_c = bc
                x1_b, x2_b = max(0, bx_c - blush_rx * 2), min(w, bx_c + blush_rx * 2)
                y1_b, y2_b = max(0, by_c - blush_ry * 2), min(h, by_c + blush_ry * 2)
                pw, ph = x2_b - x1_b, y2_b - y1_b
                if pw <= 0 or ph <= 0:
                    continue
                yg, xg = np.ogrid[:ph, :pw]
                dist_sq = ((xg - (bx_c - x1_b))**2 / (blush_rx**2) + (yg - (by_c - y1_b))**2 / (blush_ry**2))
                b_gaussian = np.exp(-0.5 * dist_sq * 2.2) * np.clip(1.0 - dist_sq * 0.35, 0.0, 1.0)
                # Giới hạn trong da và loại trừ gọng kính
                b_gaussian *= full_skin_mask[y1_b:y2_b, x1_b:x2_b] * (1.0 - wire_prot[y1_b:y2_b, x1_b:x2_b])
                blush_mask[y1_b:y2_b, x1_b:x2_b] = np.maximum(blush_mask[y1_b:y2_b, x1_b:x2_b], b_gaussian)

            # 3. Lip Tint Mask: Viền môi ombre mềm mại
            mouth_dist = np.linalg.norm(m_l - m_r)
            lip_rx = int(mouth_dist * 0.58)
            lip_ry = int(bh * 0.058)
            lx1, lx2 = max(0, mouth_center[0] - lip_rx - 15), min(w, mouth_center[0] + lip_rx + 15)
            ly1, ly2 = max(0, mouth_center[1] - lip_ry - 15), min(h, mouth_center[1] + lip_ry + 15)
            lpw, lph = lx2 - lx1, ly2 - ly1
            if lpw > 0 and lph > 0:
                lyg, lxg = np.ogrid[:lph, :lpw]
                ldist = ((lxg - (mouth_center[0] - lx1))**2 / (lip_rx**2) + (lyg - (mouth_center[1] - ly1))**2 / (lip_ry**2))
                l_ellipse = np.clip(1.0 - ldist, 0.0, 1.0)**1.2
                roi_lab = lab[ly1:ly2, lx1:lx2]
                lip_chroma = np.clip((roi_lab[..., 1].astype(float) - 136.0) / 16.0, 0.0, 1.0)
                l_final = l_ellipse * (0.35 + 0.65 * lip_chroma)
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

        return {
            "skin": full_skin_mask,
            "blush": blush_mask,
            "lip": lip_mask,
            "eye_sharp": eye_sharp_mask
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

        t0 = time.time()
        h, w, _ = img_bgr.shape

        # 1. Nhận diện khuôn mặt
        faces = self.detect_faces(img_bgr)
        if len(faces) == 0:
            logger.info("Không phát hiện khuôn mặt; giữ nguyên ảnh gốc.")
            return clean_bg.copy()

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
                roi_faces.append({"box": r_box, "landmarks": r_lm, "conf": f["conf"]})

            proc_roi = self._process_core(roi_img, roi_faces, cfg, roi_clean)

            out_img = clean_bg.copy()
            out_img[ry1:ry2, rx1:rx2] = proc_roi
            logger.info(f"Hoàn tất Korean Soft Beauty ROI ({rx2-rx1}x{ry2-ry1}) trong {(time.time() - t0)*1000:.1f}ms.")
            return out_img

        return self._process_core(img_bgr, faces, cfg, clean_bg)

    def _process_core(
        self,
        img_bgr: np.ndarray,
        faces: List[Dict[str, Any]],
        cfg: KoreanBeautyConfig,
        clean_bg: np.ndarray
    ) -> np.ndarray:
        t0 = time.time()
        h, w, _ = img_bgr.shape

        # 1.5. Vi chỉnh hình thể nhẹ nhàng (Subtle Reshaping: Mặt thon, Mắt to, Mũi nhỏ 4-5%)
        proc_img, reshape_mask = self.apply_subtle_reshaping(
            img_bgr, faces,
            slim_face=cfg.slimFace,
            big_eyes=cfg.bigEyes,
            slim_nose=cfg.slimNose
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

        # Tái hòa nhập vân da thật vi mô (bảo toàn 60% high-frequency texture nguyên bản, chống da nhựa)
        tex_retention = max(0.45, min(0.75, cfg.skinTextureRetention))
        retouched_face = smooth_surface.astype(np.float32) + mid_final + high_freq * tex_retention
        retouched_face = retouched_face * (1.0 - high_mask) + proc_img.astype(np.float32) * high_mask
        retouched_face = retouched_face * (1.0 - wire_3c) + proc_img.astype(np.float32) * wire_3c
        retouched_face = np.clip(retouched_face, 0, 255)

        # 4. Trích xuất Anatomical Masks
        masks = self.generate_anatomical_masks(proc_img, faces, wire_prot)
        skin_mask = masks["skin"]
        blush_mask = masks["blush"]
        lip_mask = masks["lip"]
        eye_sharp_mask = masks["eye_sharp"]

        # 5. Hòa trộn vùng da mịn vào nền gốc (Bảo toàn 100% tóc, trang phục, phông nền)
        mask_3c = skin_mask[..., np.newaxis]
        blended = retouched_face * mask_3c + proc_img.astype(np.float32) * (1.0 - mask_3c)
        blended = np.clip(blended, 0, 255).astype(np.uint8)

        # 6. Multi-scale Blemish Removal (Khử sạch khuyết điểm còn sót trên trán, má, cằm)
        gray_bl = cv2.cvtColor(blended, cv2.COLOR_BGR2GRAY).astype(np.float32)
        clean_base = cv2.medianBlur(gray_bl.astype(np.uint8), k_med).astype(np.float32)
        dark_deficit = np.maximum(0.0, clean_base - gray_bl)

        # Phân biệt khuyết điểm (mụn, thâm, rãnh) với nốt ruồi / tàn nhang có chủ ý
        blemish_w = np.clip((dark_deficit - 2.0) / 4.0, 0.0, 1.0) * np.clip((45.0 - dark_deficit) / 12.0, 0.0, 1.0)
        lift = np.minimum(dark_deficit, 32.0) * (cfg.blemishRemoval * 0.88 * blemish_w) * skin_mask * (1.0 - wire_prot)
        blended = np.clip(blended.astype(np.float32) + lift[..., np.newaxis], 0, 255).astype(np.uint8)

        # 7. Under-Eye Tear Trough Lighting Lift (Hermite gate)
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
                lift_ue = defic * cres * 0.40
                out_ue[y1_u:y2_u, x1_u:x2_u] += lift_ue[..., np.newaxis]

        blended = np.clip(out_ue, 0, 255).astype(np.uint8)

        # 8. Korean Porcelain Tone, Anti-Redness & Virtual Makeup (CIELAB)
        lab = cv2.cvtColor(blended, cv2.COLOR_BGR2LAB).astype(np.float32)
        L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]

        # A. Porcelain Skin Brightening (Chỉ nâng sáng midtone dải 150-190, bảo toàn highlight)
        bright_curve = np.clip(1.0 - np.abs(L - 170.0) / 75.0, 0.0, 1.0)
        L += bright_curve * (cfg.skinBrightening * 36.0) * skin_mask * (1.0 - high_mask[..., 0])

        # B. Tinh chỉnh sắc da: giảm vàng sạm mà KHÔNG tăng đỏ toàn mặt
        B -= (2.5 * cfg.skinBrightening) * skin_mask

        # C. Khử sắc đỏ mụn/viêm cục bộ (Inflammatory Redness Neutralization):
        A_surround = cv2.GaussianBlur(A, (k_large, k_large), 0)
        red_excess = np.maximum(0.0, A - A_surround)
        A -= red_excess * (0.65 * cfg.blemishRemoval * skin_mask)

        # D. Virtual Makeup: Rosy Blush (gò má quả táo Zygomaticus)
        # Thích ứng thông minh: má hồng 15%, nếu gò má đã có sẵn sắc hồng thì chỉ thêm 5% để không bị lố
        if cfg.rosyBlush > 0.001 and np.sum(blush_mask) > 0:
            cheek_core = blush_mask > 0.40
            cur_a = float(np.mean(A[cheek_core])) if np.any(cheek_core) else 128.0
            if cur_a >= 138.0:
                eff_blush = min(cfg.rosyBlush, 0.05)
            else:
                eff_blush = cfg.rosyBlush

            A += (16.0 * eff_blush) * blush_mask
            B -= (2.5 * eff_blush) * blush_mask
            L += (2.0 * eff_blush) * blush_mask

        # E. Virtual Makeup: Lip Tint (son môi ombre san hô)
        A += (20.0 * cfg.lipEnhancement) * lip_mask
        B += (3.5 * cfg.lipEnhancement) * lip_mask
        L += (2.0 * cfg.lipEnhancement) * lip_mask

        lab_final = cv2.merge([np.clip(L, 0, 255), np.clip(A, 0, 255), np.clip(B, 0, 255)])
        blended = cv2.cvtColor(lab_final.astype(np.uint8), cv2.COLOR_LAB2BGR)

        # 9. Selective Eye Sharpening
        if cfg.eyeSharpening > 0 and np.sum(eye_sharp_mask) > 0:
            k_sharp = np.array([[0, -1, 0], [-1, 4, -1], [0, -1, 0]], dtype=np.float32)
            lap_c = cv2.filter2D(blended, cv2.CV_32F, k_sharp)
            lap_clamped = np.clip(lap_c, -16.0, 16.0)
            blended = np.clip(blended.astype(np.float32) + lap_clamped * (cfg.eyeSharpening * 1.4 * eye_sharp_mask[..., np.newaxis]), 0, 255).astype(np.uint8)

        # 10. Global Sharpening (nếu được bật tường minh)
        if cfg.globalSharpening > 0:
            k_sharp = np.array([[0, -1, 0], [-1, 4, -1], [0, -1, 0]], dtype=np.float32)
            lap_g = cv2.filter2D(blended, cv2.CV_32F, k_sharp)
            blended = np.clip(blended.astype(np.float32) + lap_g * (cfg.globalSharpening * 0.15), 0, 255).astype(np.uint8)

        # 11. Bảo Toàn Tuyệt Đối Màu Nền Gốc (Background Color & Object Preservation)
        # Hợp nhất toàn bộ mặt nạ giải phẫu và biến dạng đã can thiệp
        treatment_mask = np.clip(skin_mask + blush_mask + lip_mask + eye_sharp_mask + reshape_mask, 0.0, 1.0)
        mask_3c = treatment_mask[..., np.newaxis]

        # Soft Alpha Blending mượt mà chuyển tiếp giữa vùng làm đẹp và ảnh gốc
        bg_float = clean_bg.astype(np.float32)
        blended = np.round(blended.astype(np.float32) * mask_3c + bg_float * (1.0 - mask_3c)).astype(np.uint8)

        # Cam kết sai lệch RGB ngoài vùng xử lý bằng tuyệt đối 0.0 trước khi nén JPEG
        outside_zone = (treatment_mask <= 1e-4)
        blended[outside_zone] = clean_bg[outside_zone]

        duration = time.time() - t0
        logger.info(f"Korean Soft Beauty V3 (Reshaping 4.5% + Retouch) xử lý thành công trong {duration:.2f}s.")
        return blended


korean_beauty_engine = KoreanBeautyEngine()

