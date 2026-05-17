// src/pages/Dashboard.jsx
import { useEffect, useState } from "react";
import {
  API_BASE_URL,
  createQr,
  detectEntry,
  getLatestQr,
  getSlots,
  getTickets,
  turnCameraOff,
  turnCameraOn,
  updateSlots,
} from "../services/api.js";

// URL stream trực tiếp từ ESP32-CAM
const ESP32_STREAM_URL = "http://10.237.28.240:81/stream";

export default function Dashboard() {
  const [qr, setQr] = useState(null);
  const [slots, setSlots] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [data, setData] = useState("");

  const [loading, setLoading] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);

  const [error, setError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [imageError, setImageError] = useState("");

  // Dùng để reload stream camera
  const [streamKey, setStreamKey] = useState(Date.now());

  // =========================
  // DERIVED DATA
  // =========================
  const emptyCount = slots.filter((slot) => slot.status === "empty").length;

  const activeTickets = tickets.filter((ticket) => ticket.status === "active");

  // =========================
  // HELPERS
  // =========================
  function setQrResult(result) {
    setQr(result);
    setImageError("");
  }

  // =========================
  // LOAD QR MỚI NHẤT
  // =========================
  async function loadLatestQr() {
    try {
      const result = await getLatestQr();

      // Không có QR
      if (!result || !result.image_url) {
        setQr(null);
        setImageError("");
        return;
      }

      // Có QR
      setQrResult(result);
    } catch (err) {
      setQr(null);
      setImageError("");
    }
  }

  // =========================
  // LOAD TRẠNG THÁI BÃI XE
  // =========================
  async function loadParkingState() {
    try {
      const [slotResult, ticketResult] = await Promise.all([
        getSlots(),
        getTickets(),
      ]);

      setSlots(slotResult?.slots || []);
      setTickets(ticketResult?.tickets || []);
    } catch (err) {
      setError(err.message || "Không tải được trạng thái bãi xe");
    }
  }

  // =========================
  // TẠO QR THỦ CÔNG
  // =========================
  async function handleCreateQr(event) {
    event.preventDefault();

    if (!data.trim()) {
      setError("Vui lòng nhập nội dung QR");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const result = await createQr(data.trim());
      setQrResult(result);
      setData("");
    } catch (err) {
      setError(err.message || "Không tạo được QR");
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // BẬT/TẮT CAMERA
  // =========================
  async function handleCameraCommand(command) {
    try {
      setCameraLoading(true);
      setCameraError("");

      if (command === "on") {
        await turnCameraOn();
      } else {
        await turnCameraOff();
      }

      // Reload stream
      setStreamKey(Date.now());
    } catch (err) {
      setCameraError(err.message || "Không gửi được lệnh camera");
    } finally {
      setCameraLoading(false);
    }
  }

  // =========================
  // XE VÀO
  // =========================
  async function handleEntryDetect() {
    try {
      setLoading(true);
      setError("");

      const result = await detectEntry();

      if (!result.success) {
        setError(result.message || "Không tạo được vé vào cổng");
        return;
      }

      if (result?.ticket?.qr) {
        setQrResult(result.ticket.qr);
      }

      await loadParkingState();
    } catch (err) {
      setError(err.message || "Không gọi được detectEntry()");
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // DEMO YOLO
  // =========================
  async function handleDemoYoloUpdate() {
    try {
      setError("");

      const nextSlots = (
        slots.length
          ? slots
          : ["A1", "A2", "B1", "B2", "C1", "C2"].map((slot_id) => ({
              slot_id,
            }))
      ).map((slot, index) => ({
        slot_id: slot.slot_id,
        status: index % 3 === 0 ? "occupied" : "empty",
      }));

      await updateSlots(nextSlots);
      await loadParkingState();
    } catch (err) {
      setError(err.message || "Không cập nhật được slot");
    }
  }

  // =========================
  // INITIAL LOAD
  // =========================
  useEffect(() => {
    loadLatestQr();
    loadParkingState();

    const timer = window.setInterval(() => {
      loadLatestQr();
      loadParkingState();
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  // =========================
  // URLS
  // =========================
  const qrImageUrl = qr?.display_url || qr?.image_url || "";
  const streamUrl = `${ESP32_STREAM_URL}?t=${streamKey}`;

  // =========================
  // RENDER
  // =========================
  return (
    <main className="page">
      <section className="dashboard">
        {/* ================= TOPBAR ================= */}
        <div className="topbar">
          <div>
            <h1>Auto Parking TT</h1>
          </div>

          <section className="stats-grid">
            <div className="stat-card">
              <span>Chỗ trống</span>
              <strong>{emptyCount}</strong>
            </div>

            <div className="stat-card">
              <span>Tổng slot</span>
              <strong>{slots.length}</strong>
            </div>
          </section>

          <p className="api-badge">{API_BASE_URL}</p>

          {error ? (
            <p style={{ color: "red", marginTop: "8px" }}>{error}</p>
          ) : null}
        </div>

        {/* ================= MAIN GRID ================= */}
        <section className="screen-grid">
          {/* ============ CAMERA PANEL ============ */}
          <section className="camera-panel">
            <div className="section-heading compact">
              <h2>ESP32-CAM Live Stream</h2>

              <div className="actions">
                <button
                  type="button"
                  onClick={() => handleCameraCommand("on")}
                  disabled={cameraLoading}
                >
                  Camera ON
                </button>

                <button
                  type="button"
                  className="secondary"
                  onClick={() => handleCameraCommand("off")}
                  disabled={cameraLoading}
                >
                  Camera OFF
                </button>
              </div>
            </div>

            <div className="camera-view">
              <img
                key={streamKey}
                src={streamUrl}
                alt="ESP32-CAM Live Stream"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  borderRadius: "16px",
                }}
                onLoad={() => setCameraError("")}
                onError={() => setCameraError("Không kết nối được ESP32-CAM")}
              />
            </div>

            <div className="camera-meta">
              {cameraError ? <strong>{cameraError}</strong> : null}
            </div>
          </section>

          {/* ============ QR PANEL ============ */}
          <section className="slot-panel">
            <div className="qr-frame">
              {qrImageUrl ? (
                <img
                  key={qrImageUrl}
                  src={qrImageUrl}
                  alt="Mã QR Smart Parking"
                  onLoad={() => setImageError("")}
                  onError={() =>
                    setImageError(`Không tải được ảnh QR: ${qrImageUrl}`)
                  }
                />
              ) : null}
            </div>

            {imageError ? <p className="image-error">{imageError}</p> : null}

            <div className="qr-meta">
              {qr ? (
                <>
                  <h1 style={{ textAlign: "center" }}>Quét QR để vào cổng</h1>

                  <p style={{ textAlign: "center" }}>
                    {qr.created_at
                      ? `Tạo lúc ${new Date(qr.created_at).toLocaleString()}`
                      : ""}
                  </p>
                </>
              ) : null}
            </div>
          </section>

          {/* ============ SLOT MAP ============ */}
          <div className="qr-control">
            <div className="section-heading compact">
              <h2>Parking Slot Map</h2>

              <div className="actions">
                <button type="button" onClick={handleDemoYoloUpdate}>
                  Demo
                </button>

                <button
                  type="button"
                  className="secondary"
                  onClick={handleEntryDetect}
                  disabled={loading}
                >
                  Xe vào
                </button>
              </div>
            </div>

            <div className="slot-map">
              {slots.map((slot) => (
                <div key={slot.slot_id} className={`slot-tile ${slot.status}`}>
                  <strong>{slot.slot_id}</strong>
                  <span>{slot.status}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ============ PREVIEW ============ */}
          <aside className="preview" aria-live="polite"></aside>
        </section>
      </section>
    </main>
  );
}
