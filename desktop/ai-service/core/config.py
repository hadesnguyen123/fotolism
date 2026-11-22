import os
import sys
import tempfile
from pathlib import Path

# Thư mục gốc project (dev) và thư mục tài nguyên chỉ đọc (PyInstaller _MEIPASS hoặc dev)
BASE_DIR = Path(__file__).resolve().parent.parent
IS_FROZEN = bool(getattr(sys, "frozen", False))
RESOURCE_DIR = Path(getattr(sys, "_MEIPASS", BASE_DIR)) if IS_FROZEN else BASE_DIR
# Thư mục ghi dữ liệu tạm: khi đóng gói đặt vào LOCALAPPDATA để tránh lỗi quyền ghi trong Program Files
DATA_DIR = (
    Path(os.getenv("LOCALAPPDATA") or tempfile.gettempdir()) / "fotolism-ai-data"
    if IS_FROZEN
    else BASE_DIR / "data"
)

STORAGE = {
    "raw": DATA_DIR / "raw",
    "enhanced": DATA_DIR / "enhanced",
    "composited": DATA_DIR / "composited",
    "qr": DATA_DIR / "qr",
    "frames": DATA_DIR / "frames",
    "logs": DATA_DIR / "logs",
}

for folder in STORAGE.values():
    folder.mkdir(parents=True, exist_ok=True)

# Port & Hosts
HOST = os.getenv("FOTOLISM_HOST", os.getenv("JOYBOOTH_HOST", "0.0.0.0"))
PORT = int(os.getenv("FOTOLISM_PORT", os.getenv("JOYBOOTH_PORT", "8000")))

# AI Settings
DEFAULT_BEAUTY_LEVEL = 70
USE_GPU = os.getenv("FOTOLISM_USE_GPU", os.getenv("JOYBOOTH_USE_GPU", "false")).lower() == "true"
