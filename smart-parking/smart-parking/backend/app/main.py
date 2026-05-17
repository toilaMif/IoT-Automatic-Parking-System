# backend/app/main.py
# =========================================================
# SMART PARKING SYSTEM - QR ONLY VERSION
# =========================================================
# Chức năng:
# - Tạo QR dạng PARKING-12345
# - Dashboard hiển thị QR
# - Mobile quét QR
# - ESP32 kiểm tra QR đã quét
# - Mở cổng vào
# - Tính phí khi xe ra
# - Mở cổng ra
# - Quản lý slot
# - Proxy camera stream ESP32-CAM
# =========================================================

from datetime import datetime
from pathlib import Path
from random import randint
import re

import requests
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.services.fee import calculate_fee
from app.services.qr import generate_qr


# =========================================================
# FASTAPI APP
# =========================================================
app = FastAPI(title="Smart Parking API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# DIRECTORIES
# =========================================================
BACKEND_DIR = Path(__file__).resolve().parents[1]
UPLOAD_DIR = BACKEND_DIR / "uploads"
IMG_DIR = BACKEND_DIR / "img"
QR_DIR = IMG_DIR / "qrs"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
QR_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/img", StaticFiles(directory=str(IMG_DIR)), name="img")


# =========================================================
# GLOBAL VARIABLES
# =========================================================
current_command = "idle"
last_updated = None
latest_qr = None
latest_camera_frame = None

ESP32_CAM_STREAM_URL = "http://10.237.28.240:81/stream"

parking_slots = {
    "S1": {
        "slot_id": "S1",
        "status": "empty",
        "updated_at": datetime.now().isoformat(),
    },
    "S2": {
        "slot_id": "S2",
        "status": "empty",
        "updated_at": datetime.now().isoformat(),
    },
}

# active_qrs = {
#   "12345": {
#       "qr_code": "12345",
#       "full_data": "PARKING-12345",
#       "entry_time": "...",
#       "exit_time": None,
#       "fee": 0,
#       "payment_status": "unpaid",
#       "scan_status": "pending",
#       "status": "waiting",
#       "slot_id": "S1",
#       "vehicle_image": "...",
#       "scanned_at": None
#   }
# }
active_qrs = {}


# =========================================================
# REQUEST MODELS
# =========================================================
class CommandRequest(BaseModel):
    command: str


class QRRequest(BaseModel):
    data: str | None = None


class SlotStatus(BaseModel):
    slot_id: str
    status: str


class SlotsUpdateRequest(BaseModel):
    slots: list[SlotStatus]


class ScannedQRRequest(BaseModel):
    data: str


class ExitQRRequest(BaseModel):
    qr_code: str


class CameraUrlRequest(BaseModel):
    url: str


# =========================================================
# HELPER FUNCTIONS
# =========================================================
def get_now():
    return datetime.now().isoformat()


def get_empty_count():
    return sum(
        1 for slot in parking_slots.values()
        if slot["status"] == "empty"
    )


def assign_empty_slot():
    for slot in parking_slots.values():
        if slot["status"] == "empty":
            return slot["slot_id"]
    return None


def clear_all_qr_files():
    global latest_qr

    for file in QR_DIR.glob("*.png"):
        try:
            file.unlink()
        except Exception as e:
            print(f"Cannot delete {file}: {e}")

    latest_qr = None


def extract_qr_code(data: str) -> str | None:
    """
    Extract code from:
    PARKING-12345
    """
    if not data:
        return None

    match = re.search(r"PARKING-(\d{5})", data)
    if match:
        return match.group(1)

    return None


def set_command(command: str):
    global current_command, last_updated

    current_command = command
    last_updated = get_now()


# =========================================================
# ROOT
# =========================================================
@app.get("/")
def root():
    return {
        "message": "Smart Parking API Running",
        "time": get_now(),
    }


# =========================================================
# COMMAND API FOR ESP32
# =========================================================
@app.get("/api/command")
def get_command():
    return {
        "command": current_command,
        "updated_at": last_updated,
    }


@app.post("/api/command")
def update_command(payload: CommandRequest):
    set_command(payload.command)

    return {
        "success": True,
        "command": current_command,
        "updated_at": last_updated,
    }


@app.post("/api/reset")
def reset_command():
    set_command("idle")

    return {
        "success": True,
        "command": current_command,
    }


# =========================================================
# STATUS
# =========================================================
@app.get("/api/status")
def get_status():
    active_count = sum(
        1 for qr in active_qrs.values()
        if qr["status"] == "active"
    )

    return {
        "current_command": current_command,
        "last_updated": last_updated,
        "empty_count": get_empty_count(),
        "active_vehicles": active_count,
        "total_qrs": len(active_qrs),
    }


# =========================================================
# CAMERA CONTROL
# =========================================================
@app.post("/api/camera/on")
def camera_on():
    set_command("camera_on")
    return {"success": True, "command": current_command}


@app.post("/api/camera/off")
def camera_off():
    set_command("camera_off")
    return {"success": True, "command": current_command}


@app.post("/api/camera/capture")
def camera_capture():
    set_command("capture_image")
    return {"success": True, "command": current_command}


# =========================================================
# CAMERA UPLOAD
# =========================================================
@app.post("/api/upload")
async def upload_image(request: Request):
    global latest_camera_frame

    image_bytes = await request.body()

    filename = datetime.now().strftime("%Y%m%d_%H%M%S") + ".jpg"
    filepath = UPLOAD_DIR / filename

    with open(filepath, "wb") as f:
        f.write(image_bytes)

    latest_camera_frame = {
        "success": True,
        "filename": filename,
        "image_url": (
            str(request.base_url).rstrip("/")
            + f"/uploads/{filename}"
        ),
        "created_at": get_now(),
    }

    return latest_camera_frame


@app.get("/api/camera/latest")
def get_latest_camera(request: Request):
    if latest_camera_frame:
        return latest_camera_frame

    images = sorted(
        UPLOAD_DIR.glob("*.jpg"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )

    if not images:
        return {
            "success": False,
            "message": "No image uploaded",
            "image_url": None,
        }

    latest = images[0]

    return {
        "success": True,
        "filename": latest.name,
        "image_url": (
            str(request.base_url).rstrip("/")
            + f"/uploads/{latest.name}"
        ),
        "created_at": datetime.fromtimestamp(
            latest.stat().st_mtime
        ).isoformat(),
    }


# =========================================================
# QR CREATION
# =========================================================
@app.post("/api/qr")
def create_qr(payload: QRRequest, request: Request):
    global latest_qr

    # Clear QR
    if payload.data == "":
        clear_all_qr_files()

        return {
            "success": True,
            "message": "QR cleared",
            "data": "",
            "image_url": None,
        }

    # Check available slots
    if get_empty_count() <= 0:
        return {
            "success": False,
            "message": "Parking Full",
            "empty_count": 0,
        }

    # Remove old QR
    clear_all_qr_files()

    # Generate 5-digit QR
    qr_code = f"{randint(10000, 99999)}"
    qr_data = f"PARKING-{qr_code}"
    filename = f"parking_{qr_code}.png"

    # Create QR image
    filepath = QR_DIR / filename
    generate_qr(qr_data, str(filepath))

    # Assign slot
    slot_id = assign_empty_slot()

    # Save vehicle info
    active_qrs[qr_code] = {
        "qr_code": qr_code,
        "full_data": qr_data,
        "entry_time": get_now(),
        "exit_time": None,
        "fee": 0,
        "payment_status": "unpaid",
        "scan_status": "pending",
        "status": "waiting",
        "slot_id": slot_id,
        "vehicle_image": (
            latest_camera_frame["image_url"]
            if latest_camera_frame else None
        ),
        "scanned_at": None,
    }

    latest_qr = {
        "success": True,
        "data": qr_data,
        "filename": filename,
        "image_url": (
            str(request.base_url).rstrip("/")
            + f"/img/qrs/{filename}"
        ),
        "created_at": get_now(),
    }

    return {
        "success": True,
        "message": "QR created",
        "qr_code": qr_code,
        "slot_id": slot_id,
        "empty_count": get_empty_count(),
        "qr": latest_qr,
    }


@app.get("/api/qr/latest")
def get_latest_qr():
    if latest_qr:
        return latest_qr

    return {
        "success": True,
        "data": "",
        "filename": None,
        "image_url": None,
        "created_at": None,
    }


# =========================================================
# MOBILE SCANS QR
# =========================================================
@app.post("/api/qr/scanned")
def save_scanned_qr(payload: ScannedQRRequest):
    qr_code = extract_qr_code(payload.data)

    if not qr_code:
        return {
            "success": False,
            "message": "QR không hợp lệ",
        }

    if qr_code not in active_qrs:
        return {
            "success": False,
            "message": "QR không tồn tại",
        }

    qr_info = active_qrs[qr_code]

    if qr_info["scan_status"] == "confirmed":
        return {
            "success": False,
            "message": "QR đã được quét",
        }

    # Update QR status
    qr_info["scan_status"] = "confirmed"
    qr_info["status"] = "active"
    qr_info["scanned_at"] = get_now()

    # Occupy slot
    slot_id = qr_info.get("slot_id")
    if slot_id in parking_slots:
        parking_slots[slot_id]["status"] = "occupied"
        parking_slots[slot_id]["updated_at"] = get_now()

    # Open entry gate
    set_command("open_entry_gate")

    return {
        "success": True,
        "message": "Quét QR thành công",
        "qr_code": qr_code,
        "entry_time": qr_info["entry_time"],
        "slot_id": slot_id,
        "command": current_command,
    }


@app.get("/api/qr/scanned/latest")
def get_latest_scanned_qr():
    scanned_items = [
        item for item in active_qrs.values()
        if item["scan_status"] == "confirmed"
        and item["status"] == "active"
    ]

    if not scanned_items:
        return {
            "success": False,
            "message": "Chưa có QR nào được quét",
            "data": None,
        }

    latest_item = max(
        scanned_items,
        key=lambda item: item["scanned_at"]
    )

    return {
        "success": True,
        "data": latest_item,
    }

@app.get("/api/active-qrs")
def get_active_qrs():
    return {
        "success": True,
        "items": list(active_qrs.values()),
        "total": len(active_qrs),
    }


# =========================================================
# EXIT BY QR
# =========================================================
@app.post("/api/exit/by-qr")
def process_exit_by_qr(payload: ExitQRRequest):
    qr_code = payload.qr_code.strip()

    if qr_code not in active_qrs:
        return {
            "success": False,
            "message": "Mã QR không tồn tại",
        }

    qr_info = active_qrs[qr_code]

    if qr_info["status"] != "active":
        return {
            "success": False,
            "message": "QR chưa được quét lúc vào",
        }

    # Calculate duration
    entry_time = datetime.fromisoformat(
        qr_info["entry_time"]
    )

    duration_hours = max(
        (datetime.now() - entry_time).total_seconds() / 3600,
        0.01,
    )

    fee = calculate_fee(duration_hours)

    # Update QR info
    qr_info["exit_time"] = get_now()
    qr_info["fee"] = fee
    qr_info["payment_status"] = "paid"  # demo
    qr_info["status"] = "completed"

    # Free slot
    slot_id = qr_info.get("slot_id")
    if slot_id in parking_slots:
        parking_slots[slot_id]["status"] = "empty"
        parking_slots[slot_id]["updated_at"] = get_now()

    # Open exit gate
    set_command("open_exit_gate")

    # Remove current QR image
    clear_all_qr_files()

    # Remove from active list
    completed_info = active_qrs.pop(qr_code)

    return {
        "success": True,
        "message": "Xe ra thành công",
        "qr_code": qr_code,
        "entry_time": completed_info["entry_time"],
        "exit_time": completed_info["exit_time"],
        "duration_hours": round(duration_hours, 2),
        "fee": fee,
        "command": current_command,
    }


# =========================================================
# SLOT API
# =========================================================
@app.get("/api/slots")
def get_slots():
    return {
        "success": True,
        "slots": list(parking_slots.values()),
        "empty_count": get_empty_count(),
        "updated_at": get_now(),
    }


@app.post("/api/slots/update")
def update_slots(payload: SlotsUpdateRequest):
    updated_at = get_now()

    for slot in payload.slots:
        status = slot.status.lower()
        if status not in {"empty", "occupied"}:
            status = "empty"

        parking_slots[slot.slot_id] = {
            "slot_id": slot.slot_id,
            "status": status,
            "updated_at": updated_at,
        }

    return {
        "success": True,
        "slots": list(parking_slots.values()),
        "empty_count": get_empty_count(),
        "updated_at": updated_at,
    }


# =========================================================
# CAMERA STREAM PROXY
# =========================================================
@app.get("/api/camera/stream")
def camera_stream():
    def generate():
        try:
            with requests.get(
                ESP32_CAM_STREAM_URL,
                stream=True,
                timeout=10,
            ) as response:

                if response.status_code != 200:
                    return

                for chunk in response.iter_content(
                    chunk_size=1024
                ):
                    if chunk:
                        yield chunk

        except Exception as e:
            print("Camera stream error:", e)

    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.get("/api/camera/status")
def camera_status():
    try:
        response = requests.get(
            ESP32_CAM_STREAM_URL,
            timeout=5,
        )

        return {
            "success": response.status_code == 200,
            "camera_url": ESP32_CAM_STREAM_URL,
            "status_code": response.status_code,
        }

    except Exception as e:
        return {
            "success": False,
            "camera_url": ESP32_CAM_STREAM_URL,
            "error": str(e),
        }


@app.post("/api/camera/set-url")
def set_camera_url(payload: CameraUrlRequest):
    global ESP32_CAM_STREAM_URL

    ESP32_CAM_STREAM_URL = payload.url

    return {
        "success": True,
        "camera_url": ESP32_CAM_STREAM_URL,
    }

@app.on_event("startup")
def startup_event():
    active_qrs.clear()
    clear_all_qr_files()

# =========================================================
# TELEGRAM CONFIG
# =========================================================
TELEGRAM_BOT_TOKEN = "8552479442:AAEChd3Lqsfrny7bmAn2OgA2pSxieC1N5yo"
TELEGRAM_CHAT_ID = "6017208398"


# =========================================================
# SEND TELEGRAM MESSAGE
# =========================================================
def send_telegram_message(text: str):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return

    try:
        response = requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            data={
                "chat_id": TELEGRAM_CHAT_ID,
                "text": text,
            },
            timeout=20,
        )

        print("Telegram message status:", response.status_code)
        print("Telegram response:", response.text)

    except Exception as e:
        print("Telegram send message error:", e)


# =========================================================
# SEND TELEGRAM PHOTO
# =========================================================
def send_telegram_photo(photo_url: str, caption: str = ""):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return

    try:
        # photo_url:
        # http://10.237.28.105:8000/uploads/20260516_172251.jpg
        filename = photo_url.split("/")[-1]
        filepath = UPLOAD_DIR / filename

        # Nếu file tồn tại -> upload file trực tiếp
        if filepath.exists():
            print("Uploading photo file:", filepath)

            with open(filepath, "rb") as photo_file:
                response = requests.post(
                    f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendPhoto",
                    data={
                        "chat_id": TELEGRAM_CHAT_ID,
                        "caption": caption,
                    },
                    files={
                        "photo": photo_file,
                    },
                    timeout=60,
                )

            print("Telegram photo status:", response.status_code)
            print("Telegram response:", response.text)

        else:
            # Fallback gửi bằng URL
            print("File not found, sending by URL:", photo_url)

            response = requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendPhoto",
                data={
                    "chat_id": TELEGRAM_CHAT_ID,
                    "photo": photo_url,
                    "caption": caption,
                },
                timeout=60,
            )

            print("Telegram photo status:", response.status_code)
            print("Telegram response:", response.text)

    except Exception as e:
        print("Telegram send photo error:", e)


