import requests

from app.config import TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, UPLOAD_DIR


def telegram_ready() -> bool:
    return bool(TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID)


def send_message(text: str) -> bool:
    if not telegram_ready():
        print("Telegram is not configured")
        return False

    try:
        response = requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            data={"chat_id": TELEGRAM_CHAT_ID, "text": text},
            timeout=20,
        )
        print("Telegram message status:", response.status_code)
        return response.ok
    except Exception as exc:
        print("Telegram send message error:", exc)
        return False


def send_photo(photo_url: str | None, caption: str = "") -> bool:
    if not telegram_ready():
        print("Telegram is not configured")
        return False

    if not photo_url:
        return send_message(caption)

    try:
        filename = photo_url.split("?")[0].split("/")[-1]
        filepath = UPLOAD_DIR / filename

        if filepath.exists():
            with open(filepath, "rb") as photo_file:
                response = requests.post(
                    f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendPhoto",
                    data={"chat_id": TELEGRAM_CHAT_ID, "caption": caption},
                    files={"photo": photo_file},
                    timeout=60,
                )
        else:
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
        return response.ok
    except Exception as exc:
        print("Telegram send photo error:", exc)
        return False


def get_updates(offset: int = 0, timeout: int = 20) -> list[dict]:
    if not telegram_ready():
        return []

    try:
        response = requests.get(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getUpdates",
            params={
                "offset": offset,
                "timeout": timeout,
                "allowed_updates": '["message"]',
            },
            timeout=timeout + 5,
        )

        data = response.json()
        if not data.get("ok"):
            print("Telegram getUpdates failed:", data)
            return []

        return data.get("result", [])
    except Exception as exc:
        print("Telegram getUpdates error:", exc)
        return []
