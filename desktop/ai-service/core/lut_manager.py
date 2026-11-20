"""
Fotolism AI Beauty Engine — Style LUT Manager & Cache
Quản lý, lưu bộ nhớ đệm (cache) và nạp bảng tra cứu màu (LUT) của các Style.
Hỗ trợ kiểm tra mtime (file modification time) để tự động nạp lại khi file thay đổi trên đĩa.
"""
import json
import logging
import math
from pathlib import Path
from typing import Optional, Tuple, Dict, Any
import numpy as np
import cv2

logger = logging.getLogger("ai_service.lut_manager")

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

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
        if not style_id or style_id.lower() in ("none", "raw", "original", "natural"):
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
        if not style_id or style_id.lower() in ("none", "raw", "original", "natural"):
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
        if not style_id or style_id.lower() in ("none", "raw", "original", "natural"):
            return img_bgr

        lut_b, lut_g, lut_r = self.get_style_luts(style_id)
        # Kiểm tra nếu là identity thì bỏ qua
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
        # cv2.transform nhận kernel theo thứ tự kênh BGR
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
        }
        self._bw_vig_cache.clear()
        return self._bw_cache

    def _get_bw_vignette_u16(self, h: int, w: int, vig_cfg: Dict[str, Any]) -> np.ndarray:
        """Tạo và cache bản đồ vignette fixed-point Q8 theo kích thước (H, W)."""
        cached = self._bw_vig_cache.get((h, w))
        if cached is not None:
            return cached
        yy, xx = np.ogrid[:h, :w]
        nx = (xx - w * 0.5) / (w * 0.5)
        ny = (yy - h * 0.5) / (h * 0.5)
        r2 = (nx * nx + ny * ny) * 0.5
        gain = np.clip(
            1.0 + float(vig_cfg["c1"]) * r2 + float(vig_cfg["c2"]) * (r2 ** 2),
            float(vig_cfg.get("minGain", 0.7)),
            float(vig_cfg.get("maxGain", 1.05)),
        )
        vig_u16 = np.rint(gain * 256.0).astype(np.uint16)
        self._bw_vig_cache[(h, w)] = vig_u16
        return vig_u16

    def apply_post_filter(self, img_bgr: np.ndarray, style_id: str) -> np.ndarray:
        """Áp dụng bộ lọc màu (Basic / B&W / Retro) sau bước AI Enhance."""
        sid = (style_id or "").strip().lower()
        if not sid or sid in ("none", "raw", "original", "natural", "normal", "basic"):
            return img_bgr

        if sid in ("bw", "b&w", "vintage_noir", "monochrome"):
            # Dùng chung preset Capture One với frontend SVG/Canvas (trộn kênh + tone curve + vignette + clarity âm).
            bw = self._get_bw_preset()
            gray = cv2.transform(img_bgr, bw["kernel_bgr"])
            out = cv2.LUT(gray, bw["lut_256"])

            h, w = out.shape[:2]
            vig_cfg = bw.get("vignette")
            if vig_cfg:
                vig_u16 = self._get_bw_vignette_u16(h, w, vig_cfg)
                out = np.clip((out.astype(np.uint16) * vig_u16) >> 8, 0, 255).astype(np.uint8)

            clarity_cfg = bw.get("clarity")
            if clarity_cfg and float(clarity_cfg.get("amount", 0.0)) > 0.0 and w >= 16 and h >= 16:
                amt = float(clarity_cfg["amount"])
                sigma_ratio = float(clarity_cfg.get("sigmaRatio", 0.008))
                small_w, small_h = max(8, w // 4), max(8, h // 4)
                small = cv2.resize(out, (small_w, small_h), interpolation=cv2.INTER_AREA)
                blur_s = cv2.GaussianBlur(small, (0, 0), max(0.5, sigma_ratio * small_w))
                blur = cv2.resize(blur_s, (w, h), interpolation=cv2.INTER_LINEAR)
                out = cv2.addWeighted(out, 1.0 - amt, blur, amt, 0.0)

            return cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)

        if sid in ("retro", "retro_90s", "vintage"):
            # Chuyển BGR -> RGB [0..1] để khớp chuẩn ma trận CSS sepia(0.38) hue-rotate(-14deg) saturate(1.2) contrast(1.08) brightness(0.98)
            rgb = img_bgr[:, :, ::-1].astype(np.float32) / 255.0
            s = 0.38
            sepia_mat = np.array([
                [1 - 0.607 * s, 0.769 * s,     0.189 * s],
                [0.349 * s,     1 - 0.314 * s, 0.168 * s],
                [0.272 * s,     0.534 * s,     1 - 0.869 * s],
            ], dtype=np.float32)
            a = math.radians(-14.0)
            c, si = math.cos(a), math.sin(a)
            hue_mat = np.array([
                [0.213 + 0.787 * c - 0.213 * si, 0.715 - 0.715 * c - 0.715 * si, 0.072 - 0.072 * c + 0.928 * si],
                [0.213 - 0.213 * c + 0.143 * si, 0.715 + 0.285 * c + 0.140 * si, 0.072 - 0.072 * c - 0.283 * si],
                [0.213 - 0.213 * c - 0.787 * si, 0.715 - 0.715 * c + 0.715 * si, 0.072 + 0.928 * c + 0.072 * si],
            ], dtype=np.float32)
            sat = 1.2
            sat_mat = np.array([
                [0.213 + 0.787 * sat, 0.715 - 0.715 * sat, 0.072 - 0.072 * sat],
                [0.213 - 0.213 * sat, 0.715 + 0.285 * sat, 0.072 - 0.072 * sat],
                [0.213 - 0.213 * sat, 0.715 - 0.715 * sat, 0.072 + 0.928 * sat],
            ], dtype=np.float32)
            combined_mat = sat_mat @ hue_mat @ sepia_mat
            rgb = np.clip(rgb @ combined_mat.T, 0.0, 1.0)
            rgb = np.clip(((rgb - 0.5) * 1.08 + 0.5) * 0.98, 0.0, 1.0)
            return (rgb[:, :, ::-1] * 255.0).astype(np.uint8)

        return img_bgr

    def invalidate(self, style_id: Optional[str] = None):
        """Hủy bộ nhớ đệm."""
        if style_id:
            self._cache.pop(style_id, None)
        else:
            self._cache.clear()

# Singleton instance
lut_manager = LUTManager()

