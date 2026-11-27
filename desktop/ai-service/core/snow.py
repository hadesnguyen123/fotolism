"""
Fotolism AI Beauty Engine — Bộ lọc Tuyết Rơi PNG (Snow Overlay cho Selfbooth)
Phủ 1 lớp ảnh tuyết RGBA PNG (`data/snow-overlay.png`) sau bước AI Beauty Enhance
theo cơ chế `Enhance (Natural) -> PNG Snow Overlay -> Export`, không làm thay đổi màu nền gốc.
Tối ưu tốc độ trên ảnh 24MP bằng ghép alpha theo lát dòng (chunked blending) và cache theo mtime.
Phụ thuộc: cv2, numpy, core.config.
"""
from pathlib import Path
from typing import Any, Dict, Optional

import cv2
import numpy as np

from core.config import RESOURCE_DIR

_SNOW_PNG_PATH = RESOURCE_DIR / "data" / "snow-overlay.png"
_SNOW_PNG_CACHE: Optional[Dict[str, Any]] = None


def _load_snow_png(overlay_path: Path = _SNOW_PNG_PATH) -> Optional[np.ndarray]:
    """Đọc ảnh phủ tuyết RGBA PNG kèm cache theo mtime để tự nạp lại khi thay file."""
    global _SNOW_PNG_CACHE
    if not overlay_path.is_file():
        return None
    mtime = overlay_path.stat().st_mtime
    if (
        _SNOW_PNG_CACHE is not None
        and _SNOW_PNG_CACHE.get("path") == overlay_path
        and _SNOW_PNG_CACHE.get("mtime") == mtime
    ):
        return _SNOW_PNG_CACHE["rgba"]
    rgba = cv2.imread(str(overlay_path), cv2.IMREAD_UNCHANGED)
    if rgba is None or rgba.size == 0:
        return None
    _SNOW_PNG_CACHE = {"path": overlay_path, "mtime": mtime, "rgba": rgba}
    return rgba


def apply_snow(
    img_bgr: np.ndarray,
    overlay_path: Optional[Path] = None,
    intensity: float = 1.0,
) -> np.ndarray:
    """
    Phủ 1 lớp ảnh tuyết PNG (RGBA) lên ảnh BGR theo kiểu fit-cover giữ đúng tỉ lệ hạt tuyết.

    Tham số:
    - img_bgr: ảnh đầu vào BGR uint8 (đã qua bước AI Beauty Enhance).
    - overlay_path: đường dẫn file PNG tùy chọn (mặc định `data/snow-overlay.png`).
    - intensity: cường độ phủ lớp ảnh [0.0 .. 1.0].
    """
    eff_int = float(np.clip(intensity, 0.0, 1.0))
    if img_bgr is None or img_bgr.size == 0 or eff_int <= 1e-4:
        return img_bgr

    rgba = _load_snow_png(overlay_path or _SNOW_PNG_PATH)
    if rgba is None:
        return img_bgr

    h, w = img_bgr.shape[:2]
    oh, ow = rgba.shape[:2]
    if h < 8 or w < 8 or oh < 8 or ow < 8:
        return img_bgr

    # Fit-cover trên ảnh PNG gốc trước rồi mới phóng lên (w, h) theo từng lát để tiết kiệm RAM trên ảnh 24MP
    target_aspect = w / float(h)
    src_aspect = ow / float(oh)
    if src_aspect > target_aspect:
        crop_w = max(1, int(round(oh * target_aspect)))
        x0 = max(0, (ow - crop_w) // 2)
        src_crop = rgba[:, x0 : x0 + crop_w]
    else:
        crop_h = max(1, int(round(ow / target_aspect)))
        y0 = max(0, (oh - crop_h) // 2)
        src_crop = rgba[y0 : y0 + crop_h, :]

    ch_src, cw_src = src_crop.shape[:2]
    sx = w / float(cw_src)
    sy = h / float(ch_src)
    interp = cv2.INTER_AREA if (sx < 1.0 and sy < 1.0) else cv2.INTER_LINEAR

    has_alpha = src_crop.ndim == 3 and src_crop.shape[2] == 4
    out = np.empty_like(img_bgr)
    chunk_rows = max(64, min(h, 1_200_000 // max(1, w)))

    for y0 in range(0, h, chunk_rows):
        y1 = min(h, y0 + chunk_rows)
        rh = y1 - y0
        m_aff = np.array([[sx, 0.0, 0.0], [0.0, sy, -float(y0)]], dtype=np.float32)
        ov_chunk = cv2.warpAffine(
            src_crop,
            m_aff,
            (w, rh),
            flags=interp,
            borderMode=cv2.BORDER_REPLICATE,
        )
        bg_c = img_bgr[y0:y1]

        if has_alpha:
            a_u8 = ov_chunk[..., 3]
            if eff_int < 0.999:
                a_u8 = np.rint(a_u8.astype(np.float32) * eff_int).astype(np.uint8)
            a3 = cv2.merge([a_u8, a_u8, a_u8])
            inv_a3 = cv2.bitwise_not(a3)
            fg_part = cv2.multiply(ov_chunk[..., :3], a3, scale=1.0 / 255.0)
            bg_part = cv2.multiply(bg_c, inv_a3, scale=1.0 / 255.0)
            out[y0:y1] = cv2.add(bg_part, fg_part)
        else:
            fg_c = ov_chunk if ov_chunk.ndim == 3 else cv2.cvtColor(ov_chunk, cv2.COLOR_GRAY2BGR)
            if eff_int < 0.999:
                fg_c = cv2.multiply(fg_c, eff_int)
            out[y0:y1] = cv2.add(bg_c, cv2.multiply(cv2.bitwise_not(bg_c), fg_c, scale=1.0 / 255.0))

    return out
