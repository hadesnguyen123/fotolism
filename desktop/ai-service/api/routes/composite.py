from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import time
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont, ImageColor
from core.config import STORAGE

router = APIRouter()

class CompositeRequest(BaseModel):
    imagePath: str
    framePath: str = ""

class StickerItem(BaseModel):
    icon: str
    x: float
    y: float
    rotation: float = 0.0

class MultiCutRequest(BaseModel):
    photoPaths: list[str]
    frameSize: str = "2x6"  # "2x6" hoặc "4x6"
    cols: int = 1
    rows: int = 4
    themeBgColor: str = "#FFF8F2"
    themeTextColor: str = "#2D2426"
    eventName: str = "FOTOLISM PHOTOBOOTH"
    eventDate: str = ""
    stickers: list[StickerItem] = []

@router.post("")
async def composite_photo(req: CompositeRequest):
    """
    Ghép ảnh đơn vào khung viền (Frame PNG) hoặc viền Polaroid.
    """
    img_path = Path(req.imagePath)
    if not img_path.exists():
        raise HTTPException(status_code=404, detail=f"User photo not found: {req.imagePath}")

    frame_path = Path(req.framePath) if req.framePath else None

    timestamp = int(time.time() * 1000)
    out_filename = f"composited_{timestamp}.jpg"
    out_path = STORAGE["composited"] / out_filename

    try:
        user_img = Image.open(img_path).convert("RGBA")

        if frame_path and frame_path.exists():
            frame_img = Image.open(frame_path).convert("RGBA")
            frame_w, frame_h = frame_img.size

            user_fitted = ImageOps.fit(user_img, (frame_w, frame_h), method=Image.Resampling.LANCZOS)
            final_img = Image.alpha_composite(user_fitted, frame_img)
            final_rgb = final_img.convert("RGB")
            final_rgb.save(out_path, "JPEG", quality=98)
        else:
            w, h = user_img.size
            border_bottom = int(h * 0.15)
            border_sides = int(w * 0.05)
            
            new_w = w + (border_sides * 2)
            new_h = h + border_sides + border_bottom
            canvas = Image.new("RGB", (new_w, new_h), color=(255, 255, 255))
            canvas.paste(user_img.convert("RGB"), (border_sides, border_sides))
            canvas.save(out_path, "JPEG", quality=98)

        return {
            "success": True,
            "data": {
                "compositedPath": str(out_path),
                "timestamp": timestamp,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Compositing error: {str(e)}")


@router.post("/multi-cut")
async def composite_multi_cut(req: MultiCutRequest):
    """
    Ghép đa ảnh (1, 3, 4, 6, 8 ảnh) thành dải Strip 2x6 hoặc 4x6 chuẩn in 300 DPI.
    - 2x6 inch: 600 x 1800 px
    - 4x6 inch: 1200 x 1800 px
    - Tự động căn crop center theo slot
    - Vẽ màu nền, nhãn sự kiện và ngày tháng
    """
    timestamp = int(time.time() * 1000)
    out_filename = f"multicut_{req.frameSize}_{timestamp}.jpg"
    out_path = STORAGE["composited"] / out_filename

    is_2x6 = req.frameSize == "2x6"
    width = 600 if is_2x6 else 1200
    height = 1800

    try:
        bg_rgb = ImageColor.getrgb(req.themeBgColor)
    except Exception:
        bg_rgb = (255, 248, 242)

    try:
        canvas = Image.new("RGBA", (width, height), bg_rgb + (255,))
        draw = ImageDraw.Draw(canvas)

        count = len(req.photoPaths)
        cols = max(1, req.cols)
        rows = max(1, req.rows)

        footer_h = 160
        pad_x = 36 if is_2x6 else 50
        pad_top = 40
        gap = 20

        avail_h = height - pad_top - footer_h
        slot_w = int((width - pad_x * 2 - gap * (cols - 1)) / cols)
        slot_h = int((avail_h - gap * (rows - 1)) / rows)

        for i, path_str in enumerate(req.photoPaths[: cols * rows]):
            col_idx = i % cols
            row_idx = i // cols
            sx = pad_x + col_idx * (slot_w + gap)
            sy = pad_top + row_idx * (slot_h + gap)

            p = Path(path_str)
            if p.exists():
                with Image.open(p) as img:
                    img_rgba = img.convert("RGBA")
                    fitted = ImageOps.fit(img_rgba, (slot_w, slot_h), method=Image.Resampling.LANCZOS)
                    canvas.paste(fitted, (sx, sy), fitted)
            else:
                draw.rectangle([sx, sy, sx + slot_w, sy + slot_h], fill=(220, 220, 220, 255))

        # Footer branding text
        try:
            text_rgb = ImageColor.getrgb(req.themeTextColor)
        except Exception:
            text_rgb = (45, 36, 38)

        # Sử dụng default font của PIL hoặc TTF nếu có
        try:
            font_title = ImageFont.truetype("arialbd.ttf", 28)
            font_sub = ImageFont.truetype("arial.ttf", 16)
        except Exception:
            font_title = ImageFont.load_default()
            font_sub = ImageFont.load_default()

        event_text = req.eventName.upper()
        draw.text((width // 2, height - 85), event_text, fill=text_rgb, anchor="mm", font=font_title)
        
        sub_text = f"{req.eventDate}  •  FOTOLISM" if req.eventDate else "FOTOLISM PHOTOBOOTH"
        draw.text((width // 2, height - 48), sub_text, fill=text_rgb, anchor="mm", font=font_sub)

        # Lưu ảnh JPEG chất lượng cao
        final_rgb = canvas.convert("RGB")
        final_rgb.save(out_path, "JPEG", quality=98)

        return {
            "success": True,
            "data": {
                "compositedPath": str(out_path),
                "width": width,
                "height": height,
                "timestamp": timestamp,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Multi-cut compositing error: {str(e)}")
