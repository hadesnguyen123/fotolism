# -*- mode: python ; coding: utf-8 -*-
"""
Cấu hình PyInstaller đóng gói Fotolism AI Service thành thư mục tự chứa (onedir)
để nhúng trực tiếp vào bộ cài Windows All-in-one mà không cần cài Python trên máy Kiosk.
"""
from PyInstaller.utils.hooks import collect_all

mp_datas, mp_binaries, mp_hiddenimports = collect_all("mediapipe")

datas = [
    ("data/face_detection_yunet_2023mar.onnx", "data"),
    ("data/bw-preset.json", "data"),
    ("data/vintage-v2-lut.json", "data"),
] + mp_datas

binaries = [] + mp_binaries

hiddenimports = [
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "win32print",
    "win32api",
    "qrcode",
] + mp_hiddenimports

a = Analysis(
    ["main.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["torch", "torchvision", "torchaudio", "tensorflow", "matplotlib", "pytest"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="fotolism_ai_service",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="fotolism_ai_service",
)
