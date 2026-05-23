# Huong dan lam model nhan dien vi tri trong bai do xe

Tai lieu nay giai thich cach phan AI trong backend dang hoat dong va cach cau hinh de he thong tu nhan biet o nao con trong.

## 1. Cach project dang nhan dien slot

Backend khong nhan dien truc tiep "o trong". Luong xu ly hien tai nam trong `app/services/parking_ai.py`:

1. ESP32-CAM chup anh bai do xe.
2. Backend dung YOLO de tim cac phuong tien trong anh: `car`
3. Backend doc file cau hinh toa do tung o do xe.
4. Neu bounding box cua xe cat vao bounding box cua slot tu 12% tro len thi slot do la `occupied`.
5. Slot khong co xe cat vao thi la `empty`.

Nghia la can co 2 thanh phan:

- File model YOLO, vi du `models/yolov8n.pt` hoac model tu train.
- File cau hinh toa do cac slot, vi du `config/slots.json`.

## 2. Chuan bi moi truong backend

Mo terminal tai thu muc backend:

```powershell
cd smart-parking\backend
```

Cai thu vien:

```powershell
pip install -r requirements.txt
```

Neu chua co file `.env`, copy tu `.env.example`:

```powershell
copy .env.example .env
```

## 3. Chon model YOLO

Cach nhanh nhat la dung model YOLO co san cua Ultralytics, vi project da cai `ultralytics`.

Tao thu muc:

```powershell
mkdir models
```

Dat file model vao:

```text
smart-parking/backend/models/yolov8n.pt
```

Co the dung:

- `yolov8n.pt`: nhe, chay nhanh, phu hop demo.
- `yolov8s.pt`: chinh xac hon mot chut nhung nang hon.
- Model tu train rieng neu camera dat goc xau, anh toi, xe bi che nhieu.

Neu dung model YOLO mac dinh, cac class xe nhu `car`, `truck`, `bus`, `motorcycle`, `bicycle` da co san.

## 4. Tao file toa do slot

Tao thu muc:

```powershell
mkdir config
```

Tao file:

```text
smart-parking/backend/config/slots.json
```

Vi du noi dung:

```json
{
  "slots": [
    { "slot_id": "S1", "bbox": [120, 180, 310, 420] },
    { "slot_id": "S2", "bbox": [330, 180, 520, 420] },
    { "slot_id": "S3", "bbox": [540, 180, 730, 420] }
  ]
}
```

Trong do `bbox` co dang:

```text
[x1, y1, x2, y2]
```

Y nghia:

- `x1`, `y1`: goc trai tren cua o do xe.
- `x2`, `y2`: goc phai duoi cua o do xe.
- Don vi la pixel theo anh chup tu ESP32-CAM.

## 5. Cach lay toa do slot

Lam theo cach don gian:

1. Chay camera ESP32-CAM va chup mot anh mau cua bai do xe.
2. Mo anh trong cong cu nhu Paint, Roboflow Annotate, CVAT, LabelImg, hoac bat ky tool nao co hien toa do pixel.
3. Ve hinh chu nhat quanh tung o do xe.
4. Ghi lai toa do `x1, y1, x2, y2` cua moi o vao `config/slots.json`.

Luu y quan trong:

- Camera nen co dinh mot vi tri. Neu camera bi lech, toa do slot se sai.
- Anh dung de lay toa do phai cung do phan giai voi anh ESP32-CAM gui ve backend.
- Bounding box slot nen bao quanh vung xe se nam trong o, khong nen qua rong sang o ben canh.

## 6. Cau hinh `.env`

Mo file `.env` trong backend va dien:

```env
YOLO_MODEL_PATH=models/yolov8n.pt
YOLO_SLOT_CONFIG=config/slots.json
```

Neu dung duong dan tuyet doi cung duoc, vi du thay bang duong dan may cua ban:

```env
YOLO_MODEL_PATH=C:\path\to\IOT_CK\smart-parking\backend\models\yolov8n.pt
YOLO_SLOT_CONFIG=C:\path\to\IOT_CK\smart-parking\backend\config\slots.json
```

## 7. Chay backend

Tai thu muc backend:

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Kiem tra backend:

```text
http://localhost:8000/api/status
```

## 8. Goi API detect slot

Khi bam nut detect tren web, web se goi API:

```http
POST /api/slots/detect
```

Backend se:

1. Chup frame tu ESP32-CAM.
2. Chay YOLO tren anh vua chup.
3. So sanh xe voi toa do slot.
4. Cap nhat trang thai slot.

Test bang PowerShell:

```powershell
Invoke-RestMethod -Uri http://localhost:8000/api/slots/detect -Method Post -ContentType "application/json" -Body '{"slots":null,"source":"test"}'
```

Xem ket qua:

```powershell
Invoke-RestMethod -Uri http://localhost:8000/api/slots -Method Get
```

Ket qua mong doi:

```json
{
  "success": true,
  "slots": [
    { "slot_id": "S1", "status": "occupied", "updated_at": "..." },
    { "slot_id": "S2", "status": "empty", "updated_at": "..." }
  ],
  "empty_count": 1
}
```

## 9. Neu detect sai thi chinh o dau

Trong `app/services/parking_ai.py` co 2 nguong quan trong:

```python
if confidence < 0.35:
```

Nguong nay loc ket qua YOLO. Neu model bo sot xe, giam xuong `0.25`. Neu nhan nham vat khac thanh xe, tang len `0.45`.

```python
return intersection / slot_area >= 0.12
```

Nguong nay quyet dinh xe cat vao slot bao nhieu thi tinh la co xe. Neu xe nam trong slot nhung bi bao `empty`, giam xuong `0.08`. Neu xe o slot ben canh lam nham sang slot nay, tang len `0.18`.

## 10. Khi nao can train model rieng

Dung YOLO co san la du cho demo neu camera nhin ro xe. Can train model rieng khi:

- Camera dat cao/thap lam xe khac hinh dang binh thuong.
- Bai do xe toi, mo, nhieu bong.
- Xe may nho hoac bi che khuat nhieu.
- YOLO mac dinh hay nhan sai vat the trong bai.

Neu train rieng, dataset can co anh tu dung camera ESP32-CAM cua bai do xe that. Label cac xe trong anh, train YOLO, sau do thay `YOLO_MODEL_PATH` tro toi file `best.pt`.

## 11. Tom tat file lien quan

- `app/services/parking_ai.py`: logic YOLO va so sanh bounding box.
- `app/config.py`: doc bien moi truong `YOLO_MODEL_PATH`, `YOLO_SLOT_CONFIG`.
- `app/main.py`: API `/api/slots/detect` va `/api/parking/motion-ended`.
- `.env`: noi cau hinh duong dan model va file slot.
- `requirements.txt`: co `ultralytics` de chay YOLO.
