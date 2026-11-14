"""
Fotolism AI Beauty Engine — Style LUT Manager & Cache
Quản lý, lưu bộ nhớ đệm (cache) và nạp bảng tra cứu màu (LUT) của các Style.
Hỗ trợ kiểm tra mtime (file modification time) để tự động nạp lại khi file thay đổi trên đĩa.
"""
import logging
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

    def invalidate(self, style_id: Optional[str] = None):
        """Hủy bộ nhớ đệm."""
        if style_id:
            self._cache.pop(style_id, None)
        else:
            self._cache.clear()

# Singleton instance
lut_manager = LUTManager()

