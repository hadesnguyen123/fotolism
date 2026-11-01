from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import time
import os
import platform
import subprocess
from pathlib import Path
from core.database import get_connection

router = APIRouter()

class PrintRequest(BaseModel):
    imagePath: str
    copies: int = 1
    printerName: str = ""
    sessionId: str = ""

@router.get("/printers")
async def list_printers():
    """Liệt kê danh sách máy in được cài đặt trên hệ thống Windows và macOS."""
    printers = []
    system = platform.system()

    if system == "Windows":
        try:
            import win32print
            installed = win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)
            for p in installed:
                printers.append({
                    "name": p[2],
                    "isDefault": p[2] == win32print.GetDefaultPrinter(),
                })
        except Exception:
            pass
    elif system == "Darwin":
        # macOS: Sử dụng hệ thống in ấn CUPS qua lệnh lpstat
        try:
            output = subprocess.check_output(["lpstat", "-p"], stderr=subprocess.STDOUT).decode("utf-8")
            default_pname = ""
            try:
                def_out = subprocess.check_output(["lpstat", "-d"], stderr=subprocess.STDOUT).decode("utf-8")
                if "system default destination: " in def_out:
                    default_pname = def_out.split("system default destination: ")[1].strip()
            except Exception:
                pass

            for line in output.splitlines():
                if line.startswith("printer "):
                    pname = line.split()[1]
                    printers.append({
                        "name": pname,
                        "isDefault": pname == default_pname,
                    })
        except Exception:
            pass

    # Nếu không phát hiện máy in thật, fallback danh sách máy in phổ biến của Photobooth
    if not printers:
        printers = [
            {"name": "HiTi P525L Photo Printer", "isDefault": True},
            {"name": "DNP DS-RX1HS Dye Sublimation", "isDefault": False},
            {"name": "Canon Selphy CP1500 (AirPrint)", "isDefault": False},
        ]

    return {"success": True, "data": printers}

@router.post("")
async def create_print_job(req: PrintRequest):
    """
    Gửi lệnh in ảnh tới máy in nhiệt/dye-sub photo printer.
    Hỗ trợ Windows (win32print) và macOS (CUPS lp).
    Lưu nhật ký lệnh in vào SQLite database.
    """
    img_path = Path(req.imagePath)
    if not img_path.exists():
        raise HTTPException(status_code=404, detail=f"Image for printing not found: {req.imagePath}")

    job_id = f"print_{int(time.time() * 1000)}"

    # Lưu vào database
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO print_jobs (id, session_id, photo_path, printer_name, copies, status)
            VALUES (?, ?, ?, ?, ?, 'queued')
            """,
            (job_id, req.sessionId, str(img_path), req.printerName or "Default", req.copies),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Warning: Failed to save print_job to DB: {e}")

    printed = False
    system = platform.system()

    if system == "Windows":
        try:
            import win32api
            import win32print
            printer = req.printerName or win32print.GetDefaultPrinter()
            win32api.ShellExecute(0, "print", str(img_path), f'/d:"{printer}"', ".", 0)
            printed = True
        except Exception as err:
            print(f"Windows physical printer dispatch note: {err}")
    elif system == "Darwin":
        # macOS in ấn trực tiếp qua CUPS `lp`
        try:
            cmd = ["lp"]
            if req.printerName and req.printerName != "Default":
                cmd += ["-d", req.printerName]
            if req.copies > 1:
                cmd += ["-n", str(req.copies)]
            cmd.append(str(img_path))
            subprocess.run(cmd, check=True)
            printed = True
        except Exception as err:
            print(f"macOS CUPS physical printer dispatch note: {err}")

    return {
        "success": True,
        "data": {
            "jobId": job_id,
            "status": "printed" if printed else "queued_mock",
            "copies": req.copies,
            "printer": req.printerName or "Default Printer",
        },
    }
