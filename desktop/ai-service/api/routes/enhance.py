"""
Fotolism AI Beauty Engine — Capture One Precision Pipeline
Phiên bản tối ưu hóa chuẩn xác theo Capture One Reference:
1. Tách biệt Style Engine & Beauty Engine.
2. Under-Eye Correction độc lập:
   - Dùng Vertical Gate cubic Hermite triệt tiêu 100% trọng số tại mí mắt, chân mi và tròng mắt.
   - Dùng Edge Suppression bảo vệ gọng kính kim loại, không làm sáng khung kính.
   - Bù sáng thích nghi chỉ nâng sáng độ hụt (deficit) so với gò má, điều khiển trực tiếp bởi `darkCirclesReduction`.
3. Soft Specular Highlight Protection:
   - Hàm smoothstep $C^1$-smooth bảo toàn trọn vẹn điểm phản quang đèn flash trên trán, mũi, gò má.
4. Frequency Separation cân bằng:
   - Bảo toàn vân da vi mô (Texture Retention) theo benchmark C1, không làm bẹt da.
5. Sharpening có kiểm soát:
   - Mặc định False để bảo toàn độ nét nguyên bản C1, có edge-clamping chống halo/ringing khi bật.
6. LUT Cache & Error Handling an toàn.
"""
import logging
import time
import traceback
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import cv2
import numpy as np

from core.config import STORAGE
from core.lut_manager import lut_manager
from core.white_balance import balance_from_reference
from core.korean_beauty_engine import korean_beauty_engine, KoreanBeautyConfig

logger = logging.getLogger("ai_service.enhance")
router = APIRouter()

MODEL_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "face_detection_yunet_2023mar.onnx"

class EnhanceRequest(BaseModel):
    imagePath: str
    outputPath: Optional[str] = Field(None, description="Đường dẫn file đầu ra tùy chọn (VD: F:/Fotolism_image/sessions/.../final/...)")
    whiteBalanceStrength: float = Field(0.0, ge=0.0, le=1.0)
    neutralReferenceRgb: Optional[List[float]] = Field(None, min_length=3, max_length=3)
    beautyLevel: int = Field(50, ge=0, le=100, description="Cường độ Beauty tổng thể (0 = tắt beauty, chỉ áp dụng style)")
    skinEvening: float = Field(0.55, ge=0.0, le=1.0, description="Mức làm đều màu da (0.0 đến 1.0)")
    blemishRemoval: float = Field(0.55, ge=0.0, le=1.0, description="Mức giảm khuyết điểm (0.0 đến 1.0)")
    darkCirclesReduction: float = Field(0.40, ge=0.0, le=1.0, description="Mức giảm quầng thâm mắt (0.0 đến 1.0)")
    clarityGlow: float = Field(-10.0, ge=-100.0, le=100.0, description="Độ mềm / độ trong bề mặt")
    rosyGlow: float = Field(0.00, ge=0.0, le=1.0, description="Sắc hồng tự nhiên trên midtone (0.0 đến 1.0)")
    sharpen: bool = Field(False, description="Bật/tắt sharpening bổ sung (mặc định False theo C1)")
    styleId: str = Field("natural", description="Mã Style LUT")
    presetId: Optional[str] = Field("white_pink_v2", description="Preset làm đẹp: 'white_pink_v2', 'white_pink' hoặc 'korean_soft_beauty'")
    koreanConfig: Optional[KoreanBeautyConfig] = Field(None, description="Cấu hình tùy biến chuyên sâu cho Korean Soft Beauty")

class EnhanceResponseData(BaseModel):
    enhancedPath: str
    status: str  # "processed" | "fallback" | "failed"
    beautyLevel: int
    styleId: str
    presetId: Optional[str] = None
    processingTimeMs: int
    message: Optional[str] = None

class EnhanceResponse(BaseModel):
    success: bool
    data: EnhanceResponseData

