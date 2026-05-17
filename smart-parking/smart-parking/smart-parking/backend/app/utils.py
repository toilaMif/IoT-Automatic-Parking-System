from datetime import datetime
import re


def get_now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def extract_qr_code(data: str | None) -> str | None:
    if not data:
        return None

    match = re.search(r"(?:PARKING-)?(\d{5})", data.strip())
    if not match:
        return None

    return match.group(1)
