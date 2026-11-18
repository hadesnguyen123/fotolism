"""
Pipeline xử lý AI Enhance độc lập cho AI Enhance Tuner.
Tái tạo chính xác luồng xử lý của `desktop/ai-service/api/routes/enhance.py` để tinh chỉnh
thông số trực quan trước khi áp dụng ngược lại vào `ai-service`.
Phụ thuộc: cv2, numpy, pydantic, core.korean_beauty_engine, core.lut_manager, core.white_balance.
"""
import time
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple

import cv2
import numpy as np
from pydantic import BaseModel, Field

from core.korean_beauty_engine import korean_beauty_engine, KoreanBeautyConfig
from core.lut_manager import LUTManager
from core.white_balance import balance_from_reference

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
MODEL_PATH = DATA_DIR / "face_detection_yunet_2023mar.onnx"
lut_manager = LUTManager(data_dir=DATA_DIR)


class TuneEnhanceParams(BaseModel):
    """Bộ tham số đầy đủ tương thích 1:1 với EnhanceRequest & KoreanBeautyConfig của ai-service."""
    beautyLevel: int = Field(50, ge=0, le=100)
    skinEvening: float = Field(0.55, ge=0.0, le=1.0)
    blemishRemoval: float = Field(0.55, ge=0.0, le=2.0)
    darkCirclesReduction: float = Field(0.40, ge=0.0, le=1.0)
    clarityGlow: float = Field(-10.0, ge=-100.0, le=100.0)
    rosyGlow: float = Field(0.00, ge=0.0, le=1.0)
    sharpen: bool = Field(False)

    whiteBalanceStrength: float = Field(0.0, ge=0.0, le=1.0)
    neutralReferenceRgb: Optional[List[float]] = Field(None, min_length=3, max_length=3)

    styleId: str = Field("natural")
    presetId: str = Field("white_pink_v2")
    cropAspect: Optional[str] = Field(None)

    koreanConfig: KoreanBeautyConfig = Field(default_factory=KoreanBeautyConfig.white_pink_v2)
    previewMaxWidth: int = Field(1600, ge=0, le=8000, description="0 = xử lý đúng độ phân giải gốc")


def detect_faces_yunet(img_bgr: np.ndarray, model_path: Path = MODEL_PATH) -> List[Dict[str, Any]]:
    """Định vị khuôn mặt và 5 mốc landmark bằng YuNet giống pipeline sản xuất."""
    if not model_path.is_file():
        return []

    h, w, _ = img_bgr.shape
    det_w, det_h = 960, 720
    small = cv2.resize(img_bgr, (det_w, det_h))
    detector = cv2.FaceDetectorYN_create(str(model_path), "", (det_w, det_h), score_threshold=0.6)
    _, faces = detector.detect(small)

    face_data = []
    if faces is not None:
        scale_x = w / det_w
        scale_y = h / det_h
        for face in faces:
            box = face[0:4] * [scale_x, scale_y, scale_x, scale_y]
            landmarks = face[4:14] * ([scale_x, scale_y] * 5)
            face_data.append({
                "box": box.astype(int),
                "landmarks": landmarks.reshape(5, 2).astype(int),
                "conf": float(face[-1]),
            })
    return face_data


def _build_soft_highlight_mask(gray_img: np.ndarray) -> np.ndarray:
    """Tạo mặt nạ bảo vệ điểm phản quang sáng theo đường cong Hermite mượt."""
    g = gray_img.astype(np.float32)
    t = np.clip((g - 165.0) / 70.0, 0.0, 1.0)
    smooth_mask = t * t * (3.0 - 2.0 * t)
    return cv2.GaussianBlur(smooth_mask, (5, 5), 1.2)[..., np.newaxis]


