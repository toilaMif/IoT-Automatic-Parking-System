from datetime import datetime
import threading
import time

import requests
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from app import store
from app.config import ESP32_CAM_STREAM_URL, IMG_DIR, PUBLIC_BASE_URL, QR_DIR, UPLOAD_DIR
from app.schemas import (
    CameraUrlRequest,
    CommandRequest,
    ExitQRRequest,
    IssueRequest,
    QRRequest,
    ScannedQRRequest,
    SlotDetectRequest,
    SlotsUpdateRequest,
)
from app.services.fee import calculate_fee
from app.services.parking_ai import (
    detect_slots_from_image,
    detect_slots_from_payload,
    normalize_slot_status,
)
from app.services.qr import generate_qr
from app.services.telegram import get_updates, send_message, send_photo, telegram_ready
from app.utils import extract_qr_code, get_now


app = FastAPI(title="Smart Parking API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/img", StaticFiles(directory=str(IMG_DIR)), name="img")


def clear_all_qr_files() -> None:
    for file in QR_DIR.glob("*.png"):
        try:
            file.unlink()
        except Exception as exc:
            print(f"Cannot delete {file}: {exc}")
    store.latest_qr = None


def build_upload_url(request: Request, filename: str) -> str:
    return str(request.base_url).rstrip("/") + f"/uploads/{filename}"


def build_qr_url(base_url: str, filename: str) -> str:
    return base_url.rstrip("/") + f"/img/qrs/{filename}"


def create_parking_qr(base_url: str) -> dict:
    if store.get_empty_count() <= 0:
        return {"success": False, "message": "Parking full", "empty_count": 0}

    clear_all_qr_files()

    qr_code = store.create_unique_qr_code()
    qr_data = f"PARKING-{qr_code}"
    filename = f"parking_{qr_code}.png"
    filepath = QR_DIR / filename
    generate_qr(qr_data, str(filepath))

    ticket = store.make_ticket(qr_code, qr_data)

    store.latest_qr = {
        "success": True,
        "data": qr_data,
        "qr_code": qr_code,
        "filename": filename,
        "image_url": build_qr_url(base_url, filename),
        "created_at": get_now(),
    }

    return {
        "success": True,
        "message": "QR created",
        "qr_code": qr_code,
        "empty_count": store.get_empty_count(),
        "qr": store.latest_qr,
        "ticket": ticket,
    }


def update_slot_map(slots: list[dict]) -> None:
    store.parking_slots.clear()
    for slot in slots:
        store.parking_slots[slot["slot_id"]] = slot


def capture_frame_from_stream(request: Request) -> str | None:
    previous_filename = (
        store.latest_camera_frame.get("filename")
        if store.latest_camera_frame else None
    )

    still_url = store.esp32_cam_stream_url.replace("/stream", "/capture")

    try:
        response = requests.get(still_url, timeout=(2, 4))
        content_type = response.headers.get("content-type", "")

        if response.status_code == 200 and "image" in content_type:
            filename = datetime.now().strftime("%Y%m%d_%H%M%S_%f") + ".jpg"
            filepath = UPLOAD_DIR / filename

            with open(filepath, "wb") as image_file:
                image_file.write(response.content)

            image_url = build_upload_url(request, filename)
            store.latest_camera_frame = {
                "success": True,
                "filename": filename,
                "image_url": image_url,
                "created_at": get_now(),
            }
            return image_url

        print("Camera capture HTTP:", response.status_code, content_type)
    except Exception as exc:
        print("Camera capture endpoint error:", exc)

    try:
        store.set_command("capture_image")
        deadline = time.time() + 12

        while time.time() < deadline:
            latest = store.latest_camera_frame
            if latest and latest.get("filename") != previous_filename:
                print("Camera upload received:", latest.get("image_url"))
                return latest.get("image_url")
            time.sleep(0.25)

        print("Camera upload wait timed out")
    except Exception as exc:
        print("Camera upload command error:", exc)

    try:
        response = requests.get(
            store.esp32_cam_stream_url,
            stream=True,
            timeout=(5, 10),
        )

        if response.status_code != 200:
            print("Camera stream HTTP:", response.status_code)
            response.close()
            return None

        buffer = b""
        jpg_bytes = None

        for chunk in response.iter_content(chunk_size=4096):
            if not chunk:
                continue

            buffer += chunk
            start = buffer.find(b"\xff\xd8")
            end = buffer.find(b"\xff\xd9")

            if start != -1 and end != -1 and end > start:
                jpg_bytes = buffer[start:end + 2]
                break

        response.close()

        if not jpg_bytes:
            return None

        filename = datetime.now().strftime("%Y%m%d_%H%M%S_%f") + ".jpg"
        filepath = UPLOAD_DIR / filename

        with open(filepath, "wb") as image_file:
            image_file.write(jpg_bytes)

        image_url = build_upload_url(request, filename)
        store.latest_camera_frame = {
            "success": True,
            "filename": filename,
            "image_url": image_url,
            "created_at": get_now(),
        }
        return image_url
    except Exception as exc:
        print("Capture frame error:", exc)
        return None


