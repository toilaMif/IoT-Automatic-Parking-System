import os
import qrcode


def generate_qr(data: str, path: str = "img/qr.jpg") -> str:
    # Tạo thư mục cha nếu chưa tồn tại
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)

    img = qrcode.make(data)
    img.save(path)

    return path