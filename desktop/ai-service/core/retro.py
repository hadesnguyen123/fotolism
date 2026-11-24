"""
Fotolism AI Beauty Engine — Bộ lọc Retro (từ Adobe XMP Retro 2 + Chocolates 03)
Áp dụng sau bước AI Beauty Engine theo chuẩn: Original -> AI Beauty -> Retro -> Export.
Giải mã trực tiếp 3D RGB LUT `Chocolates 03` (sRGB 8x8x8) kết hợp Calibration, HSL,
ToneCurvePV2012 `(0,19)-(163,134)-(255,208)`, hiệu ứng Glow 38 (OpenCV uint8) và hạt film tuần hoàn.
Phụ thuộc: cv2, numpy, PIL, pydantic, core.config.
"""
from collections import OrderedDict
import json
import threading
from typing import Any, Dict, Optional, Tuple, Union
import cv2
import numpy as np
from PIL import Image, ImageFilter
from pydantic import BaseModel, Field

from core.config import RESOURCE_DIR

_LUT_GRID_SIZE = 33
_LUT_CACHE_MAX = 24
_lut_cache_lock = threading.Lock()
_lut_cache: "OrderedDict[Tuple[Any, ...], ImageFilter.Color3DLUT]" = OrderedDict()

_DATA_PATH = RESOURCE_DIR / "data" / "retro-chocolates-lut.json"
_CHOCO_LUT_CACHE: Optional[Dict[str, Any]] = None

# Mẫu hạt film tất định 512x512 (mean=0, std=1) tạo một lần để áp nhanh lên ảnh 24MP
_GRAIN_TILE_SIZE = 512
_GRAIN_TILE_F32 = np.random.default_rng(42).normal(0.0, 1.0, size=(_GRAIN_TILE_SIZE, _GRAIN_TILE_SIZE)).astype(np.float32)


class RetroConfig(BaseModel):
    """Cấu hình bộ lọc Retro duy nhất của Fotolism (tham số chuẩn hóa từ Adobe XMP Retro 2)."""
    enabled: bool = Field(True)
    lookAmount: float = Field(0.69, ge=0.0, le=1.5)
    # Basic Tonal
    contrast: float = Field(16.0, ge=-100.0, le=100.0)
    highlights: float = Field(-16.0, ge=-100.0, le=100.0)
    shadows: float = Field(16.0, ge=-100.0, le=100.0)
    whites: float = Field(47.0, ge=-100.0, le=100.0)
    blacks: float = Field(0.0, ge=-100.0, le=100.0)
    texture: float = Field(0.0, ge=-100.0, le=100.0)
    # HSL
    hueRed: float = Field(8.0, ge=-50.0, le=50.0)
    hueOrange: float = Field(1.0, ge=-50.0, le=50.0)
    satRed: float = Field(8.0, ge=-100.0, le=100.0)
    lumRed: float = Field(-16.0, ge=-100.0, le=100.0)
    # Camera Calibration
    calRedHue: float = Field(1.0, ge=-50.0, le=50.0)
    calRedSat: float = Field(3.0, ge=-100.0, le=100.0)
    calGreenHue: float = Field(18.0, ge=-50.0, le=50.0)
    calGreenSat: float = Field(-1.0, ge=-100.0, le=100.0)
    calBlueHue: float = Field(7.0, ge=-50.0, le=50.0)
    calBlueSat: float = Field(9.0, ge=-100.0, le=100.0)
    # Glow & Grain
    glow: float = Field(38.0, ge=0.0, le=100.0)
    glowRange: float = Field(50.0, ge=0.0, le=100.0)
    glowSpread: float = Field(50.0, ge=0.0, le=100.0)
    grain: float = Field(0.0, ge=0.0, le=0.5)


def _srgb_to_linear(x: np.ndarray) -> np.ndarray:
    """Chuyển sRGB [0..1] sang tuyến tính để chỉnh tone và calibration không sai lệch sắc độ."""
    return np.where(x <= 0.04045, x / 12.92, ((np.maximum(x, 0.0) + 0.055) / 1.055) ** 2.4)