# =========================================================
# CAPTURE 1 FRAME FROM ESP32-CAM STREAM
# =========================================================
def capture_frame_from_stream(request: Request):
    """
    Chụp 1 frame JPEG từ MJPEG stream của ESP32-CAM.
    """
    global latest_camera_frame

    try:
        print("Connecting to stream:", ESP32_CAM_STREAM_URL)

        response = requests.get(
            ESP32_CAM_STREAM_URL,
            stream=True,
            timeout=(5, 10),
        )

        if response.status_code != 200:
            print("Camera stream HTTP:", response.status_code)
            return None

        buffer = b""
        jpg_bytes = None

        for chunk in response.iter_content(chunk_size=4096):
            if not chunk:
                continue

            buffer += chunk

            start = buffer.find(b"\xff\xd8")  # JPEG start
            end = buffer.find(b"\xff\xd9")    # JPEG end

            if start != -1 and end != -1 and end > start:
                jpg_bytes = buffer[start:end + 2]
                break

        response.close()

        if not jpg_bytes:
            print("Cannot find JPEG frame")
            return None

        # Lưu ảnh
        filename = datetime.now().strftime("%Y%m%d_%H%M%S") + ".jpg"
        filepath = UPLOAD_DIR / filename

        with open(filepath, "wb") as f:
            f.write(jpg_bytes)

        image_url = (
            str(request.base_url).rstrip("/")
            + f"/uploads/{filename}"
        )

        latest_camera_frame = {
            "success": True,
            "filename": filename,
            "image_url": image_url,
            "created_at": get_now(),
        }

        print("Captured frame:", image_url)

        return image_url

    except Exception as e:
        print("Capture frame error:", e)
        return None