def _apply_under_eye_correction(
    img_bgr: np.ndarray,
    faces: List[Dict[str, Any]],
    intensity: float = 0.70,
) -> np.ndarray:
    """Hiệu chỉnh quầng thâm mắt cho nhánh Capture One Classic."""
    if intensity <= 0.001 or len(faces) == 0:
        return img_bgr

    h, w, _ = img_bgr.shape
    out = img_bgr.copy().astype(np.float32)
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    gray_sm = cv2.GaussianBlur(gray, (5, 5), 1.2)
    edge_mag = np.abs(cv2.Laplacian(gray_sm, cv2.CV_32F))

    for f in faces:
        _, _, bw, bh = f["box"]
        landmarks = f["landmarks"]
        for eye_pt in [landmarks[0], landmarks[1]]:
            ex, ey = int(eye_pt[0]), int(eye_pt[1])
            rx = max(1, int(bw * 0.22))
            ry = max(1, int(bh * 0.080))
            cen_x = ex
            cen_y = ey + int(bh * 0.100)

            loc_y1 = max(0, ey + int(bh * 0.12))
            loc_y2 = min(h, ey + int(bh * 0.22))
            loc_x1 = max(0, ex - int(bw * 0.10))
            loc_x2 = min(w, ex + int(bw * 0.10))
            loc_patch = gray[loc_y1:loc_y2, loc_x1:loc_x2]
            target_local_lum = float(np.percentile(loc_patch, 50)) if loc_patch.size > 0 else 160.0

            x1 = max(0, cen_x - rx)
            x2 = min(w, cen_x + rx)
            y1 = max(0, ey - int(ry * 0.1))
            y2 = min(h, cen_y + int(ry * 1.5))
            if y2 <= y1 or x2 <= x1:
                continue

            pw, ph = x2 - x1, y2 - y1
            y_grid, x_grid = np.ogrid[:ph, :pw]
            c_x, c_y = cen_x - x1, cen_y - y1

            crescent = ((x_grid - c_x) ** 2 / (rx ** 2) + (y_grid - c_y) ** 2 / (ry ** 2))
            crescent_w = np.clip(1.0 - crescent, 0.0, 1.0) ** 1.1

            safe_margin = ey + int(bh * 0.055) - y1
            trans_h = max(1.0, float(int(bh * 0.035)))
            v_t = np.clip((y_grid - safe_margin) / trans_h, 0.0, 1.0)
            crescent_w *= v_t * v_t * (3.0 - 2.0 * v_t)

            patch_edge = edge_mag[y1:y2, x1:x2]
            crescent_w *= np.exp(-patch_edge / 10.0)
            crescent_w = cv2.GaussianBlur(crescent_w, (7, 7), 2.0)

            deficit = np.maximum(0.0, target_local_lum - gray[y1:y2, x1:x2])
            lift = deficit * crescent_w * (0.45 * intensity)
            out[y1:y2, x1:x2] += lift[..., np.newaxis]

    return np.clip(out, 0, 255).astype(np.uint8)


def _apply_dark_spots_leveling(
    img_bgr: np.ndarray,
    full_skin_mask: np.ndarray,
    edge_prot: Optional[np.ndarray] = None,
    intensity: float = 0.61,
) -> np.ndarray:
    """Làm đều các đốm tối cục bộ trên vùng da cho nhánh Capture One Classic."""
    if intensity <= 0.001:
        return img_bgr

    out = img_bgr.astype(np.float32).copy()
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    local_smooth = cv2.bilateralFilter(gray, 25, 45, 45).astype(np.float32)
    low_f = cv2.GaussianBlur(gray, (5, 5), 2.0).astype(np.float32)

    dark_deficit = np.maximum(0.0, local_smooth - low_f)
    spot_w = np.clip((dark_deficit - 2.5) / 10.0, 0.0, 1.0) * np.clip((45.0 - dark_deficit) / 15.0, 0.0, 1.0)

    mask = full_skin_mask
    if edge_prot is not None:
        mask = mask * (1.0 - edge_prot)

    spot_lift = dark_deficit * (intensity * spot_w) * mask
    out += spot_lift[..., np.newaxis]
    return np.clip(out, 0, 255).astype(np.uint8)


