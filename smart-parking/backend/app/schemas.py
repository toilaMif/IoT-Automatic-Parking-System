from pydantic import BaseModel


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


class IssueRequest(BaseModel):
    qr_code: str | None = None
    message: str = "User reported an issue"
    phone: str | None = None


class SlotDetectRequest(BaseModel):
    slots: list[SlotStatus] | None = None
    source: str = "manual"