def detect_faces_yunet(img_bgr: np.ndarray, model_path: Path) -> List[Dict[str, Any]]:
    """Định vị khuôn mặt và 5 điểm mốc Landmark giải phẫu bằng YuNet Deep Learning."""
    if not model_path.is_file():
        logger.warning(f"Không tìm thấy model YuNet tại: {model_path}")
        return []

    h, w, _ = img_bgr.shape
    det_w, det_h = 960, 720
    small = cv2.resize(img_bgr, (det_w, det_h))
    detector = cv2.FaceDetectorYN_create(str(model_path), '', (det_w, det_h), score_threshold=0.6)
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
                "conf": float(face[-1])
            })
    return face_data

def build_soft_highlight_mask(gray_img: np.ndarray) -> np.ndarray:
    """
    Tạo mặt nạ bảo vệ điểm sáng phản quang (Specular Catchlights) $C^1$-smooth:
    - L < 165: weight = 0.0 (xử lý da bình thường).
    - 165 <= L <= 235: chuyển tiếp mượt mà cubic Hermite (không ranh giới).
    - L > 235: weight = 1.0 (bảo toàn 100% ánh sáng khối gốc).
    """
    g = gray_img.astype(np.float32)
    t = np.clip((g - 165.0) / 70.0, 0.0, 1.0)
    smooth_mask = t * t * (3.0 - 2.0 * t)
    return cv2.GaussianBlur(smooth_mask, (5, 5), 1.2)[..., np.newaxis]

def neutralize_red_cast(img_bgr: np.ndarray) -> np.ndarray:
    """Khử ám đỏ chọn lọc trên tóc, dải tối và tinh chỉnh sắc da trong trẻo thanh khiết."""
    ycrcb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2YCrCb).astype(np.float32)
    Y, Cr, Cb = ycrcb[..., 0], ycrcb[..., 1], ycrcb[..., 2]

    # Nhận diện tóc và bóng tối trung tính (Y <= 145 và Cr - Cb <= 31)
    dark_weight = np.clip((145.0 - Y) / 50.0, 0.0, 1.0)
    chroma_weight = np.clip((31.0 - (Cr - Cb)) / 8.0, 0.0, 1.0)
    shadow_neutral_w = dark_weight * chroma_weight

    b = img_bgr[..., 0].astype(np.float32)
    g = img_bgr[..., 1].astype(np.float32)
    r = img_bgr[..., 2].astype(np.float32)

    mean_gb = (g + b) / 2.0
    excess_r = np.maximum(0.0, r - mean_gb)

    # Khử đỏ trên tóc và dải tối: giảm Red, bù nhẹ Blue
    r_dered = r - excess_r * (0.95 * shadow_neutral_w)
    b_dered = b + excess_r * (0.25 * shadow_neutral_w)

    # Tinh chỉnh dải midtone da: làm dịu sắc đỏ để da trắng sáng hồng hào, không ửng đỏ cháy nắng
    midtone_skin = np.clip(1.0 - np.abs(Y - 165.0) / 45.0, 0.0, 1.0) * (Cr > 135.0).astype(np.float32)
    r_dered = r_dered - (1.6 * midtone_skin)

    return np.dstack([np.clip(b_dered, 0, 255), g, np.clip(r_dered, 0, 255)]).astype(np.uint8)