def apply_classic_beauty_engine(
    styled_bgr: np.ndarray,
    beauty_level: int = 50,
    skin_evening: float = 0.55,
    blemish_removal: float = 0.55,
    dark_circles_reduction: float = 0.40,
    clarity_glow: float = -10.0,
    rosy_glow: float = 0.00,
    sharpen: bool = False,
    texture_retention: float = 0.552,
) -> Tuple[np.ndarray, int]:
    """Nhánh Capture One Classic (legacy) khi không dùng KoreanBeautyEngine."""
    if beauty_level <= 0:
        return styled_bgr, 0

    alpha_beauty = beauty_level / 50.0
    h, w, _ = styled_bgr.shape
    faces = detect_faces_yunet(styled_bgr, MODEL_PATH)
    if len(faces) == 0:
        return styled_bgr, 0

    gray_styled = cv2.cvtColor(styled_bgr, cv2.COLOR_BGR2GRAY)
    high_mask = _build_soft_highlight_mask(gray_styled)

    gx = cv2.Sobel(gray_styled, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray_styled, cv2.CV_32F, 0, 1, ksize=3)
    sobel_mag = cv2.magnitude(gx, gy)
    wire_raw = np.clip((sobel_mag - 22.0) / 15.0, 0.0, 1.0)
    wire_dilated = cv2.dilate(wire_raw, np.ones((3, 3), np.uint8))
    wire_prot = cv2.GaussianBlur(wire_dilated, (3, 3), 0.8)
    wire_3c = wire_prot[..., np.newaxis]

    low_freq = cv2.GaussianBlur(styled_bgr, (5, 5), 2.0)
    high_freq = styled_bgr.astype(np.float32) - low_freq.astype(np.float32)
    smooth_surface = cv2.GaussianBlur(styled_bgr, (21, 21), 7.0)
    mid_freq = low_freq.astype(np.float32) - smooth_surface.astype(np.float32)

    evening_factor = np.clip(skin_evening * alpha_beauty, 0.0, 0.95)
    mid_evening = mid_freq * (1.0 - evening_factor)

    blemish_factor = np.clip(blemish_removal * alpha_beauty, 0.0, 1.0)
    tau = 16.0 / (1.0 + 2.0 * blemish_factor)
    mid_blemish = np.tanh(mid_evening / tau) * tau

    clarity_val = np.clip(clarity_glow * alpha_beauty, -80.0, 80.0)
    clarity_mod = np.clip(clarity_val / 300.0, -0.30, 0.30)
    mid_final = mid_blemish * (1.0 + clarity_mod)

    eff_tex = np.clip(texture_retention + (1.0 - alpha_beauty) * 0.15, 0.35, 0.85)
    retouched_face = smooth_surface.astype(np.float32) + mid_final + high_freq * eff_tex
    retouched_face = retouched_face * (1.0 - high_mask) + styled_bgr.astype(np.float32) * high_mask
    retouched_face = retouched_face * (1.0 - wire_3c) + styled_bgr.astype(np.float32) * wire_3c
    retouched_face = np.clip(retouched_face, 0, 255)

    full_skin_mask = np.zeros((h, w), dtype=np.float32)
    ycrcb = cv2.cvtColor(styled_bgr, cv2.COLOR_BGR2YCrCb)

    for f in faces:
        bx, by, bw, bh = f["box"]
        pad_x, pad_y = int(bw * 0.18), int(bh * 0.18)
        x1, y1 = max(0, bx - pad_x), max(0, by - pad_y)
        x2, y2 = min(w, bx + bw + pad_x), min(h, by + bh + pad_y)

        face_roi = np.zeros((y2 - y1, x2 - x1), dtype=np.uint8)
        center = (int((bx + bw / 2) - x1), int((by + bh * 0.52) - y1))
        axes = (max(1, int(bw * 0.48)), max(1, int(bh * 0.53)))
        cv2.ellipse(face_roi, center, axes, 0, 0, 360, 255, -1)

        roi_ycrcb = ycrcb[y1:y2, x1:x2]
        is_skin = (roi_ycrcb[..., 0] >= 75) & (roi_ycrcb[..., 1] >= 130) & (roi_ycrcb[..., 2] >= 95)
        face_roi = cv2.bitwise_and(face_roi, face_roi, mask=is_skin.astype(np.uint8) * 255)

        r_eye, l_eye, _, m_r, m_l = f["landmarks"]
        for eye_pt in [r_eye, l_eye]:
            ex, ey = eye_pt[0] - x1, eye_pt[1] - y1
            cv2.ellipse(face_roi, (ex, ey), (max(1, int(bw * 0.085)), max(1, int(bh * 0.042))), 0, 0, 360, 0, -1)

        mouth_center = ((m_r + m_l) / 2).astype(int)
        mx, my = mouth_center[0] - x1, mouth_center[1] - y1
        cv2.ellipse(face_roi, (mx, my), (max(1, int(bw * 0.16)), max(1, int(bh * 0.08))), 0, 0, 360, 0, -1)

        feathered = cv2.GaussianBlur(face_roi.astype(np.float32) / 255.0, (41, 41), 15.0)
        full_skin_mask[y1:y2, x1:x2] = np.maximum(full_skin_mask[y1:y2, x1:x2], feathered)

    mask_3c = full_skin_mask[..., np.newaxis]
    blended = np.clip(retouched_face * mask_3c + styled_bgr.astype(np.float32) * (1.0 - mask_3c), 0, 255).astype(np.uint8)
    blended = _apply_under_eye_correction(blended, faces, intensity=dark_circles_reduction * alpha_beauty)
    blended = _apply_dark_spots_leveling(blended, full_skin_mask, edge_prot=wire_prot, intensity=blemish_removal * alpha_beauty)

    if rosy_glow > 0.001:
        lab = cv2.cvtColor(blended, cv2.COLOR_BGR2LAB).astype(np.float32)
        L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
        midtone_w = np.clip(1.0 - np.abs(L - 140.0) / 40.0, 0.0, 1.0) * full_skin_mask * (1.0 - high_mask[..., 0])
        rg_intensity = rosy_glow * alpha_beauty
        L += midtone_w * (1.2 * rg_intensity)
        A += midtone_w * (1.0 * rg_intensity)
        lab_g = cv2.merge([np.clip(L, 0, 255), np.clip(A, 0, 255), np.clip(B, 0, 255)])
        blended = cv2.cvtColor(lab_g.astype(np.uint8), cv2.COLOR_LAB2BGR)

    if sharpen:
        k_sharp = np.array([[0, -1, 0], [-1, 4, -1], [0, -1, 0]], dtype=np.float32)
        lap = cv2.filter2D(blended, cv2.CV_32F, k_sharp)
        gray = cv2.cvtColor(blended, cv2.COLOR_BGR2GRAY)
        edge_mag_full = np.abs(cv2.Laplacian(gray, cv2.CV_32F))
        sharp_mask = np.clip((edge_mag_full - 12.0) / 25.0, 0.0, 1.0)[..., np.newaxis]
        lap_clamped = np.clip(lap, -20.0, 20.0)
        blended = np.clip(blended.astype(np.float32) + lap_clamped * (0.18 * sharp_mask), 0, 255).astype(np.uint8)

    return blended, len(faces)


