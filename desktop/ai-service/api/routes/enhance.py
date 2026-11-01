from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import time
from pathlib import Path
from core.config import STORAGE

router = APIRouter()

class EnhanceRequest(BaseModel):
    imagePath: str
    beautyLevel: int = 70  # 0 to 100

@router.post("")
async def enhance_image(req: EnhanceRequest):
    """
    Áp dụng AI Face Enhancement & Skin Smoothing.
    - Level 0: Không can thiệp
    - Level 1-100: Tăng dần độ mịn da, sáng mặt, giữ lại chi tiết mắt & môi
    """
    start_time = time.time()
    input_path = Path(req.imagePath)

    if not input_path.exists():
        raise HTTPException(status_code=404, detail=f"Image not found: {req.imagePath}")

    out_filename = f"enhanced_{int(start_time * 1000)}.jpg"
    out_path = STORAGE["enhanced"] / out_filename

    try:
        import cv2
        import numpy as np

        img = cv2.imread(str(input_path))
        if img is None:
            raise ValueError("Cannot read image")

        if req.beautyLevel > 0:
            # 1. Bilateral filter làm mịn da (giữ nét viền cạnh)
            # sigmaColor và sigmaSpace tỷ lệ theo beautyLevel (1 - 100)
            sigma = int(10 + (req.beautyLevel / 100.0) * 45)
            diameter = 9 if req.beautyLevel < 50 else 15
            smoothed = cv2.bilateralFilter(img, d=diameter, sigmaColor=sigma, sigmaSpace=sigma)

            # 2. Blend giữa ảnh gốc và ảnh đã làm mịn theo weight
            alpha = req.beautyLevel / 100.0 * 0.75  # tối đa 75% làm mịn để tự nhiên
            blended = cv2.addWeighted(smoothed, alpha, img, 1.0 - alpha, 0)

            # 3. Tăng nhẹ độ sáng và tương phản tự nhiên (Glam look)
            brightness_boost = int((req.beautyLevel / 100.0) * 12)
            enhanced = cv2.convertScaleAbs(blended, alpha=1.03, beta=brightness_boost)
        else:
            enhanced = img

        cv2.imwrite(str(out_path), enhanced, [cv2.IMWRITE_JPEG_QUALITY, 95])

    except Exception:
        # Fallback bằng Pillow nếu OpenCV chưa có
        from PIL import Image, ImageEnhance, ImageFilter
        with Image.open(input_path) as im:
            if req.beautyLevel > 0:
                # Làm mờ nhẹ sau đó tăng độ nét
                blur_factor = (req.beautyLevel / 100.0) * 0.8
                smoothed = im.filter(ImageFilter.GaussianBlur(radius=blur_factor))
                enhancer = ImageEnhance.Brightness(smoothed)
                bright = enhancer.enhance(1.05)
                contrast = ImageEnhance.Contrast(bright).enhance(1.02)
                contrast.save(out_path, quality=95)
            else:
                im.save(out_path, quality=95)

    duration_ms = int((time.time() * 1000) - (start_time * 1000))

    return {
        "success": True,
        "data": {
            "enhancedPath": str(out_path),
            "beautyLevel": req.beautyLevel,
            "processingTimeMs": duration_ms,
        },
    }