def _linear_to_srgb(x: np.ndarray) -> np.ndarray:
    """Chuyển linear [0..1] về lại sRGB [0..1]."""
    x = np.maximum(x, 0.0)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * (x ** (1.0 / 2.4)) - 0.055)


def _rgb_to_hsl_deg(rgb: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Chuyển RGB float32 [0..1] sang HSL (Hue 0..360, Sat 0..1, Lum 0..1) tránh banding 8-bit."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    cmax = np.maximum(np.maximum(r, g), b)
    cmin = np.minimum(np.minimum(r, g), b)
    delta = cmax - cmin
    lum = 0.5 * (cmax + cmin)

    denom = 1.0 - np.abs(2.0 * lum - 1.0)
    sat = np.where(delta > 1e-6, delta / np.maximum(denom, 1e-6), 0.0)
    sat = np.clip(sat, 0.0, 1.0)

    hue = np.zeros_like(delta)
    safe_d = np.where(delta > 1e-6, delta, 1.0)
    m_r = (delta > 1e-6) & (cmax == r)
    m_g = (delta > 1e-6) & (cmax == g) & (~m_r)
    m_b = (delta > 1e-6) & (~m_r) & (~m_g)
    hue = np.where(m_r, ((g - b) / safe_d) % 6.0, hue)
    hue = np.where(m_g, ((b - r) / safe_d) + 2.0, hue)
    hue = np.where(m_b, ((r - g) / safe_d) + 4.0, hue)
    hue = (hue * 60.0) % 360.0
    return hue, sat, lum


def _hsl_deg_to_rgb(h: np.ndarray, s: np.ndarray, l: np.ndarray) -> np.ndarray:
    """Chuyển ngược HSL float32 sang RGB [0..1]."""
    c = (1.0 - np.abs(2.0 * l - 1.0)) * np.clip(s, 0.0, 1.0)
    hp = (h % 360.0) / 60.0
    x = c * (1.0 - np.abs(hp % 2.0 - 1.0))
    z = np.zeros_like(c)
    sec = np.floor(hp).astype(np.int32) % 6
    r = np.select([sec == 0, sec == 1, sec == 2, sec == 3, sec == 4, sec == 5], [c, x, z, z, x, c])
    g = np.select([sec == 0, sec == 1, sec == 2, sec == 3, sec == 4, sec == 5], [x, c, c, x, z, z])
    b = np.select([sec == 0, sec == 1, sec == 2, sec == 3, sec == 4, sec == 5], [z, z, x, c, c, x])
    m = l - 0.5 * c
    return np.clip(np.stack([r + m, g + m, b + m], axis=-1), 0.0, 1.0)


def _band_weight(hue: np.ndarray, center: float, width: float) -> np.ndarray:
    """Tính trọng số smoothstep theo góc Hue tuần hoàn để không tạo vệt gãy chuyển màu."""
    d = np.abs((hue - center + 180.0) % 360.0 - 180.0)
    t = np.clip(1.0 - d / width, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def apply_fast_film_grain_u8(img_u8: np.ndarray, strength_01: float) -> np.ndarray:
    """Áp dụng hạt film tất định tập trung ở midtone bằng lát chunk cố định (hỗ trợ cả Grayscale B&W và BGR)."""
    sigma_u8 = float(np.clip(strength_01, 0.0, 0.25)) * 255.0
    if img_u8 is None or img_u8.size == 0 or sigma_u8 <= 0.05:
        return img_u8

    h, w = img_u8.shape[:2]
    is_3ch = img_u8.ndim == 3
    reps_x = (w + _GRAIN_TILE_SIZE - 1) // _GRAIN_TILE_SIZE
    grain_row_band = np.tile(_GRAIN_TILE_F32, (1, reps_x))[:, :w] * np.float32(sigma_u8)

    res = np.empty_like(img_u8)
    chunk_rows = max(32, min(h, 800_000 // max(1, w)))
    for y0 in range(0, h, chunk_rows):
        y1 = min(h, y0 + chunk_rows)
        y_idx = np.arange(y0, y1) % _GRAIN_TILE_SIZE
        g_tile = grain_row_band[y_idx]
        p_f32 = img_u8[y0:y1].astype(np.float32)
        if is_3ch:
            lum_c = (0.0722 * p_f32[..., 0] + 0.7152 * p_f32[..., 1] + 0.2126 * p_f32[..., 2]) * (1.0 / 255.0)
            mid_w = np.clip(1.0 - np.abs(lum_c - 0.5) * 1.4, 0.25, 1.0)
            p_f32 += (g_tile * mid_w)[..., np.newaxis]
        else:
            lum_c = p_f32 * (1.0 / 255.0)
            mid_w = np.clip(1.0 - np.abs(lum_c - 0.5) * 1.4, 0.25, 1.0)
            p_f32 += g_tile * mid_w
        res[y0:y1] = np.clip(np.rint(p_f32), 0, 255).astype(np.uint8)
    return res


def _load_chocolates_lut() -> Tuple[np.ndarray, float]:
    """Đọc bảng LUT 8x8x8 Chocolates 03 từ file JSON kèm mtime."""
    global _CHOCO_LUT_CACHE
    mtime = _DATA_PATH.stat().st_mtime
    if _CHOCO_LUT_CACHE and _CHOCO_LUT_CACHE["mtime"] == mtime:
        return _CHOCO_LUT_CACHE["grid"], mtime
    payload = json.loads(_DATA_PATH.read_text(encoding="utf-8"))
    grid = np.asarray(payload["table"], dtype=np.float32)
    _CHOCO_LUT_CACHE = {"mtime": mtime, "grid": grid}
    return grid, mtime


def _eval_3d_lut_trilinear(rgb: np.ndarray, grid: np.ndarray) -> np.ndarray:
    """Nội suy trilinear trên lưới 3D LUT sRGB kích thước (D, D, D, 3)."""
    d = grid.shape[0]
    scaled = np.clip(rgb, 0.0, 1.0) * (d - 1)
    i0 = np.floor(scaled).astype(np.int32)
    i0 = np.minimum(i0, d - 2)
    f = scaled - i0
    r0, g0, b0 = i0[..., 0], i0[..., 1], i0[..., 2]
    r1, g1, b1 = r0 + 1, g0 + 1, b0 + 1
    fr, fg, fb = f[..., 0:1], f[..., 1:2], f[..., 2:3]

    c000 = grid[r0, g0, b0]
    c001 = grid[r0, g0, b1]
    c010 = grid[r0, g1, b0]
    c011 = grid[r0, g1, b1]
    c100 = grid[r1, g0, b0]
    c101 = grid[r1, g0, b1]
    c110 = grid[r1, g1, b0]
    c111 = grid[r1, g1, b1]

    c00 = c000 * (1.0 - fb) + c001 * fb
    c01 = c010 * (1.0 - fb) + c011 * fb
    c10 = c100 * (1.0 - fb) + c101 * fb
    c11 = c110 * (1.0 - fb) + c111 * fb

    c0 = c00 * (1.0 - fg) + c01 * fg
    c1 = c10 * (1.0 - fg) + c11 * fg
    return np.clip(c0 * (1.0 - fr) + c1 * fr, 0.0, 1.0)


def _apply_tone_curve_pv2012(x: np.ndarray) -> np.ndarray:
    """Đường cong ToneCurvePV2012 (0->19, 163->134, 255->208) nội suy trơn đơn điệu PCHIP."""
    xp = np.array([0.0, 163.0 / 255.0, 1.0], dtype=np.float32)
    fp = np.array([19.0 / 255.0, 134.0 / 255.0, 208.0 / 255.0], dtype=np.float32)
    h0 = xp[1] - xp[0]
    h1 = xp[2] - xp[1]
    d0 = (fp[1] - fp[0]) / h0
    d1 = (fp[2] - fp[1]) / h1
    m1 = (2.0 * h0 + h1) / (3.0 * (h0 + h1))
    slope1 = (d0 * d1) / (m1 * d1 + (1.0 - m1) * d0) if (d0 * d1) > 0 else 0.0
    slope0 = np.clip(2.0 * d0 - slope1 * 0.5, 0.0, 3.0 * d0)
    slope2 = np.clip(2.0 * d1 - slope1 * 0.5, 0.0, 3.0 * d1)

    y = np.empty_like(x)
    left = x <= xp[1]
    t_l = np.clip((x[left] - xp[0]) / h0, 0.0, 1.0)
    y[left] = (
        (2 * t_l**3 - 3 * t_l**2 + 1) * fp[0]
        + (t_l**3 - 2 * t_l**2 + t_l) * h0 * slope0
        + (-2 * t_l**3 + 3 * t_l**2) * fp[1]
        + (t_l**3 - t_l**2) * h0 * slope1
    )
    right = ~left
    t_r = np.clip((x[right] - xp[1]) / h1, 0.0, 1.0)
    y[right] = (
        (2 * t_r**3 - 3 * t_r**2 + 1) * fp[1]
        + (t_r**3 - 2 * t_r**2 + t_r) * h1 * slope1
        + (-2 * t_r**3 + 3 * t_r**2) * fp[2]
        + (t_r**3 - t_r**2) * h1 * slope2
    )
    return np.clip(y, 0.0, 1.0)


def evaluate_retro_curve(rgb_pts: np.ndarray, p: RetroConfig, choco_grid: np.ndarray) -> np.ndarray:
    """Tính ánh xạ màu Retro XMP:
    1. Camera Calibration -> 2. Basic Tone -> 3. HSL (Red/Orange) -> 4. ToneCurvePV2012
    -> 5. Creative Profile Look Chocolates 03 ở cuối chuỗi để giữ chân đen sâu ấm nâu chocolate.
    """
    rgb = np.clip(rgb_pts, 0.0, 1.0)

    # 1. Camera Calibration (chuyển dịch kênh R/G/B trong linear RGB)
    lin = _srgb_to_linear(rgb)
    cal_mat = np.array([
        [1.0 + p.calRedSat * 0.0020, -p.calGreenHue * 0.0018, p.calBlueHue * 0.0014],
        [p.calRedHue * 0.0018, 1.0 + p.calGreenSat * 0.0025, -p.calBlueHue * 0.0012],
        [-p.calRedHue * 0.0008, p.calGreenHue * 0.0014, 1.0 + p.calBlueSat * 0.0028],
    ], dtype=np.float32)
    cal_mat = cal_mat / np.maximum(cal_mat.sum(axis=1, keepdims=True), 1e-4)
    rgb = _linear_to_srgb(np.clip(lin @ cal_mat.T, 0.0, 1.0))

    # 2. Basic Light (Whites/Highlights/Shadows/Blacks + Contrast trước ToneCurve)
    lin = _srgb_to_linear(rgb)
    lum = 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]
    safe_lum = np.maximum(lum, 1e-5)

    white_scale = 1.0 + (p.whites * 0.0020) * (np.clip((lum - 0.14) / 0.86, 0.0, 1.0) ** 0.75)
    hi_scale = 1.0 + (p.highlights * 0.0080) * (np.clip((lum - 0.45) / 0.55, 0.0, 1.0) ** 1.4)
    sh_scale = 1.0 + (p.shadows * 0.0080) * (np.clip((0.36 - lum) / 0.36, 0.0, 1.0) ** 1.3) * np.clip(lum / 0.015, 0.0, 1.0)
    bl_shift = (p.blacks * 0.0012 + 0.0025) * (np.clip((0.22 - lum) / 0.22, 0.0, 1.0) ** 1.5)

    target_lum = np.clip(lum * white_scale * hi_scale * sh_scale + bl_shift, 0.0, 1.0)
    ratio = np.where(lum > 1e-5, target_lum / safe_lum, 1.0)[..., np.newaxis]
    lin = np.clip(lin * ratio, 0.0, 1.0)
    # Giữ nền tối ấm nâu-đỏ ở chân đen khớp đặc trưng film Capture One
    w_deep = np.clip((0.06 - lum) / 0.06, 0.0, 1.0) ** 1.4
    lin[..., 0] = np.clip(lin[..., 0] + 0.0019 * w_deep, 0.0, 1.0)
    rgb = _linear_to_srgb(lin)

    if abs(p.contrast) > 1e-4:
        c_gamma = float(np.clip(1.0 + p.contrast * 0.0036, 0.75, 1.35))
        rgb = np.clip(rgb, 0.0, 1.0) ** c_gamma
        c_k = p.contrast * 0.0155
        rgb = np.clip(rgb + c_k * (rgb - 0.45) * (1.0 - np.abs(2.0 * rgb - 1.0)), 0.0, 1.0)

    # 3. HSL (Hue Red/Orange, Sat Red, Lum Red) — bù độ dịch hồng da từ BlueHue Calibration
    hue, sat, l_hsl = _rgb_to_hsl_deg(rgb)
    w_red = _band_weight(hue, 0.0, 36.0)
    w_org = _band_weight(hue, 26.0, 22.0)
    hue = (hue + p.hueRed * 0.72 * w_red + (p.hueOrange * 0.74 - p.calBlueHue * 0.72) * w_org) % 360.0
    sat = np.clip(sat * (1.0 + p.satRed * 0.0048 * w_red + 0.04 * w_org), 0.0, 1.0)
    l_hsl = np.clip(l_hsl + p.lumRed * 0.0028 * w_red * (1.0 - np.abs(2.0 * l_hsl - 1.0)), 0.0, 1.0)
    rgb = _hsl_deg_to_rgb(hue, sat, l_hsl)

    # 4. ToneCurvePV2012 (0->19, 163->134, 255->208) tạo nền matte trước Profile Look
    curve_out = _apply_tone_curve_pv2012(rgb)
    rgb = np.clip(rgb * 0.128 + curve_out * 0.872, 0.0, 1.0)

    # 5. Creative Profile Look: Chocolates 03 3D LUT ở cuối chuỗi để không bị ToneCurve nâng bệt vùng đen
    lut_out = _eval_3d_lut_trilinear(rgb, choco_grid)
    amt = float(np.clip(p.lookAmount, 0.0, 1.5))
    return np.clip(rgb * (1.0 - amt) + lut_out * amt, 0.0, 1.0)


def _get_retro_3d_lut(p: RetroConfig) -> ImageFilter.Color3DLUT:
    """Lấy Color3DLUT 33^3 từ cache hoặc tính mới."""
    choco_grid, mtime = _load_chocolates_lut()
    key = (
        round(p.lookAmount, 3), round(p.contrast, 1), round(p.highlights, 1),
        round(p.shadows, 1), round(p.whites, 1), round(p.blacks, 1),
        round(p.hueRed, 1), round(p.hueOrange, 1), round(p.satRed, 1), round(p.lumRed, 1),
        round(p.calRedHue, 1), round(p.calRedSat, 1), round(p.calGreenHue, 1),
        round(p.calGreenSat, 1), round(p.calBlueHue, 1), round(p.calBlueSat, 1),
        mtime,
    )
    with _lut_cache_lock:
        cached = _lut_cache.get(key)
        if cached is not None:
            _lut_cache.move_to_end(key)
            return cached

    n = _LUT_GRID_SIZE
    axis = np.linspace(0.0, 1.0, n, dtype=np.float32)
    b_g, g_g, r_g = np.meshgrid(axis, axis, axis, indexing="ij")
    rgb_pts = np.stack([r_g, g_g, b_g], axis=-1).reshape(-1, 3)
    rgb_out = evaluate_retro_curve(rgb_pts, p, choco_grid)
    table = np.clip(rgb_out, 0.0, 1.0).reshape(-1, 3).tolist()
    lut = ImageFilter.Color3DLUT(n, table)

    with _lut_cache_lock:
        _lut_cache[key] = lut
        if len(_lut_cache) > _LUT_CACHE_MAX:
            _lut_cache.popitem(last=False)
    return lut


def apply_retro(
    img_bgr: np.ndarray,
    config: Optional[Union[RetroConfig, Dict[str, Any]]] = None,
    skin_mask: Optional[np.ndarray] = None,
    intensity: float = 1.0,
) -> np.ndarray:
    """Áp dụng bộ lọc màu Retro duy nhất (Retro 2 XMP + Chocolates 03 LUT + Glow) lên ảnh BGR."""
    del skin_mask
    eff_int = float(np.clip(intensity, 0.0, 1.0))
    if img_bgr is None or img_bgr.size == 0 or eff_int <= 1e-4:
        return img_bgr

    if isinstance(config, RetroConfig):
        p = config
    elif isinstance(config, dict) and config:
        p = RetroConfig(**config)
    else:
        p = RetroConfig()

    if not p.enabled:
        return img_bgr

    lut = _get_retro_3d_lut(p)
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    graded_rgb = np.asarray(Image.fromarray(img_rgb).filter(lut), dtype=np.uint8)
    out_bgr = cv2.cvtColor(graded_rgb, cv2.COLOR_RGB2BGR)

    h, w = out_bgr.shape[:2]
    # Glow (Lightroom Creative Soft Glow: xử lý trực tiếp trên uint8 qua OpenCV SIMD để tối ưu tốc độ)
    if p.glow > 0.5 and w >= 32 and h >= 32:
        small_w, small_h = max(16, w // 4), max(16, h // 4)
        small = cv2.resize(out_bgr, (small_w, small_h), interpolation=cv2.INTER_AREA)
        sigma = max(2.0, (0.015 + (p.glowSpread / 100.0) * 0.028) * max(small_w, small_h))
        bloom_up = cv2.resize(cv2.GaussianBlur(small, (0, 0), sigma), (w, h), interpolation=cv2.INTER_LINEAR)
        lum_u8 = cv2.cvtColor(out_bgr, cv2.COLOR_BGR2GRAY)
        range_thresh = 0.56 - (p.glowRange / 100.0) * 0.24
        lum_axis = np.arange(256, dtype=np.float32) / 255.0
        alpha_lut = np.clip((lum_axis - range_thresh) / max(0.15, 1.0 - range_thresh), 0.0, 1.0) * np.clip((p.glow / 100.0) * 0.26, 0.0, 0.85)
        w_map = cv2.LUT(lum_u8, np.round(alpha_lut * 255.0).astype(np.uint8))
        w_map3 = cv2.merge([w_map, w_map, w_map])
        w_bloom = cv2.multiply(bloom_up, w_map3, scale=1.0 / 255.0)
        delta = cv2.multiply(cv2.bitwise_not(out_bgr), w_bloom, scale=1.0 / 255.0)
        out_bgr = cv2.add(out_bgr, delta)

    if p.texture < -0.5 and w >= 16 and h >= 16:
        tex_alpha = float(np.clip(-p.texture * 0.0025, 0.0, 0.18))
        small = cv2.resize(out_bgr, (max(8, w // 4), max(8, h // 4)), interpolation=cv2.INTER_AREA)
        blur = cv2.resize(cv2.GaussianBlur(small, (0, 0), 1.5), (w, h), interpolation=cv2.INTER_LINEAR)
        out_bgr = cv2.addWeighted(out_bgr, 1.0 - tex_alpha, blur, tex_alpha, 0.0)

    if p.grain > 1e-4:
        out_bgr = apply_fast_film_grain_u8(out_bgr, p.grain * 0.14)

    if eff_int >= 0.999:
        return out_bgr
    return cv2.addWeighted(img_bgr, 1.0 - eff_int, out_bgr, eff_int, 0.0)
