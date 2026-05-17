import { useEffect, useMemo, useState } from "react";
import {
  API_BASE_URL,
  CAMERA_STREAM_URL,
  createQr,
  detectEntry,
  detectSlots,
  exitByQr,
  getCameraStreamUrl,
  getCameraStatus,
  getLatestQr,
  getSlots,
  getStatus,
  getTickets,
  turnCameraOff,
  turnCameraOn,
  updateSlots,
} from "../services/api.js";

export default function Dashboard() {
  const [qr, setQr] = useState(null);
  const [slots, setSlots] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [status, setStatus] = useState(null);
  const [exitCode, setExitCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [error, setError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [cameraStatus, setCameraStatus] = useState("");
  const [streamMode, setStreamMode] = useState("direct");
  const [imageError, setImageError] = useState("");
  const [streamKey, setStreamKey] = useState(Date.now());

  const emptyCount = slots.filter((slot) => slot.status === "empty").length;
  const activeTickets = tickets.filter((ticket) => ticket.status !== "completed");
  const latestTicket = tickets[0] || null;

  const streamUrl = useMemo(
    () => getCameraStreamUrl(streamMode),
    [streamKey, streamMode]
  );

  function setQrResult(result) {
    const nextQr = result?.qr || result;
    setQr(nextQr?.image_url ? nextQr : null);
    setImageError("");
  }

  async function loadLatestQr() {
    try {
      const result = await getLatestQr();
      setQrResult(result);
    } catch {
      setQr(null);
    }
  }

  async function loadParkingState() {
    try {
      const [slotResult, ticketResult] = await Promise.all([
        getSlots(),
        getTickets(),
      ]);
      setSlots(slotResult?.slots || []);
      setTickets(ticketResult?.tickets || []);
      setError("");
    } catch (err) {
      setError(err.message || "Cannot load parking state");
    }
  }

  async function loadStatus() {
    try {
      const result = await getStatus();
      setStatus(result);
    } catch {
      setStatus(null);
    }
  }

  async function handleEntryDetect() {
    try {
      setLoading(true);
      setError("");
      const result = await detectEntry();
      if (!result.success) {
        setError(result.message || "Cannot create entry QR");
        return;
      }
      setQrResult(result);
      await loadParkingState();
    } catch (err) {
      setError(err.message || "Cannot call entry detect");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateQr() {
    try {
      setLoading(true);
      setError("");
      const result = await createQr();
      if (!result.success) {
        setError(result.message || "Cannot create QR");
        return;
      }
      setQrResult(result);
      await loadParkingState();
    } catch (err) {
      setError(err.message || "Cannot create QR");
    } finally {
      setLoading(false);
    }
  }

  async function handleExitSubmit(event) {
    event.preventDefault();
    if (!exitCode.trim()) {
      setError("Please enter the 5-digit ticket code");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const result = await exitByQr(exitCode.trim());
      if (!result.success) {
        setError(result.message || "Exit code rejected");
        return;
      }
      setExitCode("");
      await Promise.all([loadParkingState(), loadStatus()]);
    } catch (err) {
      setError(err.message || "Cannot process exit");
    } finally {
      setLoading(false);
    }
  }

  async function handleCameraCommand(command) {
    try {
      setCameraLoading(true);
      setCameraError("");
      if (command === "on") {
        await turnCameraOn();
      } else {
        await turnCameraOff();
      }
      setStreamKey(Date.now());
    } catch (err) {
      setCameraError(err.message || "Cannot send camera command");
    } finally {
      setCameraLoading(false);
    }
  }

  async function handleCameraStatus() {
    try {
      setCameraLoading(true);
      setCameraError("");
      const result = await getCameraStatus();
      if (result.success) {
        setCameraStatus(`Backend camera OK: ${result.camera_url}`);
      } else {
        setCameraStatus(`Backend camera error: ${result.error || result.status_code || "unknown"}`);
      }
    } catch (err) {
      setCameraStatus("");
      setCameraError(err.message || "Cannot check camera");
    } finally {
      setCameraLoading(false);
    }
  }

  async function handleDemoSlotUpdate() {
    try {
      setError("");
      const nextSlots = (
        slots.length
          ? slots
          : ["S1", "S2", "S3", "S4"].map((slot_id) => ({ slot_id }))
      ).map((slot, index) => ({
        slot_id: slot.slot_id,
        status: index % 3 === 0 ? "occupied" : "empty",
      }));
      await updateSlots(nextSlots);
      await loadParkingState();
    } catch (err) {
      setError(err.message || "Cannot update slots");
    }
  }

  async function handleDetectSlots() {
    try {
      setLoading(true);
      setError("");
      await detectSlots(null, "web");
      await loadParkingState();
    } catch (err) {
      setError(err.message || "Cannot detect slots");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLatestQr();
    loadParkingState();
    loadStatus();
    const timer = window.setInterval(() => {
      loadLatestQr();
      loadParkingState();
      loadStatus();
    }, 1500);
    return () => window.clearInterval(timer);
  }, []);

  const qrImageUrl = qr?.display_url || qr?.image_url || "";

  return (
    <main className="page">
      <section className="dashboard">
        <div className="topbar">
          <div>
            <p className="eyebrow">Smart Parking</p>
            <h1>Auto Parking TT</h1>
          </div>

          <section className="stats-grid">
            <div className="stat-card">
              <span>Empty</span>
              <strong>{emptyCount}</strong>
            </div>
            <div className="stat-card">
              <span>Total</span>
              <strong>{slots.length}</strong>
            </div>
            <div className="stat-card">
              <span>Active</span>
              <strong>{activeTickets.length}</strong>
            </div>
          </section>

          <p className="api-badge">{API_BASE_URL}</p>
          {error ? <p className="error">{error}</p> : null}
        </div>

        <section className="screen-grid">
          <section className="camera-panel">
            <div className="section-heading compact">
              <h2>ESP32-CAM</h2>
              <div className="actions">
                <button type="button" onClick={() => setStreamMode("direct")} disabled={streamMode === "direct"}>
                  Direct
                </button>
                <button type="button" className="secondary" onClick={() => setStreamMode("proxy")} disabled={streamMode === "proxy"}>
                  Proxy
                </button>
                <button type="button" onClick={() => handleCameraCommand("on")} disabled={cameraLoading}>
                  Camera ON
                </button>
                <button type="button" className="secondary" onClick={() => handleCameraCommand("off")} disabled={cameraLoading}>
                  Camera OFF
                </button>
                <button type="button" className="secondary" onClick={handleCameraStatus} disabled={cameraLoading}>
                  Test
                </button>
              </div>
            </div>

            <div className="camera-view">
              <img
                key={streamKey}
                src={streamUrl}
                alt="ESP32-CAM live stream"
                onLoad={() => setCameraError("")}
                onError={() => setCameraError("Cannot connect ESP32-CAM")}
              />
            </div>
            <div className="camera-meta">
              {cameraError ? (
                <strong>{cameraError}</strong>
              ) : (
                <span>
                  {streamMode === "direct" ? CAMERA_STREAM_URL : `${API_BASE_URL}/api/camera/stream`}
                </span>
              )}
              {cameraStatus ? <span>{cameraStatus}</span> : null}
            </div>
          </section>

          <section className="slot-panel">
            <div className="qr-frame">
              {qrImageUrl ? (
                <img
                  key={qrImageUrl}
                  src={qrImageUrl}
                  alt="Smart Parking QR"
                  onLoad={() => setImageError("")}
                  onError={() => setImageError(`Cannot load QR image: ${qrImageUrl}`)}
                />
              ) : (
                <span>No QR</span>
              )}
            </div>
            {imageError ? <p className="image-error">{imageError}</p> : null}
            <div className="qr-meta">
              <p className="label">Entry QR</p>
              <p className="qr-data">{qr?.data || "Waiting for entry sensor"}</p>
              <p className="time">{qr?.created_at ? `Created ${new Date(qr.created_at).toLocaleString()}` : ""}</p>
            </div>
          </section>

          <div className="qr-control">
            <div className="section-heading compact">
              <h2>Parking Slots</h2>
              <div className="actions">
                <button type="button" onClick={handleDemoSlotUpdate}>Demo</button>
                <button type="button" className="secondary" onClick={handleDetectSlots} disabled={loading}>Detect</button>
                <button type="button" className="secondary" onClick={handleEntryDetect} disabled={loading}>Entry</button>
                <button type="button" className="secondary" onClick={handleCreateQr} disabled={loading}>QR</button>
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

          <aside className="preview" aria-live="polite">
            <div>
              <div className="section-heading compact">
                <h2>Exit Gate</h2>
              </div>
              {status?.exit_gate_waiting ? (
                <div className="exit-alert">
                  <strong>Exit Gate</strong>
                  <span>Nhap so QR de ra</span>
                </div>
              ) : null}
              <form className="exit-form" onSubmit={handleExitSubmit}>
                <input
                  value={exitCode}
                  maxLength={12}
                  placeholder="12345"
                  onChange={(event) => setExitCode(event.target.value)}
                />
                <button type="submit" disabled={loading}>Open Exit</button>
              </form>

              <div className="ticket-list">
                {tickets.slice(0, 8).map((ticket) => (
                  <article key={ticket.qr_code} className="ticket-row">
                    <strong>{ticket.qr_code}</strong>
                    <span>{ticket.status}</span>
                    <small>{ticket.fee ? `${ticket.fee} VND` : ticket.entry_time || ticket.created_at}</small>
                  </article>
                ))}
              </div>
            </div>

            <div className="ticket-preview">
              <h2>Latest Ticket</h2>
              {latestTicket ? (
                <>
                  <p>QR {latestTicket.qr_code} - {latestTicket.status}</p>
                  <p>In: {latestTicket.entry_time || "-"}</p>
                  <p>Out: {latestTicket.exit_time || "-"}</p>
                  <p>Fee: {latestTicket.fee || 0} VND</p>
                  <div className="photo-grid">
                    {latestTicket.entry_image ? <img src={latestTicket.entry_image} alt="Entry vehicle" /> : <span>Entry image</span>}
                    {latestTicket.exit_image ? <img src={latestTicket.exit_image} alt="Exit vehicle" /> : <span>Exit image</span>}
                  </div>
                </>
              ) : (
                <p>No ticket yet</p>
              )}
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}
