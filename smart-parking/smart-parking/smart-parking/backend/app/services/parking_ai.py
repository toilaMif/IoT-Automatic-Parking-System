import json
from pathlib import Path

from app.config import YOLO_MODEL_PATH, YOLO_SLOT_CONFIG
from app.utils import get_now


VEHICLE_CLASSES = {
    "car",
    "truck",
    "bus",
    "motorcycle",
    "motorbike",
    "bicycle",
}

_model = None


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
    if not image_path or not YOLO_MODEL_PATH or not YOLO_SLOT_CONFIG:
        return detect_slots_from_payload(None, current_slots)

    image_file = Path(image_path)
    slot_file = Path(YOLO_SLOT_CONFIG)

    if not image_file.exists() or not slot_file.exists():
        return detect_slots_from_payload(None, current_slots)

    try:
        detections = detect_vehicle_boxes(str(image_file))
        slots = load_slot_boxes(slot_file)
        updated_at = get_now()

        return [
            {
                "slot_id": slot["slot_id"],
                "status": (
                    "occupied"
                    if any(box_intersects(slot["bbox"], box) for box in detections)
                    else "empty"
                ),
                "updated_at": updated_at,
            }
            for slot in slots
        ]
    except Exception as exc:
        print("YOLO slot detection error:", exc)
        return detect_slots_from_payload(None, current_slots)


def load_slot_boxes(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    slots = data.get("slots", data if isinstance(data, list) else [])

    normalized = []
    for slot in slots:
        slot_id = slot.get("slot_id") or slot.get("id")
        bbox = slot.get("bbox")
        if slot_id and isinstance(bbox, list) and len(bbox) == 4:
            normalized.append(
                {
                    "slot_id": str(slot_id),
                    "bbox": [float(value) for value in bbox],
                }
            )
    return normalized


def get_model():
    global _model
    if _model is None:
        from ultralytics import YOLO

        _model = YOLO(YOLO_MODEL_PATH)
    return _model


def detect_vehicle_boxes(image_path: str) -> list[list[float]]:
    model = get_model()
    results = model(image_path, verbose=False)
    boxes = []

    for result in results:
        names = result.names
        for box in result.boxes:
            class_id = int(box.cls[0])
            class_name = str(names.get(class_id, class_id)).lower()
            confidence = float(box.conf[0])

            if confidence < 0.35 or class_name not in VEHICLE_CLASSES:
                continue

            x1, y1, x2, y2 = box.xyxy[0].tolist()
            boxes.append([x1, y1, x2, y2])

    return boxes


def box_intersects(slot_box: list[float], detected_box: list[float]) -> bool:
    x1 = max(slot_box[0], detected_box[0])
    y1 = max(slot_box[1], detected_box[1])
    x2 = min(slot_box[2], detected_box[2])
    y2 = min(slot_box[3], detected_box[3])

    if x2 <= x1 or y2 <= y1:
        return False

    intersection = (x2 - x1) * (y2 - y1)
    slot_area = max((slot_box[2] - slot_box[0]) * (slot_box[3] - slot_box[1]), 1)
    return intersection / slot_area >= 0.12