def latest_image_url() -> str | None:
    if store.latest_camera_frame:
        return store.latest_camera_frame.get("image_url")
    return None


def format_ticket_for_response(ticket: dict) -> dict:
    return {
        **ticket,
        "qr": store.latest_qr if store.latest_qr and store.latest_qr.get("qr_code") == ticket["qr_code"] else None,
    }


def handle_telegram_command(text: str) -> None:
    command = (text or "").strip().split()[0].lower()

    if command in {"/start", "/help"}:
        send_message(
            "Smart Parking commands:\n"
            "/qr - tao QR moi hien tren web\n"
            "/open_entry - mo cong vao\n"
            "/open_exit - mo cong ra\n"
            "/status - xem trang thai"
        )
        return

    if command in {"/qr", "/create_qr"}:
        result = create_parking_qr(PUBLIC_BASE_URL)
        if result.get("success"):
            qr = result["qr"]
            send_photo(
                qr.get("image_url"),
                f"QR moi: {result['qr_code']}\nQR da hien tren web.",
            )
        else:
            send_message(result.get("message", "Khong tao duoc QR"))
        return

    if command in {"/open_entry", "/mo_vao"}:
        store.set_command("open_entry_gate")
        send_message("Da gui lenh mo cong vao.")
        return

    if command in {"/open_exit", "/mo_ra"}:
        store.set_command("open_exit_gate")
        send_message("Da gui lenh mo cong ra.")
        return

    if command == "/status":
        send_message(
            "Smart Parking status\n"
            f"Command: {store.current_command}\n"
            f"Slot trong: {store.get_empty_count()}\n"
            f"Ve dang hoat dong: {len(store.get_active_tickets())}\n"
            f"Cho xe ra: {store.exit_gate_waiting}"
        )
        return

    if command.startswith("/"):
        send_message("Lenh khong hop le. Gui /help de xem lenh.")


def telegram_poll_loop() -> None:
    while True:
        updates = get_updates(store.telegram_offset, timeout=20)
        for update in updates:
            store.telegram_offset = max(
                store.telegram_offset,
                int(update.get("update_id", 0)) + 1,
            )
            message = update.get("message") or {}
            text = message.get("text") or ""
            if text:
                handle_telegram_command(text)
        time.sleep(1)


def start_telegram_polling() -> None:
    if store.telegram_polling_started or not telegram_ready():
        return

    store.telegram_polling_started = True
    thread = threading.Thread(target=telegram_poll_loop, daemon=True)
    thread.start()
    print("Telegram polling started")


@app.on_event("startup")
def startup_event():
    store.esp32_cam_stream_url = ESP32_CAM_STREAM_URL
    clear_all_qr_files()
    start_telegram_polling()


@app.get("/")
def root():
    return {"message": "Smart Parking API running", "time": get_now()}


@app.get("/api/status")
def get_status():
    active_count = len(store.get_active_tickets())
    return {
        "current_command": store.current_command,
        "last_updated": store.last_updated,
        "exit_gate_waiting": store.exit_gate_waiting,
        "exit_gate_detected_at": store.exit_gate_detected_at,
        "empty_count": store.get_empty_count(),
        "active_vehicles": active_count,
        "total_tickets": len(store.tickets),
        "camera_url": store.esp32_cam_stream_url,
    }


