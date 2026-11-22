"""
Ứng dụng FastAPI backend AI Service cục bộ phục vụ Kiosk Fotolism (cổng 8000).
Cung cấp các API xử lý ảnh AI làm đẹp chuẩn Hàn Quốc, ghép khung ảnh in và tạo mã QR.
Phụ thuộc: fastapi, uvicorn, các router trong api.routes.
"""
import sys
from contextlib import asynccontextmanager

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
    version="0.1.0",
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
    Kiểm tra nhanh tình trạng sống (health check) của tiến trình AI Service.
    """
    return {"status": "ok", "service": "Fotolism AI", "version": "0.1.0"}



if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, log_level="info")