def apply_under_eye_correction(
    img_bgr: np.ndarray,
    faces: List[Dict[str, Any]],
    intensity: float = 0.70
) -> np.ndarray:
    """
    Hiệu chỉnh quầng thâm bọng mắt ĐỘC LẬP:
    - Đặt tâm elip chính xác tại rãnh lệ / đáy quầng thâm (ey + 0.10*bh).
    - Dùng Vertical Gate Hermite triệt tiêu 100% trọng số tại mí mắt, chân mi và tròng mắt.
    - Dùng Edge Suppression bảo vệ gọng kính kim loại và nếp mí.
    - Lấy mẫu độ sáng chuẩn từ vùng gò má hạ ổ mắt cục bộ (Local Infraorbital Cheek) ngay dưới mắt,
      bảo toàn trọn vẹn bóng đổ tự nhiên và cấu trúc ánh sáng khối 3D.
    """
    if intensity <= 0.001 or len(faces) == 0:
        return img_bgr

    h, w, _ = img_bgr.shape
    out = img_bgr.copy().astype(np.float32)
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    gray_sm = cv2.GaussianBlur(gray, (5, 5), 1.2)
    edge_mag = np.abs(cv2.Laplacian(gray_sm, cv2.CV_32F))

    for f in faces:
        bx, by, bw, bh = f["box"]
        landmarks = f["landmarks"]
        r_eye, l_eye = landmarks[0], landmarks[1]

        for eye_pt in [r_eye, l_eye]:
            ex, ey = int(eye_pt[0]), int(eye_pt[1])
            rx = int(bw * 0.22)
            ry = int(bh * 0.080)

            cen_x = ex
            cen_y = ey + int(bh * 0.100)

            # Lấy mẫu độ sáng chuẩn cục bộ ngay dưới mắt này (Local Infraorbital Reference)
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

            pw = x2 - x1
            ph = y2 - y1

            y_grid, x_grid = np.ogrid[:ph, :pw]
            c_x = cen_x - x1
            c_y = cen_y - y1

            crescent = ((x_grid - c_x)**2 / (rx**2) + (y_grid - c_y)**2 / (ry**2))
            crescent_w = np.clip(1.0 - crescent, 0.0, 1.0)**1.1

            safe_margin = ey + int(bh * 0.055) - y1
            trans_h = max(1.0, float(int(bh * 0.035)))
            v_t = np.clip((y_grid - safe_margin) / trans_h, 0.0, 1.0)
            vert_gate = v_t * v_t * (3.0 - 2.0 * v_t)
            crescent_w *= vert_gate

            patch_edge = edge_mag[y1:y2, x1:x2]
            crescent_w *= np.exp(-patch_edge / 10.0)
            crescent_w = cv2.GaussianBlur(crescent_w, (7, 7), 2.0)

            patch_lum = gray[y1:y2, x1:x2]
            deficit = np.maximum(0.0, target_local_lum - patch_lum)

            lift = deficit * crescent_w * (0.45 * intensity)
            out[y1:y2, x1:x2] += lift[..., np.newaxis]

    return np.clip(out, 0, 255).astype(np.uint8)

def apply_dark_spots_leveling(
    img_bgr: np.ndarray,
    full_skin_mask: np.ndarray,
    edge_prot: Optional[np.ndarray] = None,
    intensity: float = 0.61
) -> np.ndarray:
    """Xóa điểm tối, đốm thâm và rãnh nhăn cục bộ trên da mặt với baseline low_freq mượt mà chống nhiễu hạt sensor."""
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

