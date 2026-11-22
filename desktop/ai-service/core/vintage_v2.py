"""
Fotolism AI Beauty Engine — Bộ lọc Vintage V2 (Vintage Brown / Warm Film)
Áp dụng sau bước AI Beauty Engine theo chuẩn: Original -> AI Beauty -> Vintage Filter -> Export.
Tối ưu tốc độ bằng C-level 3D LUT (PIL.ImageFilter.Color3DLUT 33^3 có cache theo cấu hình),
blur 1/8 độ phân giải cho Clarity và hạt phim tuần hoàn tốc độ cao.
Phụ thuộc: cv2, numpy, PIL, pydantic.
"""
from collections import OrderedDict
import threading
from typing import Optional, Dict, Any, Tuple, Union
import cv2
import numpy as np
from PIL import Image, ImageFilter
from pydantic import BaseModel, Field

_LUT_GRID_SIZE = 33
_LUT_CACHE_MAX = 24
_lut_cache_lock = threading.Lock()
_lut_cache: "OrderedDict[Tuple[Any, ...], ImageFilter.Color3DLUT]" = OrderedDict()

# Mẫu hạt film tất định 512x512 (mean=0, std=1) tạo một lần để áp nhanh lên ảnh 24MP mà không cấp phát RNG mỗi khung
_GRAIN_TILE_SIZE = 512
_GRAIN_TILE_F32 = np.random.default_rng(42).normal(0.0, 1.0, size=(_GRAIN_TILE_SIZE, _GRAIN_TILE_SIZE)).astype(np.float32)


class VintageV2Config(BaseModel):
    """Cấu hình tinh chỉnh bộ lọc Vintage Brown / Warm Film V2 (hỗ trợ cường độ 0..100%)."""
    enabled: bool = Field(True)
    # Tonal & Light (Lightroom-style)
    exposure: float = Field(-0.25, ge=-2.0, le=2.0)
    contrast: float = Field(-12.0, ge=-100.0, le=100.0)
    highlights: float = Field(-30.0, ge=-100.0, le=100.0)
    shadows: float = Field(8.0, ge=-100.0, le=100.0)
    whites: float = Field(-15.0, ge=-100.0, le=100.0)
    blacks: float = Field(-8.0, ge=-100.0, le=100.0)
    # White Balance & Presence
    temperature: float = Field(5.0, ge=-50.0, le=50.0)
    tint: float = Field(-5.0, ge=-50.0, le=50.0)
    vibrance: float = Field(-12.0, ge=-100.0, le=100.0)
    saturation: float = Field(-8.0, ge=-100.0, le=100.0)
    clarity: float = Field(-8.0, ge=-100.0, le=100.0)
    dehaze: float = Field(-2.0, ge=-100.0, le=100.0)
    # 3-Way Color Grading
    cgHighlightsHue: float = Field(35.0, ge=0.0, le=360.0)
    cgHighlightsSat: float = Field(8.0, ge=0.0, le=100.0)
    cgMidtonesHue: float = Field(25.0, ge=0.0, le=360.0)
    cgMidtonesSat: float = Field(7.0, ge=0.0, le=100.0)
    cgShadowsHue: float = Field(30.0, ge=0.0, le=360.0)
    cgShadowsSat: float = Field(9.0, ge=0.0, le=100.0)
    cgBlending: float = Field(50.0, ge=0.0, le=100.0)
    cgBalance: float = Field(5.0, ge=-100.0, le=100.0)
    # HSL (Red, Orange, Yellow, Magenta)
    redHue: float = Field(3.0, ge=-50.0, le=50.0)
    redSat: float = Field(-10.0, ge=-100.0, le=100.0)
    redLum: float = Field(-3.0, ge=-100.0, le=100.0)
    orangeHue: float = Field(-3.0, ge=-50.0, le=50.0)
    orangeSat: float = Field(-8.0, ge=-100.0, le=100.0)
    orangeLum: float = Field(3.0, ge=-100.0, le=100.0)
    yellowHue: float = Field(-10.0, ge=-50.0, le=50.0)
    yellowSat: float = Field(-20.0, ge=-100.0, le=100.0)
    yellowLum: float = Field(-5.0, ge=-100.0, le=100.0)
    magentaHue: float = Field(0.0, ge=-50.0, le=50.0)
    magentaSat: float = Field(-20.0, ge=-100.0, le=100.0)
    magentaLum: float = Field(0.0, ge=-100.0, le=100.0)
    # Cân bằng phim & hạt film
    filmDepth: float = Field(0.90, ge=0.0, le=1.5)
    grain: float = Field(0.2, ge=0.0, le=0.5)


