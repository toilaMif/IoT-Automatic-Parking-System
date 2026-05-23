from random import randint

from app.config import ESP32_CAM_STREAM_URL
from app.utils import get_now


current_command = "idle"
last_updated = None
latest_qr = None
latest_camera_frame = None
esp32_cam_stream_url = ESP32_CAM_STREAM_URL
exit_gate_waiting = False
exit_gate_detected_at = None
telegram_offset = 0
telegram_polling_started = False

parking_slots = {
    "S1": {"slot_id": "S1", "status": "empty", "updated_at": get_now()},
    "S2": {"slot_id": "S2", "status": "empty", "updated_at": get_now()},
}

tickets = {}
ticket_history = []


def set_command(command: str) -> None:
    global current_command, last_updated
    current_command = command
    last_updated = get_now()


def get_empty_count() -> int:
    return sum(1 for slot in parking_slots.values() if slot["status"] == "empty")


def get_active_tickets() -> list[dict]:
    return [
        ticket for ticket in tickets.values()
        if ticket["status"] not in {"completed", "cancelled"}
    ]


def get_completed_tickets() -> list[dict]:
    return [
        ticket for ticket in tickets.values()
        if ticket["status"] == "completed"
    ]


def create_unique_qr_code() -> str:
    for _ in range(1000):
        qr_code = f"{randint(10000, 99999)}"
        if qr_code not in tickets:
            return qr_code
    raise RuntimeError("Cannot create unique QR code")


def make_ticket(qr_code: str, qr_data: str) -> dict:
    now = get_now()
    ticket = {
        "qr_code": qr_code,
        "full_data": qr_data,
        "status": "waiting_scan",
        "entry_time": None,
        "exit_time": None,
        "entry_image": None,
        "exit_image": None,
        "slot_id": None,
        "fee": 0,
        "payment_status": "unpaid",
        "scan_status": "pending",
        "created_at": now,
        "scanned_at": None,
        "updated_at": now,
    }
    tickets[qr_code] = ticket
    return ticket
