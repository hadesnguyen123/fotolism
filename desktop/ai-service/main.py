"""
Ứng dụng FastAPI backend AI Service cục bộ phục vụ Kiosk Fotolism (cổng 8000).
Cung cấp các API xử lý ảnh AI làm đẹp chuẩn Hàn Quốc, ghép khung ảnh in và tạo mã QR.
Phụ thuộc: fastapi, uvicorn, các router trong api.routes.
"""
import os
import sys
from contextlib import asynccontextmanager

# Ép matplotlib (dependency của mediapipe.tasks.python.vision.drawing_utils) chạy headless, tránh kéo GUI DLL khi đóng gói
os.environ.setdefault("MPLBACKEND", "Agg")

# Đảm bảo console Windows luôn encode UTF-8 an toàn, tránh lỗi UnicodeEncodeError khi log tiếng Việt
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import camera, enhance, composite, qr, print_job


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Quản lý vòng đời khởi động và dừng dịch vụ FastAPI.
    """
    # Startup
    print("[AI Service] Fotolism AI Service ready on http://localhost:8000")
    yield
    # Shutdown
    print("[AI Service] Fotolism AI Service shutting down")


app = FastAPI(
    title="Fotolism AI Service",
    version="0.1.2",
    description="Local AI backend for Fotolism photobooth software",
    lifespan=lifespan,
)

# CORS — chỉ cấp phép cho giao diện Electron Kiosk (localhost / file protocol)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "file://"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────────────────
app.include_router(camera.router,    prefix="/camera",   tags=["Camera"])
app.include_router(enhance.router,   prefix="/enhance",  tags=["AI Enhance"])
app.include_router(composite.router, prefix="/composite",tags=["Frame Composite"])
app.include_router(qr.router,        prefix="/qr",       tags=["QR & Sharing"])
app.include_router(print_job.router, prefix="/print",    tags=["Print"])


@app.get("/health")
async def health():
    """
    Kiểm tra nhanh tình trạng sống (health check) và các thư viện AI cốt lõi (MediaPipe, Matplotlib, FaceLandmarker model).
    """
    mp_ok = False
    mpl_ok = False
    dense_model_ok = False
    try:
        import matplotlib.pyplot  # noqa: F401
        mpl_ok = True
    except Exception:
        pass
    try:
        import mediapipe  # noqa: F401
        mp_ok = True
    except Exception:
        pass
    try:
        from core.korean_beauty_engine import DENSE_MODEL_PATH
        dense_model_ok = bool(DENSE_MODEL_PATH.is_file())
    except Exception:
        pass

    return {
        "status": "ok",
        "service": "Fotolism AI",
        "version": "0.1.2",
        "mediapipe": mp_ok,
        "matplotlib": mpl_ok,
        "denseModel": dense_model_ok,
    }



if __name__ == "__main__":
    import uvicorn
    from core.config import PORT
    # Truyền trực tiếp đối tượng app để chạy ổn định khi đóng gói bằng PyInstaller
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")