def _srgb_to_linear(x: np.ndarray) -> np.ndarray:
    """Chuyển sRGB [0..1] sang tuyến tính để chỉnh WB và EV không sai lệch sắc độ."""
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


def _hue_offset_rgb(hue_deg: float) -> np.ndarray:
    """Trả về vector dịch màu RGB có trung bình cân bằng từ góc Hue [0..360)."""
    return (
        _hsl_deg_to_rgb(
            np.array([hue_deg], dtype=np.float32),
            np.array([1.0], dtype=np.float32),
            np.array([0.5], dtype=np.float32),
        )[0]
        - 0.5
    )


def _band_weight(hue: np.ndarray, center: float, width: float) -> np.ndarray:
    """Tính trọng số smoothstep theo góc Hue tuần hoàn để không tạo vệt gãy chuyển màu."""
    d = np.abs((hue - center + 180.0) % 360.0 - 180.0)
    t = np.clip(1.0 - d / width, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _evaluate_color_curve(rgb_pts: np.ndarray, p: VintageV2Config) -> np.ndarray:
    """Tính ánh xạ màu Vintage V2 đồng nhất toàn ảnh trên lưới 3D RGB [0..1] kích thước (K, 3), trả về BGR [0..1]."""
    lin = _srgb_to_linear(rgb_pts)
    r_wb = 1.0 + p.temperature * 0.0042 + p.tint * 0.0012
    g_wb = 1.0 - p.tint * 0.0006
    b_wb = 1.0 - p.temperature * 0.0040 + p.tint * 0.0014
    lin = lin * np.array([r_wb, g_wb, b_wb], dtype=np.float32)

    if abs(p.exposure) > 1e-4:
        lin = lin * (2.0 ** p.exposure)

    if abs(p.dehaze) > 1e-4:
        dh = p.dehaze * 0.0012
        lin = np.clip(lin * (1.0 + dh) - dh * 0.55, 0.0, 4.0)

    rgb = _linear_to_srgb(np.clip(lin, 0.0, 1.0))

    lum = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    safe_lum = np.maximum(lum, 1e-5)
    delta_l = np.zeros_like(lum)

    if p.filmDepth > 1e-4:
        toe_lift = 0.024 * np.exp(-lum / 0.032)
        dark_mid_bell = np.exp(-((lum - 0.30) / 0.19) ** 2)
        mid_dip = -0.095 * dark_mid_bell * np.clip(lum / 0.08, 0.0, 1.0)
        delta_l += p.filmDepth * (toe_lift + mid_dip)

    if abs(p.blacks) > 1e-4:
        bw = ((1.0 - np.clip(lum / 0.28, 0.0, 1.0)) ** 1.4) * np.clip(lum / 0.04, 0.0, 1.0)
        delta_l += (p.blacks / 100.0) * 0.15 * bw
    if abs(p.shadows) > 1e-4:
        sw = np.sin(np.pi * np.clip(lum / 0.38, 0.0, 1.0)) * np.clip(lum / 0.04, 0.0, 1.0)
        delta_l += (p.shadows / 100.0) * 0.055 * sw
    if abs(p.highlights) > 1e-4:
        hw = np.clip((lum - 0.42) / 0.54, 0.0, 1.0) ** 1.25
        delta_l += (p.highlights / 100.0) * 0.105 * hw
    if abs(p.whites) > 1e-4:
        ww = np.clip((lum - 0.68) / 0.32, 0.0, 1.0) ** 1.4
        delta_l += (p.whites / 100.0) * 0.075 * ww
    if abs(p.contrast) > 1e-4:
        cf = p.contrast / 100.0
        delta_l += cf * 0.04 * np.sin(2.0 * np.pi * lum) * (-1.0)

    new_lum = np.clip(lum + delta_l, 0.0, 1.0)
    rgb = np.clip(rgb * (new_lum / safe_lum)[..., np.newaxis], 0.0, 1.0)

    if p.filmDepth > 1e-4:
        dark_warm_w = p.filmDepth * np.clip(1.0 - new_lum / 0.56, 0.0, 1.0) ** 1.1
        rgb[..., 0] = np.clip(rgb[..., 0] * (1.0 + 0.068 * dark_warm_w), 0.0, 1.0)
        rgb[..., 1] = np.clip(rgb[..., 1] * (1.0 - 0.082 * dark_warm_w), 0.0, 1.0)
        rgb[..., 2] = np.clip(rgb[..., 2] * (1.0 - 0.125 * dark_warm_w), 0.0, 1.0)

    hue, sat, lum_hsl = _rgb_to_hsl_deg(rgb)
    h_shift = np.zeros_like(hue)
    s_scale = np.zeros_like(sat)
    l_shift = np.zeros_like(lum_hsl)

    hsl_specs = [
        (0.0, 26.0, p.redHue, p.redSat, p.redLum),
        (28.0, 26.0, p.orangeHue, p.orangeSat, p.orangeLum),
        (58.0, 28.0, p.yellowHue, p.yellowSat, p.yellowLum),
        (312.0, 42.0, p.magentaHue, p.magentaSat, p.magentaLum),
    ]
    chroma_gate = np.clip(sat / 0.08, 0.0, 1.0)
    for center, width, dh, ds, dl in hsl_specs:
        w_band = _band_weight(hue, center, width) * chroma_gate
        h_shift += w_band * (dh * 1.35)
        s_scale += w_band * (ds / 100.0) * 0.55
        l_shift += w_band * (dl / 100.0) * 0.25

    hue = (hue + h_shift) % 360.0
    sat = np.clip(sat * (1.0 + s_scale), 0.0, 1.0)
    lum_hsl = np.clip(lum_hsl + l_shift * (lum_hsl * (1.0 - lum_hsl) * 3.5), 0.0, 1.0)

    skin_hue_guard = 1.0 - 0.35 * _band_weight(hue, 22.0, 24.0)
    vib_adj = (p.vibrance / 100.0) * 0.65 * (1.0 - sat) * skin_hue_guard
    sat_adj = (p.saturation / 100.0) * 0.65
    sat = np.clip(sat * (1.0 + vib_adj + sat_adj), 0.0, 1.0)
    rgb = _hsl_deg_to_rgb(hue, sat, lum_hsl)

    lum_cg = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    pivot = np.clip(0.5 - (p.cgBalance / 100.0) * 0.22, 0.25, 0.75)
    blend_w = 0.18 + (p.cgBlending / 100.0) * 0.38
    w_sh = np.clip((pivot - lum_cg) / blend_w + 0.5, 0.0, 1.0) ** 1.35
    w_hi = np.clip((lum_cg - pivot) / blend_w + 0.5, 0.0, 1.0) ** 1.35
    w_mid = np.clip(1.0 - np.abs(lum_cg - pivot) / max(blend_w, 0.25), 0.0, 1.0) ** 1.2

    sh_tint = _hue_offset_rgb(p.cgShadowsHue) * (p.cgShadowsSat / 100.0) * 0.22
    mid_tint = _hue_offset_rgb(p.cgMidtonesHue) * (p.cgMidtonesSat / 100.0) * 0.16
    hi_tint = _hue_offset_rgb(p.cgHighlightsHue) * (p.cgHighlightsSat / 100.0) * 0.12

    sh_vis = np.clip(lum_cg * 6.0 + 0.25, 0.25, 1.0)
    cg_delta = (
        (w_sh * sh_vis)[..., np.newaxis] * sh_tint
        + w_mid[..., np.newaxis] * mid_tint
        + (w_hi * (1.0 - lum_cg * 0.25))[..., np.newaxis] * hi_tint
    )
    rgb = np.clip(rgb + cg_delta, 0.0, 1.0)
    # Pillow Color3DLUT nhận [0..1]; giữ thứ tự BGR để filter trực tiếp mảng BGR của OpenCV không tốn bước đảo kênh
    return rgb[:, ::-1].astype(np.float32)


def _get_cached_lut(p: VintageV2Config) -> ImageFilter.Color3DLUT:
    """Sinh và cache 3D LUT chạy C qua Pillow theo toàn bộ tham số config (không phụ thuộc face mask)."""
    key = tuple(sorted((k, round(v, 5) if isinstance(v, float) else v) for k, v in p.model_dump().items() if k not in ("enabled", "clarity", "grain")))
    with _lut_cache_lock:
        hit = _lut_cache.get(key)
        if hit is not None:
            _lut_cache.move_to_end(key)
            return hit

    axis = np.linspace(0.0, 1.0, _LUT_GRID_SIZE, dtype=np.float32)
    rr, gg, bb = np.meshgrid(axis, axis, axis, indexing="ij")
    grid_rgb = np.stack([rr.ravel(), gg.ravel(), bb.ravel()], axis=-1)

    tbl = _evaluate_color_curve(grid_rgb, p).reshape(-1)
    lut = ImageFilter.Color3DLUT(_LUT_GRID_SIZE, tbl)

    with _lut_cache_lock:
        _lut_cache[key] = lut
        _lut_cache.move_to_end(key)
        if len(_lut_cache) > _LUT_CACHE_MAX:
            _lut_cache.popitem(last=False)
    return lut


def apply_fast_film_grain_u8(img_u8: np.ndarray, strength_01: float) -> np.ndarray:
    """Thêm hạt film tất định tập trung ở vùng midtone cho ảnh 8-bit grayscale hoặc BGR theo từng dải lát."""
    sigma_u8 = float(strength_01) * 255.0
    if sigma_u8 <= 0.05 or img_u8 is None or img_u8.size == 0:
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


def _apply_clarity_and_grain_bgr(out_bgr: np.ndarray, orig_bgr: np.ndarray, clarity_val: float, grain_val: float) -> np.ndarray:
    """Gộp Clarity âm (blur 1/8) và hạt film tất định trong cùng vòng lặp lát dòng để giữ hiệu năng trên ảnh 24MP."""
    h, w = out_bgr.shape[:2]
    has_clarity = abs(clarity_val) > 1e-4 and min(h, w) >= 16
    grain_sigma = float(np.clip(grain_val, 0.0, 0.5)) * 0.12 * 255.0
    has_grain = grain_sigma > 0.05
    if not has_clarity and not has_grain:
        return out_bgr
    if not has_clarity:
        return apply_fast_film_grain_u8(out_bgr, grain_sigma / 255.0)

    sw, sh = max(16, w // 8), max(16, h // 8)
    sigma_small = max(1.0, max(8.0, min(h, w) * 0.018) * (sw / float(w)))
    small_blur = cv2.GaussianBlur(cv2.resize(out_bgr, (sw, sh), interpolation=cv2.INTER_AREA), (0, 0), sigma_small)

    div = 4 if min(h, w) > 2000 else (2 if min(h, w) > 900 else 1)
    ew, eh = max(16, w // div), max(16, h // div)
    gray_e = cv2.cvtColor(orig_bgr if div == 1 else cv2.resize(orig_bgr, (ew, eh), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
    gx = cv2.Sobel(gray_e, cv2.CV_32F, 1, 0, ksize=3, scale=1.0 / 255.0)
    gy = cv2.Sobel(gray_e, cv2.CV_32F, 0, 1, ksize=3, scale=1.0 / 255.0)
    edge_e = np.clip(1.0 - cv2.magnitude(gx, gy) * 2.5, 0.2, 1.0)
    lum_e = gray_e.astype(np.float32) * (1.0 / 255.0)
    gate_e = edge_e * np.clip(4.0 * lum_e * (1.0 - lum_e), 0.0, 1.0) * np.float32((clarity_val / 100.0) * 0.50)
    sx_b, sy_b = w / float(sw), h / float(sh)
    sx_g, sy_g = w / float(ew), h / float(eh)

    if has_grain:
        reps_x = (w + _GRAIN_TILE_SIZE - 1) // _GRAIN_TILE_SIZE
        grain_row_band = np.tile(_GRAIN_TILE_F32, (1, reps_x))[:, :w] * np.float32(grain_sigma)

    res = np.empty_like(out_bgr)
    chunk_rows = max(32, min(h, 800_000 // max(1, w)))
    for y0 in range(0, h, chunk_rows):
        y1 = min(h, y0 + chunk_rows)
        ch = y1 - y0
        p_f32 = out_bgr[y0:y1].astype(np.float32)

        m_b = np.array([[sx_b, 0.0, 0.0], [0.0, sy_b, -float(y0)]], dtype=np.float32)
        blur_chunk = cv2.warpAffine(small_blur, m_b, (w, ch), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE).astype(np.float32)
        if div == 1:
            gate_chunk = gate_e[y0:y1]
        else:
            m_g = np.array([[sx_g, 0.0, 0.0], [0.0, sy_g, -float(y0)]], dtype=np.float32)
            gate_chunk = cv2.warpAffine(gate_e, m_g, (w, ch), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        p_f32 += (p_f32 - blur_chunk) * gate_chunk[..., np.newaxis]

        if has_grain:
            y_idx = np.arange(y0, y1) % _GRAIN_TILE_SIZE
            g_tile = grain_row_band[y_idx]
            lum_c = (0.0722 * p_f32[..., 0] + 0.7152 * p_f32[..., 1] + 0.2126 * p_f32[..., 2]) * (1.0 / 255.0)
            mid_w = np.clip(1.0 - np.abs(lum_c - 0.5) * 1.4, 0.25, 1.0)
            p_f32 += (g_tile * mid_w)[..., np.newaxis]

        res[y0:y1] = np.clip(np.rint(p_f32), 0, 255).astype(np.uint8)
    return res


def apply_vintage_v2(
    img_bgr: np.ndarray,
    config: Optional[Union[VintageV2Config, Dict[str, Any]]] = None,
    skin_mask: Optional[np.ndarray] = None,
    intensity: float = 1.0,
) -> np.ndarray:
    """
    Áp dụng bộ lọc Vintage Brown / Warm Film V2 trên ảnh BGR mà không thay đổi ảnh gốc đầu vào.

    Tham số:
    - img_bgr: ảnh đầu vào BGR uint8 (thường là kết quả sau AI Beauty Engine).
    - config: `VintageV2Config` hoặc dict cấu hình từ API/Tuner.
    - skin_mask: tham số giữ tương thích chữ ký (hiện không dùng mask riêng).
    - intensity: cường độ pha trộn [0.0 .. 1.0]; 0 trả về đúng `img_bgr` ban đầu.
    """
    del skin_mask
    eff = float(np.clip(intensity, 0.0, 1.0))
    if img_bgr is None or img_bgr.size == 0 or eff <= 1e-4:
        return img_bgr

    if isinstance(config, VintageV2Config):
        p = config
    elif isinstance(config, dict):
        p = VintageV2Config(**config)
    else:
        p = VintageV2Config()

    if not p.enabled:
        return img_bgr

    lut = _get_cached_lut(p)
    out_bgr = np.array(Image.fromarray(img_bgr).filter(lut), copy=True)
    out_bgr = _apply_clarity_and_grain_bgr(out_bgr, img_bgr, p.clarity, p.grain)

    if eff >= 0.999:
        return out_bgr
    return cv2.addWeighted(img_bgr, 1.0 - eff, out_bgr, eff, 0.0)