@app.get("/api/command")
def get_command():
    return {"command": store.current_command, "updated_at": store.last_updated}


@app.post("/api/command")
def update_command(payload: CommandRequest):
    store.set_command(payload.command)
    return {
        "success": True,
        "command": store.current_command,
        "updated_at": store.last_updated,
    }


@app.post("/api/reset")
def reset_command():
    store.set_command("idle")
    return {"success": True, "command": store.current_command}


@app.post("/api/camera/on")
def camera_on():
    store.set_command("camera_on")
    return {"success": True, "command": store.current_command}


@app.post("/api/camera/off")
def camera_off():
    store.set_command("camera_off")
    return {"success": True, "command": store.current_command}


@app.post("/api/camera/capture")
def camera_capture():
    store.set_command("capture_image")
    return {"success": True, "command": store.current_command}


@app.post("/api/upload")
async def upload_image(request: Request):
    image_bytes = await request.body()
    filename = datetime.now().strftime("%Y%m%d_%H%M%S_%f") + ".jpg"
    filepath = UPLOAD_DIR / filename

    with open(filepath, "wb") as image_file:
        image_file.write(image_bytes)

    store.latest_camera_frame = {
        "success": True,
        "filename": filename,
        "image_url": build_upload_url(request, filename),
        "created_at": get_now(),
    }

    return store.latest_camera_frame


