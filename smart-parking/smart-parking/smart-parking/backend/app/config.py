import os
from pathlib import Path

from dotenv import load_dotenv


APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(BACKEND_DIR / ".env.example")

UPLOAD_DIR = BACKEND_DIR / "uploads"
IMG_DIR = BACKEND_DIR / "img"
QR_DIR = IMG_DIR / "qrs"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
QR_DIR.mkdir(parents=True, exist_ok=True)

ESP32_CAM_STREAM_URL = os.getenv(
    "ESP32_CAM_STREAM_URL",
    "http://10.237.28.240:81/stream",
)
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://10.237.28.105:8000")

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
YOLO_MODEL_PATH = os.getenv("YOLO_MODEL_PATH", "")
YOLO_SLOT_CONFIG = os.getenv("YOLO_SLOT_CONFIG", "")
