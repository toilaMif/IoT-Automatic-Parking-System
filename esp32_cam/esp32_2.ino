/*
  ESP32-S3 CAMERA CLIENT + LIVE STREAM SERVER
  ==========================================
  Features:
  1. Connect WiFi
  2. Start camera
  3. Start HTTP MJPEG stream:
       http://ESP32_IP:81/stream
  4. Poll FastAPI every 2 seconds:
       GET /api/command
  5. Execute commands:
       - capture_image
       - camera_on
       - camera_off
  6. Upload image to FastAPI:
       POST /api/upload
*/

#include "esp_camera.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <WebServer.h>

// =========================
// WIFI CONFIG
// =========================
const char* ssid = "111";
const char* password = "11111111t";

// =========================
// FASTAPI SERVER
// =========================
const char* serverUrl = "http://10.237.28.105:8000";

// =========================
// STREAM SERVER
// =========================
WebServer streamServer(81);

// =========================
// CAMERA PINS
// =========================
#define PWDN_GPIO_NUM     -1
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM     15
#define SIOD_GPIO_NUM      4
#define SIOC_GPIO_NUM      5
#define Y9_GPIO_NUM       16
#define Y8_GPIO_NUM       17
#define Y7_GPIO_NUM       18
#define Y6_GPIO_NUM       12
#define Y5_GPIO_NUM       10
#define Y4_GPIO_NUM        8
#define Y3_GPIO_NUM        9
#define Y2_GPIO_NUM       11
#define VSYNC_GPIO_NUM     6
#define HREF_GPIO_NUM      7
#define PCLK_GPIO_NUM     13

bool cameraReady = false;

// =========================
// WIFI
// =========================
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi connected!");
  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());
}

// =========================
// CAMERA INIT
// =========================
bool initCamera() {
  if (cameraReady) return true;

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;

  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;

  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;

  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;

  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;

  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;

  if (psramFound()) {
    config.frame_size = FRAMESIZE_VGA;  // Better for streaming
    config.jpeg_quality = 12;
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = 15;
    config.fb_count = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed: 0x%x\n", err);
    return false;
  }

  cameraReady = true;
  Serial.println("Camera initialized.");
  return true;
}

// =========================
// STOP CAMERA
// =========================
void stopCamera() {
  if (cameraReady) {
    esp_camera_deinit();
    cameraReady = false;
    Serial.println("Camera stopped.");
  }
}

// =========================
// MJPEG STREAM HANDLER
// =========================
void handleStream() {
  WiFiClient client = streamServer.client();

  String response =
    "HTTP/1.1 200 OK\r\n"
    "Content-Type: multipart/x-mixed-replace; boundary=frame\r\n\r\n";

  client.print(response);

  while (client.connected()) {
    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) continue;

    client.printf("--frame\r\n");
    client.printf("Content-Type: image/jpeg\r\n");
    client.printf("Content-Length: %u\r\n\r\n", fb->len);
    client.write(fb->buf, fb->len);
    client.print("\r\n");

    esp_camera_fb_return(fb);

    delay(100);  // ~10 FPS
  }
}

// =========================
// SINGLE JPEG CAPTURE HANDLER
// =========================
void handleCapture() {
  if (!cameraReady) {
    streamServer.send(503, "text/plain", "Camera not ready");
    return;
  }

  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    streamServer.send(500, "text/plain", "Capture failed");
    return;
  }

  WiFiClient client = streamServer.client();
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: image/jpeg");
  client.printf("Content-Length: %u\r\n", fb->len);
  client.println("Connection: close");
  client.println();
  client.write(fb->buf, fb->len);

  esp_camera_fb_return(fb);
}

// =========================
// START STREAM SERVER
// =========================
void startStreamServer() {
  streamServer.on("/stream", HTTP_GET, handleStream);
  streamServer.on("/capture", HTTP_GET, handleCapture);
  streamServer.begin();

  Serial.println("MJPEG stream started.");
  Serial.print("Stream URL: http://");
  Serial.print(WiFi.localIP());
  Serial.println(":81/stream");
  Serial.print("Capture URL: http://");
  Serial.print(WiFi.localIP());
  Serial.println(":81/capture");
}

// =========================
// UPLOAD IMAGE
// =========================
void captureImage() {
  if (!cameraReady) return;

  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) return;

  HTTPClient http;
  String url = String(serverUrl) + "/api/upload";

  http.begin(url);
  http.setTimeout(30000);
  http.addHeader("Content-Type", "image/jpeg");

  int code = http.POST(fb->buf, fb->len);

  Serial.printf("Upload HTTP Code: %d\n", code);
  if (code > 0) {
    Serial.println(http.getString());
  }

  http.end();
  esp_camera_fb_return(fb);
}

// =========================
// GET COMMAND
// =========================
String getCommand() {
  HTTPClient http;
  String url = String(serverUrl) + "/api/command";

  if (!http.begin(url)) return "idle";

  int code = http.GET();
  if (code != 200) {
    http.end();
    return "idle";
  }

  String payload = http.getString();
  http.end();

  DynamicJsonDocument doc(512);
  if (deserializeJson(doc, payload)) return "idle";

  return doc["command"].as<String>();
}

// =========================
// RESET COMMAND
// =========================
void resetCommand() {
  HTTPClient http;
  String url = String(serverUrl) + "/api/reset";

  if (!http.begin(url)) return;

  http.addHeader("Content-Type", "application/json");
  http.POST("{}");
  http.end();
}

// =========================
// SETUP
// =========================
void setup() {
  Serial.begin(115200);
  delay(2000);

  connectWiFi();

  if (initCamera()) {
    startStreamServer();
    
  }
}

// =========================
// LOOP
// =========================
void loop() {
  streamServer.handleClient();

  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  static unsigned long lastPoll = 0;

  if (millis() - lastPoll > 2000) {
    lastPoll = millis();

    String cmd = getCommand();
    Serial.println("Command: " + cmd);

    if (cmd == "capture_image") {
      captureImage();
      resetCommand();
    }
    else if (cmd == "camera_off") {
      stopCamera();
      resetCommand();
    }
    else if (cmd == "camera_on") {
      if (!cameraReady && initCamera()) {
        startStreamServer();
      }
      resetCommand();
    }
  }
}