@app.get("/api/camera/latest")
def get_latest_camera(request: Request):
    if store.latest_camera_frame:
        return store.latest_camera_frame

    images = sorted(
        UPLOAD_DIR.glob("*.jpg"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )

    if not images:
        return {"success": False, "message": "No image uploaded", "image_url": None}

    latest = images[0]
    return {
        "success": True,
        "filename": latest.name,
        "image_url": build_upload_url(request, latest.name),
        "created_at": datetime.fromtimestamp(latest.stat().st_mtime).isoformat(),
    }


@app.get("/api/camera/stream")
def camera_stream():
    def generate():
        try:
            with requests.get(
                store.esp32_cam_stream_url,
                stream=True,
                timeout=10,
            ) as response:
                if response.status_code != 200:
                    return
                for chunk in response.iter_content(chunk_size=1024):
                    if chunk:
                        yield chunk
        except Exception as exc:
            print("Camera stream error:", exc)

    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.get("/api/camera/status")
def camera_status():
    try:
        response = requests.get(store.esp32_cam_stream_url, timeout=5)
        return {
            "success": response.status_code == 200,
            "camera_url": store.esp32_cam_stream_url,
            "status_code": response.status_code,
        }
    except Exception as exc:
        return {
            "success": False,
            "camera_url": store.esp32_cam_stream_url,
            "error": str(exc),
        }


@app.post("/api/camera/set-url")
def set_camera_url(payload: CameraUrlRequest):
    store.esp32_cam_stream_url = payload.url
    return {"success": True, "camera_url": store.esp32_cam_stream_url}


@app.post("/api/entry/detect")
def entry_detect(request: Request):
    return create_parking_qr(str(request.base_url))


@app.post("/api/qr")
def create_qr(payload: QRRequest, request: Request):
    if payload.data == "":
        clear_all_qr_files()
        return {
            "success": True,
            "message": "QR cleared",
            "data": "",
            "image_url": None,
        }
    return create_parking_qr(str(request.base_url))


@app.get("/api/qr/latest")
def get_latest_qr():
    if store.latest_qr:
        return store.latest_qr
    return {
        "success": True,
        "data": "",
        "filename": None,
        "image_url": None,
        "created_at": None,
    }


@app.post("/api/qr/scanned")
def save_scanned_qr(payload: ScannedQRRequest):
    qr_code = extract_qr_code(payload.data)
    if not qr_code:
        return {"success": False, "message": "Invalid QR"}

    ticket = store.tickets.get(qr_code)
    if not ticket:
        return {"success": False, "message": "QR not found"}

    if ticket["status"] in {"entered", "parked", "exiting", "completed"}:
        return {"success": False, "message": "QR already used"}

    now = get_now()
    ticket["scan_status"] = "confirmed"
    ticket["status"] = "entered"
    ticket["entry_time"] = now
    ticket["scanned_at"] = now
    ticket["updated_at"] = now

    store.set_command("open_entry_gate")
    clear_all_qr_files()

    return {
        "success": True,
        "message": "QR scanned successfully",
        "qr_code": qr_code,
        "entry_time": ticket["entry_time"],
        "command": store.current_command,
        "ticket": ticket,
    }


@app.get("/api/qr/scanned/latest")
def get_latest_scanned_qr():
    scanned_items = [
        ticket for ticket in store.tickets.values()
        if ticket["scan_status"] == "confirmed"
    ]
    if not scanned_items:
        return {"success": False, "message": "No scanned QR", "data": None}

    latest_item = max(scanned_items, key=lambda item: item["scanned_at"] or "")
    return {"success": True, "data": latest_item}


@app.get("/api/active-qrs")
def get_active_qrs():
    active = store.get_active_tickets()
    return {"success": True, "items": active, "total": len(active)}


@app.post("/api/notify-entry/{qr_code}")
def notify_entry(qr_code: str, request: Request):
    ticket = store.tickets.get(qr_code)
    if not ticket:
        return {"success": False, "message": "QR not found"}

    image_url = capture_frame_from_stream(request) or latest_image_url()
    ticket["entry_image"] = image_url
    ticket["status"] = "parked"
    ticket["updated_at"] = get_now()

    caption = (
        "CAR ENTERED\n"
        f"QR: {qr_code}\n"
        f"Slot: {ticket.get('slot_id') or 'detecting'}\n"
        f"Entry time: {ticket.get('entry_time') or ticket.get('created_at')}"
    )
    telegram_sent = send_photo(image_url, caption)

    return {
        "success": True,
        "message": "Entry notification sent",
        "qr_code": qr_code,
        "image_url": image_url,
        "telegram_sent": telegram_sent,
        "ticket": ticket,
    }


@app.get("/api/slots")
def get_slots():
    return {
        "success": True,
        "slots": list(store.parking_slots.values()),
        "empty_count": store.get_empty_count(),
        "updated_at": get_now(),
    }


@app.post("/api/slots/update")
def update_slots(payload: SlotsUpdateRequest):
    updated_at = get_now()
    slots = []

    for slot in payload.slots:
        slots.append(
            {
                "slot_id": slot.slot_id,
                "status": normalize_slot_status(slot.status),
                "updated_at": updated_at,
            }
        )

    update_slot_map(slots)
    return {
        "success": True,
        "slots": list(store.parking_slots.values()),
        "empty_count": store.get_empty_count(),
        "updated_at": updated_at,
    }


@app.post("/api/slots/detect")
def detect_slots(payload: SlotDetectRequest, request: Request):
    image_url = capture_frame_from_stream(request) or latest_image_url()
    image_path = None

    if image_url:
        filename = image_url.split("?")[0].split("/")[-1]
        image_path = str(UPLOAD_DIR / filename)

    if payload.slots:
        slots = detect_slots_from_payload(payload.slots, store.parking_slots)
    else:
        slots = detect_slots_from_image(image_path, store.parking_slots)

    update_slot_map(slots)

    return {
        "success": True,
        "source": payload.source,
        "image_url": image_url,
        "slots": list(store.parking_slots.values()),
        "empty_count": store.get_empty_count(),
        "updated_at": get_now(),
    }


@app.post("/api/parking/motion-ended")
def parking_motion_ended(request: Request):
    image_url = latest_image_url() or capture_frame_from_stream(request)
    image_path = None
    if image_url:
        filename = image_url.split("?")[0].split("/")[-1]
        image_path = str(UPLOAD_DIR / filename)

    update_slot_map(detect_slots_from_image(image_path, store.parking_slots))
    return {
        "success": True,
        "message": "Motion ended, slots detected",
        "image_url": image_url,
        "slots": list(store.parking_slots.values()),
        "empty_count": store.get_empty_count(),
    }


@app.post("/api/exit/detect")
def exit_detect():
    store.exit_gate_waiting = True
    store.exit_gate_detected_at = get_now()
    store.set_command("wait_exit_code")
    return {
        "success": True,
        "message": "Exit vehicle detected",
        "command": store.current_command,
        "exit_gate_waiting": store.exit_gate_waiting,
        "exit_gate_detected_at": store.exit_gate_detected_at,
    }


@app.post("/api/exit/cancel")
def exit_cancel():
    store.exit_gate_waiting = False
    store.exit_gate_detected_at = None
    if store.current_command == "wait_exit_code":
        store.set_command("idle")
    return {"success": True, "exit_gate_waiting": False}


@app.post("/api/exit/by-qr")
def process_exit_by_qr(payload: ExitQRRequest, request: Request):
    qr_code = extract_qr_code(payload.qr_code)
    if not qr_code:
        return {"success": False, "message": "Invalid QR code"}

    ticket = store.tickets.get(qr_code)
    if not ticket:
        return {"success": False, "message": "QR not found"}

    if ticket["status"] not in {"entered", "parked", "exiting"}:
        return {"success": False, "message": "Ticket is not inside the parking lot"}

    entry_value = ticket.get("entry_time") or ticket.get("created_at")
    entry_time = datetime.fromisoformat(entry_value)
    duration_hours = max((datetime.now() - entry_time).total_seconds() / 3600, 0.01)
    fee = calculate_fee(duration_hours)

    image_url = capture_frame_from_stream(request) or latest_image_url()
    now = get_now()

    ticket["exit_time"] = now
    ticket["exit_image"] = image_url
    ticket["fee"] = fee
    ticket["payment_status"] = "paid"
    ticket["status"] = "completed"
    ticket["updated_at"] = now

    slot_id = ticket.get("slot_id")
    if slot_id in store.parking_slots:
        store.parking_slots[slot_id]["status"] = "empty"
        store.parking_slots[slot_id]["updated_at"] = now

    store.ticket_history.append(ticket.copy())
    store.exit_gate_waiting = False
    store.exit_gate_detected_at = None
    store.set_command("open_exit_gate")

    caption = (
        "CAR EXITED\n"
        f"QR: {qr_code}\n"
        f"Entry time: {ticket['entry_time']}\n"
        f"Exit time: {ticket['exit_time']}\n"
        f"Fee: {fee} VND"
    )
    telegram_sent = send_photo(image_url, caption)

    return {
        "success": True,
        "message": "Exit approved",
        "qr_code": qr_code,
        "entry_time": ticket["entry_time"],
        "exit_time": ticket["exit_time"],
        "duration_hours": round(duration_hours, 2),
        "fee": fee,
        "command": store.current_command,
        "telegram_sent": telegram_sent,
        "ticket": ticket,
    }


@app.get("/api/tickets")
def get_tickets():
    items = sorted(
        store.tickets.values(),
        key=lambda ticket: ticket.get("updated_at") or ticket.get("created_at") or "",
        reverse=True,
    )
    return {
        "success": True,
        "tickets": [format_ticket_for_response(ticket) for ticket in items],
        "active": store.get_active_tickets(),
        "history": store.ticket_history,
        "total": len(items),
    }


@app.get("/api/tickets/{qr_code}")
def get_ticket(qr_code: str):
    code = extract_qr_code(qr_code)
    ticket = store.tickets.get(code) if code else None
    if not ticket:
        return {"success": False, "message": "Ticket not found"}
    return {"success": True, "ticket": format_ticket_for_response(ticket)}


@app.post("/api/report-issue")
def report_issue(payload: IssueRequest):
    code = extract_qr_code(payload.qr_code) if payload.qr_code else None
    caption = (
        "PARKING ISSUE\n"
        f"QR: {code or 'unknown'}\n"
        f"Phone: {payload.phone or 'unknown'}\n"
        f"Message: {payload.message}\n"
        f"Time: {get_now()}"
    )
    sent = send_message(caption)
    return {"success": True, "telegram_sent": sent}


@app.get("/api/telegram/status")
def telegram_status():
    return {
        "success": True,
        "configured": telegram_ready(),
    }


@app.post("/api/telegram/open-entry")
def telegram_open_entry():
    store.set_command("open_entry_gate")
    return {"success": True, "command": store.current_command}


@app.post("/api/telegram/open-exit")
def telegram_open_exit():
    store.set_command("open_exit_gate")
    return {"success": True, "command": store.current_command}