# =========================================================
# NOTIFY ENTRY TO TELEGRAM
# =========================================================
@app.post("/api/notify-entry/{qr_code}")
def notify_entry(qr_code: str, request: Request):
    if qr_code not in active_qrs:
        return {
            "success": False,
            "message": "QR không tồn tại",
        }

    info = active_qrs[qr_code]

    entry_time = info["entry_time"]
    slot_id = info["slot_id"]

    caption = (
        "🚗 XE ĐÃ VÀO BÃI THÀNH CÔNG\n"
        f"🔑 Mã QR: {qr_code}\n"
        f"🅿️ Vị trí: {slot_id}\n"
        f"🕒 Thời gian vào: {entry_time}"
    )

    print("Capturing image from ESP32-CAM...")
    image_url = capture_frame_from_stream(request)

    # Nếu chụp không được thì dùng ảnh upload gần nhất
    if not image_url and latest_camera_frame:
        image_url = latest_camera_frame.get("image_url")

    # Lưu lại ảnh vào thông tin xe
    info["vehicle_image"] = image_url

    # Gửi Telegram
    if image_url:
        print("Sending Telegram photo:", image_url)
        send_telegram_photo(image_url, caption)
    else:
        print("No image available. Sending text only.")
        send_telegram_message(caption)

    return {
        "success": True,
        "message": "Đã gửi Telegram",
        "qr_code": qr_code,
        "slot_id": slot_id,
        "entry_time": entry_time,
        "image_url": image_url,
    }