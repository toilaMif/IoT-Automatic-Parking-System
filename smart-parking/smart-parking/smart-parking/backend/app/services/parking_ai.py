from app.utils import get_now


def normalize_slot_status(status: str) -> str:
    status = (status or "").lower()
    if status in {"empty", "occupied"}:
        return status
    return "empty"


def detect_slots_from_payload(payload_slots, current_slots: dict) -> list[dict]:
    if not payload_slots:
        return [
            {
                "slot_id": slot["slot_id"],
                "status": slot["status"],
                "updated_at": get_now(),
            }
            for slot in current_slots.values()
        ]

    updated_at = get_now()
    return [
        {
            "slot_id": slot.slot_id,
            "status": normalize_slot_status(slot.status),
            "updated_at": updated_at,
        }
        for slot in payload_slots
    ]


def detect_slots_from_image(image_path: str | None, current_slots: dict) -> list[dict]:
    # Placeholder for YOLO/OpenCV integration. For now the system keeps the
    # latest known slot map so ESP32-CAM + AI can be wired in without changing API.
    return detect_slots_from_payload(None, current_slots)
