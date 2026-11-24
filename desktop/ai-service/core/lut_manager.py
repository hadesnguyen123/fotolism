"""
Fotolism AI Beauty Engine — Style LUT Manager & Cache
Quản lý, lưu bộ nhớ đệm (cache) và nạp bảng tra cứu màu (LUT) của các Style.
Hỗ trợ kiểm tra mtime (file modification time) để tự động nạp lại khi file thay đổi trên đĩa.
Phụ thuộc: cv2, numpy, core.retro.
"""
import json
import logging
from pathlib import Path
from typing import Optional, Tuple, Dict, Any
import numpy as np
import cv2

from core.config import RESOURCE_DIR
from core.retro import apply_fast_film_grain_u8, apply_retro

logger = logging.getLogger("ai_service.lut_manager")

DATA_DIR = RESOURCE_DIR / "data"

_PROCEDURAL_STYLES = (
    "none",
    "raw",
    "original",
    "natural",
    "normal",
    "basic",
    "bw",
    "b&w",
    "vintage_noir",
    "monochrome",
    "retro",
    "retro_90s",
    "vintage",
    "vintage_brown",
    "warm_film",
)


class LUTManager:
    """Quản lý bộ nhớ đệm LUT theo từng styleId, đường dẫn file và phiên bản mtime."""

    def __init__(self, data_dir: Path = DATA_DIR):
        self.data_dir = data_dir
        # Cache cấu trúc: { style_id: { "mtime": float, "path": Path, "luts": (lut_b, lut_g, lut_r) } }
        self._cache: Dict[str, Dict[str, Any]] = {}
        # Cache riêng cho B&W preset Capture One và bản đồ vignette theo kích thước (h, w)
        self._bw_cache: Optional[Dict[str, Any]] = None
        self._bw_vig_cache: Dict[Tuple[int, int], np.ndarray] = {}
        # Identity fallback LUT
        self._identity = np.arange(256, dtype=np.uint8)

    def resolve_style_path(self, style_id: str) -> Optional[Path]:
        """Tìm file LUT tương ứng với styleId."""
        if not style_id or style_id.lower() in _PROCEDURAL_STYLES:
            return None

        # Danh sách đường dẫn ưu tiên kiểm tra
        candidates = [
            self.data_dir / f"{style_id}_lut.npz",
            self.data_dir / f"{style_id}.npz",
            self.data_dir / "luts" / f"{style_id}.npz",
            self.data_dir / "c1_test_style_lut.npz",  # Default test style fallback
        ]

        for p in candidates:
            if p.is_file():
                return p

        return None

    def get_style_luts(self, style_id: str) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Lấy 3 kênh LUT (B, G, R) tương ứng với styleId, có cơ chế cache & auto-invalidation."""
        if not style_id or style_id.lower() in _PROCEDURAL_STYLES:
            return self._identity, self._identity, self._identity

        lut_path = self.resolve_style_path(style_id)
        if lut_path is None:
            logger.warning(f"Không tìm thấy file LUT cho style '{style_id}', sử dụng identity LUT.")
            return self._identity, self._identity, self._identity

        try:
            current_mtime = lut_path.stat().st_mtime
            cached = self._cache.get(style_id)

            if cached and cached.get("path") == lut_path and cached.get("mtime") == current_mtime:
                return cached["luts"]

            # Nạp mới từ file
            logger.info(f"Nạp Style LUT mới từ đĩa: {lut_path} (mtime: {current_mtime})")
            data = np.load(lut_path)
            lut_b = np.asarray(data["lut_b"], dtype=np.uint8)
            lut_g = np.asarray(data["lut_g"], dtype=np.uint8)
            lut_r = np.asarray(data["lut_r"], dtype=np.uint8)

            if len(lut_b) != 256 or len(lut_g) != 256 or len(lut_r) != 256:
                raise ValueError("Bảng LUT phải có kích thước đúng 256 phần tử cho mỗi kênh.")

            luts = (lut_b, lut_g, lut_r)
            self._cache[style_id] = {
                "mtime": current_mtime,
                "path": lut_path,
                "luts": luts
            }
            return luts

        except Exception as e:
            logger.error(f"Lỗi khi đọc LUT từ {lut_path}: {e}. Fallback identity.")
            return self._identity, self._identity, self._identity

    def apply_style(self, img_bgr: np.ndarray, style_id: str) -> np.ndarray:
        """Áp dụng Color Grading từ Style LUT lên ảnh."""
        if not style_id or style_id.lower() in _PROCEDURAL_STYLES:
            return img_bgr

        lut_b, lut_g, lut_r = self.get_style_luts(style_id)
        if np.array_equal(lut_b, self._identity) and np.array_equal(lut_g, self._identity) and np.array_equal(lut_r, self._identity):
            return img_bgr

        graded_b = cv2.LUT(img_bgr[..., 0], lut_b)
        graded_g = cv2.LUT(img_bgr[..., 1], lut_g)
        graded_r = cv2.LUT(img_bgr[..., 2], lut_r)
        return cv2.merge([graded_b, graded_g, graded_r])

    def _get_bw_preset(self) -> Dict[str, Any]:
        """Nạp và cache cấu hình B&W Capture One (tự động nạp lại khi file JSON đổi mtime)."""
        preset_path = self.data_dir / "bw-preset.json"
        mtime = preset_path.stat().st_mtime
        if self._bw_cache and self._bw_cache["mtime"] == mtime:
            return self._bw_cache

        data = json.loads(preset_path.read_text(encoding="utf-8"))
        rgb_w = data["rgbWeights"]
        kernel_bgr = np.array([[rgb_w[2], rgb_w[1], rgb_w[0]]], dtype=np.float32)
        curve = np.asarray(data["toneCurve"], dtype=np.float32)
        lut_256 = np.rint(
            np.clip(
                np.interp(np.linspace(0.0, 1.0, 256), np.linspace(0.0, 1.0, len(curve)), curve),
                0.0,
                1.0,
            ) * 255.0
        ).astype(np.uint8)

        self._bw_cache = {
            "mtime": mtime,
            "kernel_bgr": kernel_bgr,
            "lut_256": lut_256,
            "vignette": data.get("vignette"),
            "clarity": data.get("clarity"),
            "grain": float(data.get("grain", 0.2)),
        }
        self._bw_vig_cache.clear()
        return self._bw_cache

    def _get_bw_vignette_u16(self, h: int, w: int, vig_cfg: Dict[str, Any]) -> np.ndarray:
        """Tạo và cache bản đồ vignette fixed-point Q8 theo kích thước (H, W)."""
        cached = self._bw_vig_cache.get((h, w))
        if cached is not None:
            return cached
        yy, xx = np.ogrid[:h, :w]
        nx = (xx - w * 0.5) / max(1.0, w * 0.5)
        ny = (yy - h * 0.5) / max(1.0, h * 0.5)
        r2 = (nx * nx + ny * ny) * 0.5
        gain = np.clip(
            1.0 + float(vig_cfg["c1"]) * r2 + float(vig_cfg["c2"]) * (r2 ** 2),
            float(vig_cfg.get("minGain", 0.7)),
            float(vig_cfg.get("maxGain", 1.05)),
        )
        vig_u16 = np.rint(gain * 256.0).astype(np.uint16)
        self._bw_vig_cache[(h, w)] = vig_u16
        return vig_u16

    def apply_post_filter(
        self,
        img_bgr: np.ndarray,
        style_id: str,
        bw_config: Optional[Dict[str, Any]] = None,
        retro_config: Optional[Dict[str, Any]] = None,
        skin_mask: Optional[np.ndarray] = None,
        intensity: float = 1.0,
    ) -> np.ndarray:
        """Áp dụng bộ lọc màu (Basic / B&W / Retro) sau bước AI Enhance."""
        sid = (style_id or "").strip().lower()
        eff_intensity = float(np.clip(intensity, 0.0, 1.0))
        if not sid or sid in ("none", "raw", "original", "natural", "normal", "basic") or eff_intensity <= 1e-4:
            return img_bgr

        if sid in ("retro", "retro_90s", "vintage", "vintage_brown", "warm_film"):
            return apply_retro(
                img_bgr,
                config=retro_config,
                skin_mask=skin_mask,
                intensity=eff_intensity,
            )

        styled: Optional[np.ndarray] = None
        if sid in ("bw", "b&w", "vintage_noir", "monochrome"):
            bw = self._get_bw_preset()
            cfg = bw_config or {}
            rw = float(cfg.get("redWeight", float(bw["kernel_bgr"][0, 2])))
            gw = float(cfg.get("greenWeight", float(bw["kernel_bgr"][0, 1])))
            blw = float(cfg.get("blueWeight", float(bw["kernel_bgr"][0, 0])))
            w_sum = rw + gw + blw
            scale = (1.0 / w_sum) if abs(w_sum) > 1e-4 else 1.0
            kernel_bgr = np.array([[blw * scale, gw * scale, rw * scale]], dtype=np.float32)

            gray = cv2.transform(img_bgr, kernel_bgr)
            out = cv2.LUT(gray, bw["lut_256"])

            h, w = out.shape[:2]
            vig_scale = float(cfg.get("vignette", 1.0))
            vig_cfg = bw.get("vignette")
            if vig_cfg and vig_scale > 1e-4:
                vig_u16 = self._get_bw_vignette_u16(h, w, vig_cfg)
                if abs(vig_scale - 1.0) <= 1e-4:
                    out = np.clip((out.astype(np.uint16) * vig_u16) >> 8, 0, 255).astype(np.uint8)
                else:
                    gain = np.clip(1.0 + (vig_u16.astype(np.float32) / 256.0 - 1.0) * vig_scale, 0.25, 1.25)
                    out = np.clip(out.astype(np.float32) * gain, 0, 255).astype(np.uint8)

            clarity_cfg = bw.get("clarity") or {}
            amt = float(cfg.get("softClarity", clarity_cfg.get("amount", 0.0)))
            if amt > 1e-4 and w >= 16 and h >= 16:
                amt = float(np.clip(amt, 0.0, 0.45))
                sigma_ratio = float(clarity_cfg.get("sigmaRatio", 0.008))
                small_w, small_h = max(8, w // 4), max(8, h // 4)
                small = cv2.resize(out, (small_w, small_h), interpolation=cv2.INTER_AREA)
                blur_s = cv2.GaussianBlur(small, (0, 0), max(0.5, sigma_ratio * small_w))
                blur = cv2.resize(blur_s, (w, h), interpolation=cv2.INTER_LINEAR)
                out = cv2.addWeighted(out, 1.0 - amt, blur, amt, 0.0)

            contrast = float(cfg.get("contrast", 0.0))
            blacks_fade = float(cfg.get("blacksFade", 0.0))
            grain = float(cfg.get("grain", bw.get("grain", 0.2)))
            if abs(contrast) > 1e-4 or blacks_fade > 1e-4:
                f = out.astype(np.float32) / 255.0
                if abs(contrast) > 1e-4:
                    f = np.clip((f - 0.5) * (1.0 + contrast) + 0.5, 0.0, 1.0)
                if blacks_fade > 1e-4:
                    fade = blacks_fade * 0.25
                    f = f * (1.0 - fade) + fade
                out = np.rint(np.clip(f * 255.0, 0.0, 255.0)).astype(np.uint8)

            if grain > 1e-4:
                out = apply_fast_film_grain_u8(out, grain * 0.14)

            styled = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)

        if styled is None:
            return img_bgr
        if eff_intensity >= 0.999:
            return styled
        return cv2.addWeighted(img_bgr, 1.0 - eff_intensity, styled, eff_intensity, 0.0)

    def invalidate(self, style_id: Optional[str] = None):
        """Hủy bộ nhớ đệm."""
        if style_id:
            self._cache.pop(style_id, None)
        else:
            self._cache.clear()


# Singleton instance
lut_manager = LUTManager()
