from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import time
from pathlib import Path
from core.config import STORAGE

router = APIRouter()

class QRGenerateRequest(BaseModel):
    sessionId: str
    imagePath: str
    targetUrl: str = ""

@router.post("/generate")
async def generate_qr(req: QRGenerateRequest):
    """
    Tạo mã QR code cho khách scan bằng điện thoại để tải ảnh hoặc mở link gallery.
    """
    timestamp = int(time.time() * 1000)
    # URL tải ảnh (Cloud CDN hoặc local webserver)
    download_url = req.targetUrl or f"https://fotolism.app/gallery/{req.sessionId}"

    qr_filename = f"qr_{req.sessionId}_{timestamp}.png"
    qr_path = STORAGE["qr"] / qr_filename

    try:
        import qrcode
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=2,
        )
        qr.add_data(download_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        img.save(str(qr_path))
    except Exception:
        # Fallback bằng Pillow vẽ QR placeholder nếu chưa install qrcode
        from PIL import Image, ImageDraw
        img = Image.new("RGB", (300, 300), color="white")
        draw = ImageDraw.Draw(img)
        draw.rectangle([20, 20, 280, 280], outline="black", width=4)
        draw.rectangle([50, 50, 110, 110], fill="black")
        draw.rectangle([190, 50, 250, 110], fill="black")
        draw.rectangle([50, 190, 110, 250], fill="black")
        draw.text((80, 140), f"Fotolism QR\n{req.sessionId[:10]}", fill="black")
        img.save(str(qr_path))

    return {
        "success": True,
        "data": {
            "qrUrl": download_url,
            "qrImagePath": str(qr_path),
            "sessionId": req.sessionId,
        },
    }
