"""
FastAPI server độc lập cho AI Enhance Tuner (cổng 8010).
Cung cấp API import ảnh, tinh chỉnh thông số AI Enhance, xem kết quả trực tiếp và xuất
cấu hình để áp dụng ngược lại vào `desktop/ai-service`.
Phụ thuộc: fastapi, uvicorn, cv2, numpy, core.enhance_pipeline, core.korean_beauty_engine.
"""
import sys
import time
import uuid
from pathlib import Path
from typing import Dict, Any

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from core.enhance_pipeline import (
    TuneEnhanceParams,
    detect_faces_yunet,
    run_enhance_pipeline,
)
from core.korean_beauty_engine import KoreanBeautyConfig

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
OUTPUTS_DIR = DATA_DIR / "outputs"
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

app = FastAPI(
    title="Fotolism AI Enhance Tuner",
    version="1.0.0",
    description="Standalone AI parameter tuning studio tách từ Fotolism ai-service",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5180",
        "http://127.0.0.1:5180",
        "http://localhost:8010",
        "http://127.0.0.1:8010",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class EnhanceRunRequest(TuneEnhanceParams):
    """Yêu cầu chạy xử lý AI Enhance lên ảnh đã upload theo imageId."""
    imageId: str = Field(..., min_length=1)


class SampleRgbRequest(BaseModel):
    """Yêu cầu lấy mẫu RGB trung tính tại tọa độ chuẩn hóa [0..1] trên ảnh gốc."""
    imageId: str = Field(..., min_length=1)
    normX: float = Field(..., ge=0.0, le=1.0)
    normY: float = Field(..., ge=0.0, le=1.0)


def _find_upload_file(image_id: str) -> Path:
    """Tìm file ảnh gốc theo imageId với kiểm tra an toàn chống path traversal."""
    safe_id = Path(image_id).name
    if safe_id != image_id:
        raise HTTPException(status_code=400, detail="imageId không hợp lệ")
    for candidate in UPLOADS_DIR.glob(f"{safe_id}.*"):
        if candidate.is_file() and candidate.suffix.lower() in ALLOWED_EXTENSIONS:
            return candidate
    raise HTTPException(status_code=404, detail=f"Không tìm thấy ảnh gốc cho imageId={image_id}")


@app.get("/api/health")
def health() -> Dict[str, Any]:
    """Kiểm tra trạng thái hoạt động của server tinh chỉnh AI."""
    return {"status": "ok", "service": "Fotolism AI Enhance Tuner", "port": 8010}


@app.get("/api/presets")
def get_presets() -> Dict[str, Any]:
    """Trả về thông số mặc định chuẩn xác của từng preset trong ai-service."""
    return {
        "presets": {
            "white_pink_v2": KoreanBeautyConfig.white_pink_v2().model_dump(),
            "white_pink": KoreanBeautyConfig.white_pink().model_dump(),
            "korean_soft_beauty": KoreanBeautyConfig().model_dump(),
        },
        "classicDefaults": {
            "beautyLevel": 50,
            "skinEvening": 0.55,
            "blemishRemoval": 0.55,
            "darkCirclesReduction": 0.40,
            "clarityGlow": -10.0,
            "rosyGlow": 0.00,
            "sharpen": False,
        },
        "styles": ["natural", "bw", "retro"],
    }


@app.post("/api/upload")
async def upload_image(file: UploadFile = File(...)) -> Dict[str, Any]:
    """Import ảnh vào workspace tạm của tuner, đọc kích thước và nhận diện khuôn mặt."""
    ext = Path(file.filename or "photo.jpg").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Định dạng không hỗ trợ: {ext}")

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="File ảnh rỗng")

    arr = np.frombuffer(raw_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Không thể giải mã nội dung ảnh")

    image_id = uuid.uuid4().hex[:12]
    saved_name = f"{image_id}{ext}"
    saved_path = UPLOADS_DIR / saved_name
    saved_path.write_bytes(raw_bytes)

    faces = detect_faces_yunet(img)
    h, w = img.shape[:2]
    return {
        "imageId": image_id,
        "filename": file.filename or saved_name,
        "width": int(w),
        "height": int(h),
        "faceCount": len(faces),
        "originalUrl": f"/api/image/uploads/{saved_name}",
    }


@app.post("/api/sample-rgb")
def sample_neutral_rgb(req: SampleRgbRequest) -> Dict[str, Any]:
    """Lấy mẫu trung vị 5x5 quanh điểm click để dùng làm Neutral Reference RGB cho cân bằng trắng."""
    src_path = _find_upload_file(req.imageId)
    img = cv2.imread(str(src_path))
    if img is None:
        raise HTTPException(status_code=500, detail="Không thể đọc ảnh gốc")

    h, w = img.shape[:2]
    cx = min(w - 1, max(0, int(round(req.normX * (w - 1)))))
    cy = min(h - 1, max(0, int(round(req.normY * (h - 1)))))
    patch = img[max(0, cy - 2):min(h, cy + 3), max(0, cx - 2):min(w, cx + 3)]
    bgr_med = np.median(patch.reshape(-1, 3), axis=0)
    rgb = [round(float(bgr_med[2]), 1), round(float(bgr_med[1]), 1), round(float(bgr_med[0]), 1)]
    return {"rgb": rgb, "x": cx, "y": cy}


@app.post("/api/enhance")
def enhance_preview(req: EnhanceRunRequest) -> Dict[str, Any]:
    """Chạy AI Enhance lên ảnh theo bộ thông số người dùng vừa điều chỉnh và lưu kết quả xem trước."""
    src_path = _find_upload_file(req.imageId)
    img = cv2.imread(str(src_path))
    if img is None:
        raise HTTPException(status_code=500, detail="Không thể đọc file ảnh gốc")

    try:
        result_bgr, meta = run_enhance_pipeline(img, req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Lỗi xử lý AI Enhance: {exc}") from exc

    # Xóa các preview cũ của cùng imageId để tránh đầy ổ đĩa khi kéo chỉnh nhiều lần
    for old_out in OUTPUTS_DIR.glob(f"{req.imageId}_*.jpg"):
        old_out.unlink(missing_ok=True)

    out_name = f"{req.imageId}_{int(time.time() * 1000)}.jpg"
    out_path = OUTPUTS_DIR / out_name
    ok, encoded = cv2.imencode(".jpg", result_bgr, [cv2.IMWRITE_JPEG_QUALITY, 96])
    if not ok:
        raise HTTPException(status_code=500, detail="Không thể mã hóa ảnh kết quả")
    out_path.write_bytes(encoded.tobytes())

    return {
        "enhancedUrl": f"/api/image/outputs/{out_name}",
        "filename": out_name,
        **meta,
    }


@app.get("/api/image/{kind}/{filename}")
def serve_image(kind: str, filename: str):
    """Phục vụ ảnh gốc hoặc ảnh đã xử lý với header tắt cache để UI luôn thấy bản mới nhất."""
    if kind not in ("uploads", "outputs"):
        raise HTTPException(status_code=404, detail="Thư mục ảnh không tồn tại")
    safe_name = Path(filename).name
    if safe_name != filename:
        raise HTTPException(status_code=400, detail="Tên file không hợp lệ")

    target_dir = UPLOADS_DIR if kind == "uploads" else OUTPUTS_DIR
    file_path = target_dir / safe_name
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Không tìm thấy ảnh")

    return FileResponse(
        path=str(file_path),
        headers={"Cache-Control": "no-store, max-age=0"},
    )


if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    print("[AI Enhance Tuner] Ready on http://127.0.0.1:8010")
    uvicorn.run("main:app", host="127.0.0.1", port=8010, log_level="info")
