// services/api.js

const DEFAULT_API_URL =
  typeof window === "undefined"
    ? "http://localhost:8000"
    : `http://${window.location.hostname}:8000`;

const API_BASE_URL = import.meta.env.VITE_API_URL || DEFAULT_API_URL;
const DEFAULT_CAMERA_STREAM_URL = "http://localhost:81/stream";
const CAMERA_STREAM_URL =
  import.meta.env.VITE_CAMERA_STREAM_URL || DEFAULT_CAMERA_STREAM_URL;

// ======================================================
// NORMALIZE QR IMAGE URL
// ======================================================
function normalizeQrPayload(payload) {
  if (!payload?.filename && !payload?.image_url) {
    return payload;
  }

  const apiUrl = new URL(API_BASE_URL);

  const imageUrl = payload.filename
    ? new URL(`/img/qrs/${payload.filename}`, apiUrl)
    : new URL(payload.image_url);

  imageUrl.protocol = apiUrl.protocol;
  imageUrl.hostname = apiUrl.hostname;
  imageUrl.port = apiUrl.port;
  imageUrl.searchParams.set(
    "v",
    payload.created_at || Date.now().toString()
  );

  return {
    ...payload,
    image_url: imageUrl.toString(),
    display_url: imageUrl.toString(),
  };
}

// ======================================================
// NORMALIZE CAMERA IMAGE URL
// ======================================================
function normalizeCameraPayload(payload) {
  if (!payload?.filename && !payload?.image_url) {
    return payload;
  }

  const apiUrl = new URL(API_BASE_URL);

  const imageUrl = payload.filename
    ? new URL(`/uploads/${payload.filename}`, apiUrl)
    : new URL(payload.image_url);

  imageUrl.protocol = apiUrl.protocol;
  imageUrl.hostname = apiUrl.hostname;
  imageUrl.port = apiUrl.port;
  imageUrl.searchParams.set(
    "v",
    payload.created_at || Date.now().toString()
  );

  return {
    ...payload,
    image_url: imageUrl.toString(),
    display_url: imageUrl.toString(),
  };
}

// ======================================================
// BUILD LIVE STREAM URL
// ======================================================
export function getCameraStreamUrl(mode = "direct") {
  if (mode === "direct") {
    const directUrl = new URL(CAMERA_STREAM_URL);
    directUrl.searchParams.set("t", Date.now().toString());
    return directUrl.toString();
  }

  const apiUrl = new URL(API_BASE_URL);
  const streamUrl = new URL("/api/camera/stream", apiUrl);

  // Cache busting
  streamUrl.searchParams.set("t", Date.now().toString());

  return streamUrl.toString();
}

// ======================================================
// GENERIC REQUEST
// ======================================================
async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Khong the ket noi API");
  }

  return response.json();
}

// ======================================================
// STATUS APIs
// ======================================================
export function getStatus() {
  return request("/api/status");
}

// ======================================================
// QR APIs
// ======================================================
export function createQr(data) {
  return request("/api/qr", {
    method: "POST",
    body: JSON.stringify({ data: data || null }),
  }).then((payload) => ({
    ...payload,
    qr: normalizeQrPayload(payload.qr),
  }));
}

export function getLatestQr() {
  return request("/api/qr/latest").then(normalizeQrPayload);
}

// ======================================================
// CAMERA APIs
// ======================================================
export function getLatestCameraFrame() {
  return request("/api/camera/latest").then(normalizeCameraPayload);
}

export function turnCameraOn() {
  return request("/api/camera/on", {
    method: "POST",
  });
}

export function turnCameraOff() {
  return request("/api/camera/off", {
    method: "POST",
  });
}

export function captureCameraImage() {
  return request("/api/camera/capture", {
    method: "POST",
  });
}

export function getCameraStatus() {
  return request("/api/camera/status");
}

export function setCameraUrl(url) {
  return request("/api/camera/set-url", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

// ======================================================
// PARKING SLOT APIs
// ======================================================
export function getSlots() {
  return request("/api/slots");
}

export function updateSlots(slots) {
  return request("/api/slots/update", {
    method: "POST",
    body: JSON.stringify({ slots }),
  });
}

export function detectSlots(slots = null, source = "web") {
  return request("/api/slots/detect", {
    method: "POST",
    body: JSON.stringify({ slots, source }),
  });
}

// ======================================================
// ENTRY APIs
// ======================================================
export function detectEntry() {
  return request("/api/entry/detect", {
    method: "POST",
  }).then((payload) => {
    if (payload?.qr) {
      return {
        ...payload,
        qr: normalizeQrPayload(payload.qr),
      };
    }

    return payload;
  });
}

// ======================================================
// TICKET APIs
// ======================================================
export function getTickets() {
  return request("/api/tickets");
}

export function getTicket(ticketId) {
  return request(`/api/tickets/${ticketId}`);
}

export function exitByQr(qrCode) {
  return request("/api/exit/by-qr", {
    method: "POST",
    body: JSON.stringify({ qr_code: qrCode }),
  });
}

export function reportIssue(message, qrCode = "") {
  return request("/api/report-issue", {
    method: "POST",
    body: JSON.stringify({ message, qr_code: qrCode }),
  });
}

// ======================================================
// EXPORTS
// ======================================================
export { API_BASE_URL, CAMERA_STREAM_URL };
