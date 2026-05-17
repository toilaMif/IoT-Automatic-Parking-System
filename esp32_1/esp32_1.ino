/*
  SMART PARKING ENTRY GATE
  =======================
  Chức năng:
  1. Dùng HC-SR04 phát hiện xe đến.
  2. Gọi FastAPI tạo QR.
  3. Chờ app mobile quét đúng QR.
  4. Mở barrier.
  5. Giữ cổng mở cho đến khi xe đi qua cảm biến.
  6. Khi xe đi khỏi cảm biến -> đóng cổng.
  7. Sau khi đóng cổng -> gọi API gửi Telegram
     (mã QR 5 số + ảnh xe + thời gian vào).
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <ESP32Servo.h>

// =====================================================
// WIFI CONFIG
// =====================================================
const char* ssid = "111";
const char* password = "11111111t";

// =====================================================
// FASTAPI SERVER
// =====================================================
const char* serverUrl = "http://10.237.28.105:8000";

// =====================================================
// HC-SR04 PINS
// =====================================================
#define TRIG_PIN 35
#define ECHO_PIN 36

// =====================================================
// SERVO PIN
// =====================================================
#define SERVO_PIN 21

// =====================================================
// SETTINGS
// =====================================================
const float DETECT_DISTANCE_CM = 5.0;
const unsigned long CHECK_INTERVAL = 300;
const unsigned long SCAN_CHECK_INTERVAL = 1000;

const int SERVO_CLOSE_ANGLE = 0;
const int SERVO_OPEN_ANGLE = 90;

// =====================================================
// STATES
// =====================================================
enum GateState {
  IDLE,
  WAIT_FOR_SCAN,
  GATE_OPEN
};

GateState gateState = IDLE;

// =====================================================
// GLOBAL VARIABLES
// =====================================================
Servo gateServo;

String currentQrCode = "";

unsigned long lastDistanceCheck = 0;
unsigned long lastScanCheck = 0;

// =====================================================
// FUNCTION PROTOTYPES
// =====================================================
void connectWiFi();
float readDistanceCM();
bool isVehicleDetected();
void openGate();
void closeGate();
void createQR();
void clearQR();
void checkScannedQR();
void notifyEntryToTelegram();
void printState();

// =====================================================
// WIFI
// =====================================================
void connectWiFi() {
  Serial.print("Connecting WiFi");

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi connected!");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
}

// =====================================================
// READ DISTANCE
// =====================================================
float readDistanceCM() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);

  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000);

  if (duration == 0) {
    return 999.0;
  }

  return duration * 0.0343 / 2.0;
}

// =====================================================
// VEHICLE DETECTED?
// =====================================================
bool isVehicleDetected() {
  float distance = readDistanceCM();

  Serial.print("Distance: ");
  Serial.print(distance);
  Serial.println(" cm");

  return distance <= DETECT_DISTANCE_CM;
}

// =====================================================
// OPEN GATE
// =====================================================
void openGate() {
  Serial.println("Opening gate...");
  gateServo.write(SERVO_OPEN_ANGLE);
}

// =====================================================
// CLOSE GATE
// =====================================================
void closeGate() {
  Serial.println("Closing gate...");
  gateServo.write(SERVO_CLOSE_ANGLE);
}

// =====================================================
// CREATE QR
// =====================================================
void createQR() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(serverUrl) + "/api/qr";

  Serial.println("Creating QR...");
  Serial.println("POST " + url);

  http.begin(url);
  http.setTimeout(10000);
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.POST("{\"data\": null}");

  Serial.print("HTTP Code: ");
  Serial.println(httpCode);

  if (httpCode > 0) {
    String response = http.getString();
    Serial.println(response);

    // Nếu bãi đầy
    if (response.indexOf("\"success\":false") >= 0 ||
        response.indexOf("\"success\": false") >= 0) {
      Serial.println("Parking Full.");
      currentQrCode = "";
      http.end();
      return;
    }

    // Parse qr_code
    int pos = response.indexOf("\"qr_code\":\"");
    if (pos >= 0) {
      pos += 11;
      int endPos = response.indexOf("\"", pos);

      if (endPos > pos) {
        currentQrCode = response.substring(pos, endPos);

        Serial.print("Current QR Code: ");
        Serial.println(currentQrCode);
      }
    }
  }

  http.end();
}

// =====================================================
// CLEAR QR
// =====================================================
void clearQR() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(serverUrl) + "/api/qr";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.POST("{\"data\":\"\"}");
  http.end();

  currentQrCode = "";
}

// =====================================================
// CHECK SCANNED QR
// =====================================================
void checkScannedQR() {
  if (gateState != WAIT_FOR_SCAN) return;
  if (currentQrCode == "") return;
  if (WiFi.status() != WL_CONNECTED) return;

  if (millis() - lastScanCheck < SCAN_CHECK_INTERVAL) {
    return;
  }

  lastScanCheck = millis();

  HTTPClient http;
  String url = String(serverUrl) + "/api/qr/scanned/latest";

  http.begin(url);
  http.setTimeout(5000);

  int httpCode = http.GET();

  if (httpCode == 200) {
    String response = http.getString();

    Serial.println("Scan check response:");
    Serial.println(response);

    String pattern = "\"qr_code\":\"" + currentQrCode + "\"";

    if (response.indexOf(pattern) >= 0) {
      Serial.println("Correct QR scanned!");

      openGate();
      gateState = GATE_OPEN;
    }
  }

  http.end();
}

// =====================================================
// SEND TELEGRAM NOTIFICATION
// =====================================================
void notifyEntryToTelegram() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (currentQrCode == "") return;

  HTTPClient http;
  String url = String(serverUrl) + "/api/notify-entry/" + currentQrCode;

  Serial.println("Sending Telegram notification...");
  Serial.println(url);

  http.begin(url);

  // Tăng timeout lên 60 giây
  http.setTimeout(60000);

  http.addHeader("Content-Type", "application/json");

  int httpCode = http.POST("{}");

  Serial.print("Notify HTTP Code: ");
  Serial.println(httpCode);

  if (httpCode > 0) {
    String response = http.getString();
    Serial.println(response);
  } else {
    Serial.print("HTTP Error: ");
    Serial.println(http.errorToString(httpCode));
  }

  http.end();
}
// =====================================================
// PRINT STATE
// =====================================================
void printState() {
  static GateState lastState = IDLE;

  if (lastState != gateState) {
    lastState = gateState;

    Serial.print("State changed to: ");

    switch (gateState) {
      case IDLE:
        Serial.println("IDLE");
        break;
      case WAIT_FOR_SCAN:
        Serial.println("WAIT_FOR_SCAN");
        break;
      case GATE_OPEN:
        Serial.println("GATE_OPEN");
        break;
    }
  }
}

// =====================================================
// SETUP
// =====================================================
void setup() {
  Serial.begin(115200);
  delay(2000);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  gateServo.setPeriodHertz(50);
  gateServo.attach(SERVO_PIN, 500, 2400);

  closeGate();

  connectWiFi();

  Serial.println("System Ready.");
}

// =====================================================
// LOOP
// =====================================================
void loop() {
  // Reconnect WiFi
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  printState();

  // Kiểm tra khoảng cách theo chu kỳ
  if (millis() - lastDistanceCheck >= CHECK_INTERVAL) {
    lastDistanceCheck = millis();

    bool detected = isVehicleDetected();

    switch (gateState) {

      // =========================================
      // CHƯA CÓ XE
      // =========================================
      case IDLE:
        if (detected) {
          Serial.println("Vehicle detected.");
          createQR();

          if (currentQrCode != "") {
            gateState = WAIT_FOR_SCAN;
          }
        }
        break;

      // =========================================
      // CHỜ QUÉT QR
      // =========================================
      case WAIT_FOR_SCAN:
        // Xe bỏ đi trước khi quét
        if (!detected) {
          Serial.println("Vehicle left before scanning.");
          clearQR();
          gateState = IDLE;
        }
        break;

      // =========================================
      // CỔNG ĐANG MỞ
      // =========================================
      case GATE_OPEN:
        // Khi xe đi khỏi cảm biến
        if (!detected) {
          Serial.println("Vehicle passed. Closing gate.");

          // Đóng cổng
          closeGate();

          // Gửi Telegram
          notifyEntryToTelegram();

          // Xóa QR trên dashboard
          clearQR();

          // Quay về trạng thái ban đầu
          gateState = IDLE;
        }
        break;
    }
  }

  // Kiểm tra QR đã được quét chưa
  checkScannedQR();

  delay(50);
}