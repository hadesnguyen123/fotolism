"""
Fotolism AI Service — FastAPI Application
Chạy local: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import camera, enhance, composite, qr, print_job, config
from core.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    # Startup
    await init_db()
    print("✅ Fotolism AI Service ready on http://localhost:8000")
    yield
    # Shutdown
    print("🛑 Fotolism AI Service shutting down")


app = FastAPI(
    title="Fotolism AI Service",
    version="0.1.0",
    description="Local AI backend for Fotolism photobooth software",
    lifespan=lifespan,
)

# CORS — chỉ cho Electron (localhost)
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
app.include_router(config.router,    prefix="/config",   tags=["Config"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "Fotolism AI", "version": "0.1.0"}
