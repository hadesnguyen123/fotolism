from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any
from core.database import get_config_value, set_config_value, get_connection

router = APIRouter()

class SetConfigRequest(BaseModel):
    key: str
    value: Any

@router.get("/{key}")
async def get_config(key: str):
    """Lấy giá trị cấu hình theo key."""
    val = get_config_value(key)
    return {"success": True, "key": key, "value": val}

@router.post("")
async def set_config(req: SetConfigRequest):
    """Cập nhật giá trị cấu hình."""
    set_config_value(req.key, req.value)
    return {"success": True, "key": req.key, "value": req.value}

@router.get("/event/current")
async def get_current_event():
    """Lấy thông tin event đang hoạt động."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM events ORDER BY created_at DESC LIMIT 1")
    row = cursor.fetchone()
    conn.close()
    if row:
        return {"success": True, "event": dict(row)}
    return {"success": True, "event": None}