def crop_center_aspect(img_bgr: np.ndarray, aspect_str: str) -> np.ndarray:
    """Cắt khung tâm ảnh theo tỉ lệ aspect_str (VD: '3:4') mà không làm biến dạng ảnh."""
    parts = [p.strip() for p in aspect_str.split(":")]
    if len(parts) != 2:
        return img_bgr
    try:
        aspect_w = float(parts[0])
        aspect_h = float(parts[1])
    except ValueError:
        return img_bgr
    if aspect_w <= 0 or aspect_h <= 0:
        return img_bgr

    h, w = img_bgr.shape[:2]
    target_ratio = aspect_w / aspect_h
    current_ratio = w / float(h)
    if abs(current_ratio - target_ratio) < 1e-3:
        return img_bgr

    if current_ratio > target_ratio:
        new_w = max(1, int(round(h * target_ratio)))
        x0 = max(0, (w - new_w) // 2)
        return np.ascontiguousarray(img_bgr[:, x0:x0 + new_w])
    new_h = max(1, int(round(w / target_ratio)))
    y0 = max(0, (h - new_h) // 2)
    return np.ascontiguousarray(img_bgr[y0:y0 + new_h, :])


def resize_for_preview(img_bgr: np.ndarray, max_side: int) -> np.ndarray:
    """Thu nhỏ ảnh theo cạnh dài nhất khi ở chế độ preview nhanh để tăng tốc vòng lặp thử thông số."""
    if max_side <= 0:
        return img_bgr
    h, w = img_bgr.shape[:2]
    longest = max(h, w)
    if longest <= max_side:
        return img_bgr
    scale = max_side / float(longest)
    return cv2.resize(img_bgr, (max(1, int(round(w * scale))), max(1, int(round(h * scale)))), interpolation=cv2.INTER_AREA)


def run_enhance_pipeline(img_bgr: np.ndarray, params: TuneEnhanceParams) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    Chạy toàn bộ quy trình AI Enhance với cấu hình truyền vào và trả về ảnh + thống kê.
    Giữ nguyên quy tắc scale theo beautyLevel của `desktop/ai-service/api/routes/enhance.py`
    để thông số thử nghiệm khớp 1:1 khi áp dụng lại vào hệ thống chính.
    """
    started = time.time()
    work_img = resize_for_preview(img_bgr, params.previewMaxWidth)

    if params.cropAspect and params.cropAspect.lower() != "none":
        work_img = crop_center_aspect(work_img, params.cropAspect)

    if params.whiteBalanceStrength > 0:
        if params.neutralReferenceRgb is None:
            raise ValueError("Cần chọn hoặc nhập Neutral Reference RGB khi bật White Balance")
        work_img = balance_from_reference(work_img, params.neutralReferenceRgb, params.whiteBalanceStrength)

    styled_img = lut_manager.apply_style(work_img, params.styleId)
    active_preset = params.presetId or "white_pink_v2"
    korean_beauty_engine.last_timings = {}
    face_count = 0

    if params.beautyLevel > 0:
        if active_preset in ("korean_soft_beauty", "white_pink", "white_pink_v2"):
            k_cfg = params.koreanConfig.model_copy(deep=True)
            k_cfg.presetId = active_preset
            if params.beautyLevel != 50:
                scale = params.beautyLevel / 50.0
                k_cfg.skinSmoothing = float(np.clip(k_cfg.skinSmoothing * scale, 0.0, 1.0))
                k_cfg.blemishRemoval = float(np.clip(k_cfg.blemishRemoval * scale, 0.0, 2.0))
                k_cfg.skinEvening = float(np.clip(k_cfg.skinEvening * scale, 0.0, 1.0))
                k_cfg.skinBrightening = float(np.clip(k_cfg.skinBrightening * scale, 0.0, 1.0))
                k_cfg.softGlow = float(np.clip(k_cfg.softGlow * scale, 0.0, 1.0))
                k_cfg.rosyBlush = float(np.clip(k_cfg.rosyBlush * scale, 0.0, 1.0))
                k_cfg.eyeSharpening = float(np.clip(k_cfg.eyeSharpening * scale, 0.0, 1.0))
                k_cfg.slimFace = float(np.clip(k_cfg.slimFace * scale, 0.0, 0.20))
                k_cfg.bigEyes = float(np.clip(k_cfg.bigEyes * scale, 0.0, 0.20))
                k_cfg.slimNose = float(np.clip(k_cfg.slimNose * scale, 0.0, 0.20))
                k_cfg.skinPlump = float(np.clip(k_cfg.skinPlump * scale, 0.0, 3.0))
            final_img = korean_beauty_engine.process_image(styled_img, k_cfg, original_img=work_img)
            face_count = len(korean_beauty_engine.detect_faces(work_img))
        else:
            final_img, face_count = apply_classic_beauty_engine(
                styled_img,
                beauty_level=params.beautyLevel,
                skin_evening=params.skinEvening,
                blemish_removal=params.blemishRemoval,
                dark_circles_reduction=params.darkCirclesReduction,
                clarity_glow=params.clarityGlow,
                rosy_glow=params.rosyGlow,
                sharpen=params.sharpen,
            )
    else:
        final_img = styled_img
        face_count = len(korean_beauty_engine.detect_faces(work_img))

    final_img = lut_manager.apply_post_filter(final_img, params.styleId)
    duration_ms = int((time.time() - started) * 1000)

    metadata = {
        "processingTimeMs": duration_ms,
        "faceCount": face_count,
        "width": int(final_img.shape[1]),
        "height": int(final_img.shape[0]),
        "spotStats": {
            "redSpots": int(korean_beauty_engine.last_timings.get("red_spots", 0)),
            "darkSpots": int(korean_beauty_engine.last_timings.get("dark_spots", 0)),
            "spotCorrectionMs": round(float(korean_beauty_engine.last_timings.get("spot_correction_ms", 0.0)), 1),
        },
    }
    return final_img, metadata