def apply_beauty_engine(
    styled_bgr: np.ndarray,
    model_path: Path,
    beauty_level: int = 50,
    skin_evening: float = 0.83,
    blemish_removal: float = 0.61,
    dark_circles_reduction: float = 0.70,
    clarity_glow: float = -48.0,
    rosy_glow: float = 0.00,
    sharpen: bool = False,
    texture_retention: float = 0.552
) -> np.ndarray:
    """
    Beauty Engine độc lập chuẩn Capture One:
    - Chỉ can thiệp lên vùng da mặt; giữ nguyên 100% phông nền, quần áo và tóc.
    - Bảo toàn ánh sáng khối 3D studio và vân da tự nhiên tiệm cận Capture One.
    """
    if beauty_level <= 0:
        return styled_bgr

    alpha_beauty = beauty_level / 50.0
    h, w, _ = styled_bgr.shape

    # 1. Nhận diện khuôn mặt
    faces = detect_faces_yunet(styled_bgr, model_path)
    if len(faces) == 0:
        return styled_bgr

    # 2. Xây dựng Soft Highlight Mask bảo vệ ánh sáng 3D
    gray_styled = cv2.cvtColor(styled_bgr, cv2.COLOR_BGR2GRAY)
    high_mask = build_soft_highlight_mask(gray_styled)

    # 3. Phát hiện chi tiết cạnh tương phản cao (Sobel Edge Protection)
    # Bảo vệ tuyệt đối gọng kính kim loại, lông mi, viền mắt, cánh mũi
    gx = cv2.Sobel(gray_styled, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray_styled, cv2.CV_32F, 0, 1, ksize=3)
    sobel_mag = cv2.magnitude(gx, gy)
    wire_raw = np.clip((sobel_mag - 22.0) / 15.0, 0.0, 1.0)
    wire_dilated = cv2.dilate(wire_raw, np.ones((3, 3), np.uint8))
    wire_prot = cv2.GaussianBlur(wire_dilated, (3, 3), 0.8)
    wire_3c = wire_prot[..., np.newaxis]

    # 4. Frequency Separation tối ưu theo chuẩn Capture One
    low_freq = cv2.GaussianBlur(styled_bgr, (5, 5), 2.0)
    high_freq = styled_bgr.astype(np.float32) - low_freq.astype(np.float32)

    smooth_surface = cv2.GaussianBlur(styled_bgr, (21, 21), 7.0)
    mid_freq = low_freq.astype(np.float32) - smooth_surface.astype(np.float32)

    # Làm đều màu da (Skin Evening) & Giảm khuyết điểm (Blemish Removal)
    evening_factor = np.clip(skin_evening * alpha_beauty, 0.0, 0.95)
    mid_evening = mid_freq * (1.0 - evening_factor)

    blemish_factor = np.clip(blemish_removal * alpha_beauty, 0.0, 1.0)
    tau = 16.0 / (1.0 + 2.0 * blemish_factor)
    mid_blemish = np.tanh(mid_evening / tau) * tau

    # Điều chỉnh Clarity / Soft Glow
    clarity_val = np.clip(clarity_glow * alpha_beauty, -80.0, 80.0)
    clarity_mod = np.clip(clarity_val / 300.0, -0.30, 0.30)
    mid_final = mid_blemish * (1.0 + clarity_mod)

    # Tái hòa nhập vân da thật vi mô
    eff_tex = np.clip(texture_retention + (1.0 - alpha_beauty) * 0.15, 0.35, 0.85)

    retouched_face = smooth_surface.astype(np.float32) + mid_final + high_freq * eff_tex

    # Bảo vệ điểm sáng phản quang (Specular Catchlights)
    retouched_face = retouched_face * (1.0 - high_mask) + styled_bgr.astype(np.float32) * high_mask

    # Bảo vệ chi tiết gọng kính và lông mi khỏi làm mịn
    retouched_face = retouched_face * (1.0 - wire_3c) + styled_bgr.astype(np.float32) * wire_3c
    retouched_face = np.clip(retouched_face, 0, 255)

    # 5. Tạo Soft Skin Mask có chọn lọc
    full_skin_mask = np.zeros((h, w), dtype=np.float32)
    ycrcb = cv2.cvtColor(styled_bgr, cv2.COLOR_BGR2YCrCb)

    for f in faces:
        bx, by, bw, bh = f["box"]
        pad_x = int(bw * 0.18)
        pad_y = int(bh * 0.18)
        x1 = max(0, bx - pad_x)
        y1 = max(0, by - pad_y)
        x2 = min(w, bx + bw + pad_x)
        y2 = min(h, by + bh + pad_y)

        face_roi = np.zeros((y2 - y1, x2 - x1), dtype=np.uint8)
        center = (int((bx + bw/2) - x1), int((by + bh * 0.52) - y1))
        axes = (int(bw * 0.48), int(bh * 0.53))
        cv2.ellipse(face_roi, center, axes, 0, 0, 360, 255, -1)

        roi_ycrcb = ycrcb[y1:y2, x1:x2]
        is_skin = (roi_ycrcb[..., 0] >= 75) & (roi_ycrcb[..., 1] >= 130) & (roi_ycrcb[..., 2] >= 95)
        face_roi = cv2.bitwise_and(face_roi, face_roi, mask=is_skin.astype(np.uint8)*255)

        landmarks = f["landmarks"]
        r_eye, l_eye, nose, m_r, m_l = landmarks

        # Loại trừ nhãn cầu mắt chính xác theo hình elip giải phẫu
        for eye_pt in [r_eye, l_eye]:
            ex, ey = eye_pt[0] - x1, eye_pt[1] - y1
            cv2.ellipse(face_roi, (ex, ey), (int(bw * 0.085), int(bh * 0.042)), 0, 0, 360, 0, -1)

        # Loại trừ môi
        mouth_center = ((m_r + m_l) / 2).astype(int)
        mx, my = mouth_center[0] - x1, mouth_center[1] - y1
        cv2.ellipse(face_roi, (mx, my), (int(bw * 0.16), int(bh * 0.08)), 0, 0, 360, 0, -1)

        feathered = cv2.GaussianBlur(face_roi.astype(np.float32) / 255.0, (41, 41), 15.0)
        full_skin_mask[y1:y2, x1:x2] = np.maximum(full_skin_mask[y1:y2, x1:x2], feathered)

    # 6. Hòa trộn vùng da mịn vào ảnh nền (Bảo toàn 100% phông nền và quần áo)
    mask_3c = full_skin_mask[..., np.newaxis]
    blended = retouched_face * mask_3c + styled_bgr.astype(np.float32) * (1.0 - mask_3c)
    blended = np.clip(blended, 0, 255).astype(np.uint8)

    # 7. Hiệu chỉnh quầng thâm bọng mắt ĐỘC LẬP
    blended = apply_under_eye_correction(
        blended,
        faces,
        intensity=dark_circles_reduction * alpha_beauty
    )

    # 8. Xóa điểm tối, đốm thâm và rãnh nhăn cục bộ trên da mặt
    blended = apply_dark_spots_leveling(
        blended,
        full_skin_mask,
        edge_prot=wire_prot,
        intensity=blemish_removal * alpha_beauty
    )

    # 9. Tô điểm trắng hồng trên dải Midtones (nếu bật)
    if rosy_glow > 0.001:
        lab = cv2.cvtColor(blended, cv2.COLOR_BGR2LAB).astype(np.float32)
        L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
        midtone_w = np.clip(1.0 - np.abs(L - 140.0) / 40.0, 0.0, 1.0) * full_skin_mask * (1.0 - high_mask[..., 0])
        rg_intensity = rosy_glow * alpha_beauty
        L += midtone_w * (1.2 * rg_intensity)
        A += midtone_w * (1.0 * rg_intensity)
        lab_g = cv2.merge([np.clip(L, 0, 255), np.clip(A, 0, 255), np.clip(B, 0, 255)])
        blended = cv2.cvtColor(lab_g.astype(np.uint8), cv2.COLOR_LAB2BGR)

    # 10. Sharpening có kiểm soát (Mặc định tắt False để tiệm cận C1)
    if sharpen:
        k_sharp = np.array([[0, -1, 0], [-1, 4, -1], [0, -1, 0]], dtype=np.float32)
        lap = cv2.filter2D(blended, cv2.CV_32F, k_sharp)
        gray = cv2.cvtColor(blended, cv2.COLOR_BGR2GRAY)
        edge_mag_full = np.abs(cv2.Laplacian(gray, cv2.CV_32F))
        sharp_mask = np.clip((edge_mag_full - 12.0) / 25.0, 0.0, 1.0)[..., np.newaxis]
        lap_clamped = np.clip(lap, -20.0, 20.0)
        blended = np.clip(blended.astype(np.float32) + lap_clamped * (0.18 * sharp_mask), 0, 255).astype(np.uint8)

    return blended

