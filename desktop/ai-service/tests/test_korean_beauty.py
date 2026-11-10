"""
Fotolism 3.0 — Unit Test Suite for Korean Soft Beauty Engine
============================================================
Kiểm thử tự động tính đúng đắn, an toàn và độ nhạy tham số cho:
1. KoreanBeautyConfig validation
2. Fallback an toàn (disabled, no faces)
3. Tính bảo toàn kích thước, dải động pixel [0, 255]
4. Anatomical Masks & Edge Protection
5. Độ nhạy tham số Virtual Makeup (Rosy Blush, Lip Tint, Porcelain Brightening)
6. Tích hợp API Enhance Request routing
"""
import sys
import unittest
from pathlib import Path
import numpy as np
import cv2

# Thêm ai-service vào sys.path
AI_SERVICE_DIR = Path(__file__).resolve().parent.parent
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))

from core.korean_beauty_engine import KoreanBeautyEngine, KoreanBeautyConfig
from api.routes.enhance import EnhanceRequest, EnhanceResponseData


class TestKoreanBeautyConfig(unittest.TestCase):
    def test_default_config_values(self):
        cfg = KoreanBeautyConfig()
        self.assertEqual(cfg.presetId, "korean_soft_beauty")
        self.assertTrue(cfg.enabled)
        self.assertAlmostEqual(cfg.skinSmoothing, 0.80)
        self.assertAlmostEqual(cfg.blemishRemoval, 0.85)
        self.assertAlmostEqual(cfg.skinEvening, 0.75)
        self.assertAlmostEqual(cfg.skinTextureRetention, 0.55)
        self.assertAlmostEqual(cfg.skinBrightening, 0.15)
        self.assertAlmostEqual(cfg.softGlow, 0.20)
        self.assertAlmostEqual(cfg.rosyBlush, 0.30)
        self.assertAlmostEqual(cfg.lipEnhancement, 0.18)
        self.assertAlmostEqual(cfg.eyeSharpening, 0.12)
        self.assertAlmostEqual(cfg.globalSharpening, 0.00)
        self.assertAlmostEqual(cfg.slimFace, 0.045)
        self.assertAlmostEqual(cfg.bigEyes, 0.045)
        self.assertAlmostEqual(cfg.slimNose, 0.045)

    def test_custom_values_and_bounds(self):
        cfg = KoreanBeautyConfig(
            skinSmoothing=0.5,
            rosyBlush=0.0,
            lipEnhancement=0.5
        )
        self.assertAlmostEqual(cfg.skinSmoothing, 0.5)
        self.assertAlmostEqual(cfg.rosyBlush, 0.0)
        self.assertAlmostEqual(cfg.lipEnhancement, 0.5)


class TestKoreanBeautyEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = KoreanBeautyEngine()
        # Tìm ảnh test thực tế
        raw_path = Path("F:/Fotolism_raw/raw.jpg")
        if raw_path.is_file():
            cls.test_img = cv2.imread(str(raw_path))
        else:
            # Tạo ảnh giả lập nếu không có raw.jpg
            cls.test_img = np.full((600, 800, 3), 128, dtype=np.uint8)

    def test_disabled_engine_returns_identical_image(self):
        cfg = KoreanBeautyConfig(enabled=False)
        dummy = np.random.randint(0, 255, (200, 200, 3), dtype=np.uint8)
        out = self.engine.process_image(dummy, cfg)
        np.testing.assert_array_equal(out, dummy)

    def test_no_face_image_returns_identical_image(self):
        cfg = KoreanBeautyConfig(enabled=True)
        # Ảnh trơn màu không thể có khuôn mặt
        blank = np.zeros((400, 400, 3), dtype=np.uint8)
        out = self.engine.process_image(blank, cfg)
        np.testing.assert_array_equal(out, blank)

    def test_edge_protection_detects_high_contrast_edges(self):
        # Tạo ảnh có đường viền kim loại đen trên nền sáng
        test_edge_img = np.full((100, 100), 200, dtype=np.uint8)
        test_edge_img[40:45, :] = 20  # Đường ngang tương phản cực cao như gọng kính
        wire_prot, wire_3c = self.engine.build_edge_protection(test_edge_img)
        self.assertEqual(wire_prot.shape, (100, 100))
        self.assertEqual(wire_3c.shape, (100, 100, 1))
        # Vùng viền mép gọng kính phải có độ bảo vệ rất cao (> 0.7)
        self.assertGreater(float(np.max(wire_prot[38:46, 50])), 0.7)
        # Vùng phẳng không có cạnh phải có độ bảo vệ xấp xỉ 0 (< 0.1)
        self.assertLess(float(wire_prot[10, 50]), 0.1)

    def test_subtle_reshaping_execution(self):
        # Kiểm tra reshaping không sinh NaN, giữ nguyên shape và dynamic range
        dummy = np.full((300, 300, 3), 160, dtype=np.uint8)
        dummy_faces = [{
            "box": np.array([50, 50, 100, 120]),
            "landmarks": np.array([[80, 80], [120, 80], [100, 110], [85, 135], [115, 135]]),
            "conf": 0.95
        }]
        warped, mask = self.engine.apply_subtle_reshaping(dummy, dummy_faces, 0.045, 0.045, 0.045)
        self.assertEqual(warped.shape, dummy.shape)
        self.assertEqual(mask.shape, dummy.shape[:2])
        self.assertFalse(np.isnan(warped).any())
        self.assertFalse(np.isnan(mask).any())
        self.assertTrue(np.all(warped >= 0) and np.all(warped <= 255))

    def test_full_pipeline_with_real_image(self):
        if self.test_img is None or self.test_img.shape[0] < 500:
            self.skipTest("Không tìm thấy ảnh F:/Fotolism_raw/raw.jpg")

        # Thu nhỏ để kiểm tra nhanh trong unit test (chiều dài 1200)
        scale = 1200 / self.test_img.shape[1]
        small_test = cv2.resize(self.test_img, (1200, int(self.test_img.shape[0] * scale)))

        cfg = KoreanBeautyConfig(enabled=True)
        out = self.engine.process_image(small_test, cfg)

        # Kiểm tra tính toàn vẹn kích thước và kiểu dữ liệu
        self.assertEqual(out.shape, small_test.shape)
        self.assertEqual(out.dtype, np.uint8)
        self.assertTrue(np.all(out >= 0) and np.all(out <= 255))
        # Ảnh phải có sự thay đổi (đã làm đẹp)
        self.assertFalse(np.array_equal(out, small_test))

    def test_parameter_sensitivity(self):
        if self.test_img is None or self.test_img.shape[0] < 500:
            self.skipTest("Không tìm thấy ảnh F:/Fotolism_raw/raw.jpg")

        scale = 960 / self.test_img.shape[1]
        small_test = cv2.resize(self.test_img, (960, int(self.test_img.shape[0] * scale)))

        # 1. Test Rosy Blush: tăng blush làm tăng giá trị kênh a* (Lab)
        cfg_no_blush = KoreanBeautyConfig(rosyBlush=0.0)
        cfg_high_blush = KoreanBeautyConfig(rosyBlush=0.8)

        out_no_blush = self.engine.process_image(small_test, cfg_no_blush)
        out_high_blush = self.engine.process_image(small_test, cfg_high_blush)

        lab_no = cv2.cvtColor(out_no_blush, cv2.COLOR_BGR2LAB)
        lab_high = cv2.cvtColor(out_high_blush, cv2.COLOR_BGR2LAB)

        # So sánh sắc hồng A* trên toàn ảnh
        diff_a = lab_high[..., 1].astype(float) - lab_no[..., 1].astype(float)
        self.assertGreater(float(np.sum(diff_a > 0)), 300, "Má hồng phải làm tăng sắc A* trên các vùng gò má")
        self.assertGreater(float(np.max(diff_a)), 3.0, "Độ tăng sắc hồng cực đại phải rõ rệt (> 3.0 Lab units)")

        # 2. Test Lip Enhancement: tăng lip làm tăng sắc A* trên môi
        cfg_no_lip = KoreanBeautyConfig(lipEnhancement=0.0)
        cfg_high_lip = KoreanBeautyConfig(lipEnhancement=0.6)

        out_no_lip = self.engine.process_image(small_test, cfg_no_lip)
        out_high_lip = self.engine.process_image(small_test, cfg_high_lip)

        lab_no_l = cv2.cvtColor(out_no_lip, cv2.COLOR_BGR2LAB)
        lab_high_l = cv2.cvtColor(out_high_lip, cv2.COLOR_BGR2LAB)
        diff_lip_a = lab_high_l[..., 1].astype(float) - lab_no_l[..., 1].astype(float)
        self.assertGreater(float(np.sum(diff_lip_a > 0)), 100, "Son môi phải làm tăng sắc A* trên vùng môi")
        self.assertGreater(float(np.max(diff_lip_a)), 3.0, "Độ tăng sắc môi cực đại phải rõ rệt (> 3.0 Lab units)")


class TestEnhanceAPIRouting(unittest.TestCase):
    def test_enhance_request_preset_id(self):
        req_c1 = EnhanceRequest(imagePath="F:/Fotolism_raw/raw.jpg")
        self.assertEqual(req_c1.presetId, "c1_test_style")

        req_korean = EnhanceRequest(
            imagePath="F:/Fotolism_raw/raw.jpg",
            presetId="korean_soft_beauty",
            koreanConfig=KoreanBeautyConfig(skinSmoothing=0.9)
        )
        self.assertEqual(req_korean.presetId, "korean_soft_beauty")
        self.assertIsNotNone(req_korean.koreanConfig)
        self.assertAlmostEqual(req_korean.koreanConfig.skinSmoothing, 0.9)


if __name__ == "__main__":
    unittest.main()