@router.post("", response_model=EnhanceResponse)
def enhance_image(req: EnhanceRequest):
    start_time = time.time()
    input_path = Path(req.imagePath).resolve()

    if not input_path.is_file():
        logger.error(f"File ảnh đầu vào không tồn tại: {input_path}")
        raise HTTPException(status_code=404, detail=f"Image not found: {req.imagePath}")

    if req.outputPath:
        out_path = Path(req.outputPath).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
    else:
        out_filename = f"enhanced_{int(start_time * 1000)}.jpg"
        out_path = STORAGE["enhanced"] / out_filename

    try:
        img = cv2.imread(str(input_path))
        if img is None:
            raise ValueError(f"Không thể đọc file ảnh qua OpenCV: {input_path}")

        # Calibrated correction precedes LUT/beauty; never estimate neutrality from a coloured background.
        if req.whiteBalanceStrength > 0 and req.neutralReferenceRgb is None:
            raise ValueError('White balance requires a measured neutral reference')
        img = balance_from_reference(img, req.neutralReferenceRgb, req.whiteBalanceStrength)

        # V2 YuNet is the active production preset; callers can still opt into V1.
        active_preset = req.presetId or "white_pink_v2"
        if req.styleId == "korean_soft_beauty" and active_preset != "white_pink_v2":
            active_preset = "korean_soft_beauty"

        # BƯỚC 1: Style Engine — Áp dụng Color Grading từ LUT
        styled_img = lut_manager.apply_style(img, req.styleId)

        # BƯỚC 2: Beauty Engine — Làm đẹp chuyên biệt theo từng preset
        if req.beautyLevel > 0:
            if active_preset in ("korean_soft_beauty", "white_pink", "white_pink_v2"):
                k_cfg = req.koreanConfig.copy() if req.koreanConfig else (
                    KoreanBeautyConfig.white_pink_v2() if active_preset == "white_pink_v2"
                    else KoreanBeautyConfig.white_pink() if active_preset == "white_pink"
                    else KoreanBeautyConfig()
                )
                if req.beautyLevel != 50:
                    scale = req.beautyLevel / 50.0
                    k_cfg.skinSmoothing = float(np.clip(k_cfg.skinSmoothing * scale, 0.0, 1.0))
                    k_cfg.blemishRemoval = float(np.clip(k_cfg.blemishRemoval * scale, 0.0, 1.0))
                    k_cfg.skinEvening = float(np.clip(k_cfg.skinEvening * scale, 0.0, 1.0))
                    k_cfg.skinBrightening = float(np.clip(k_cfg.skinBrightening * scale, 0.0, 1.0))
                    k_cfg.softGlow = float(np.clip(k_cfg.softGlow * scale, 0.0, 1.0))
                    k_cfg.rosyBlush = float(np.clip(k_cfg.rosyBlush * scale, 0.0, 1.0))
                    k_cfg.lipEnhancement = float(np.clip(k_cfg.lipEnhancement * scale, 0.0, 1.0))
                    k_cfg.eyeSharpening = float(np.clip(k_cfg.eyeSharpening * scale, 0.0, 1.0))
                    k_cfg.slimFace = float(np.clip(k_cfg.slimFace * scale, 0.0, 0.20))
                    k_cfg.bigEyes = float(np.clip(k_cfg.bigEyes * scale, 0.0, 0.20))
                    k_cfg.slimNose = float(np.clip(k_cfg.slimNose * scale, 0.0, 0.20))
                final_img = korean_beauty_engine.process_image(styled_img, k_cfg, original_img=img)
            else:
                final_img = apply_beauty_engine(
                    styled_img,
                    MODEL_PATH,
                    beauty_level=req.beautyLevel,
                    skin_evening=req.skinEvening,
                    blemish_removal=req.blemishRemoval,
                    dark_circles_reduction=req.darkCirclesReduction,
                    clarity_glow=req.clarityGlow,
                    rosy_glow=req.rosyGlow,
                    sharpen=req.sharpen
                )
        else:
            final_img = styled_img

        cv2.imwrite(str(out_path), final_img, [cv2.IMWRITE_JPEG_QUALITY, 100])
        duration_ms = int((time.time() - start_time) * 1000)

        return EnhanceResponse(
            success=True,
            data=EnhanceResponseData(
                enhancedPath=str(out_path),
                status="processed",
                beautyLevel=req.beautyLevel,
                styleId=req.styleId,
                presetId=active_preset,
                processingTimeMs=duration_ms,
                message="Xử lý thành công."
            )
        )

    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        err_msg = f"{type(e).__name__}: {str(e)}"
        logger.error(f"[AI Enhance Exception] {err_msg}\n{traceback.format_exc()}")

        try:
            import shutil
            shutil.copy(str(input_path), str(out_path))
            return EnhanceResponse(
                success=False,
                data=EnhanceResponseData(
                    enhancedPath=str(out_path),
                    status="fallback",
                    beautyLevel=req.beautyLevel,
                    styleId=req.styleId,
                    presetId=active_preset if 'active_preset' in locals() else req.presetId,
                    processingTimeMs=duration_ms,
                    message=f"Xảy ra lỗi, đã fallback sang ảnh gốc: {err_msg}"
                )
            )
        except Exception as copy_err:
            raise HTTPException(status_code=500, detail=f"Lỗi xử lý và không thể tạo fallback: {copy_err}")
