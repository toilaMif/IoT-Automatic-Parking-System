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
// EXIT HC-SR04 PINS
// =====================================================
#define EXIT_ECHO_PIN 37
#define EXIT_TRIG_PIN 38

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
const unsigned long EXIT_CODE_TIMEOUT = 60000;
const unsigned long COMMAND_CHECK_INTERVAL = 700;

const int SERVO_CLOSE_ANGLE = 0;
const int SERVO_OPEN_ANGLE = 90;

// =====================================================
// STATES
// =====================================================
enum GateState {
  IDLE,
  WAIT_FOR_SCAN,
  GATE_OPEN,
  EXIT_WAIT_FOR_CODE,
  EXIT_GATE_OPEN
};

GateState gateState = IDLE;

// =====================================================
// GLOBAL VARIABLES
// =====================================================
Servo gateServo;

String currentQrCode = "";

unsigned long lastDistanceCheck = 0;
unsigned long lastScanCheck = 0;
unsigned long exitWaitStartedAt = 0;
unsigned long lastCommandCheck = 0;

// =====================================================
// FUNCTION PROTOTYPES
// =====================================================
void connectWiFi();
float readDistanceCM(int trigPin, int echoPin);
bool isVehicleDetected();
bool isExitVehicleDetected();
void openGate();
void closeGate();
void createQR();
void clearQR();
void checkScannedQR();
void notifyEntryToTelegram();
void notifyExitDetected();
void cancelExitDetected();
String getCommand();
void resetCommand();
void handleBackendCommand();
bool processExitByQR(String qrCode);
void handleExitCodeInput();
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
float readDistanceCM(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);

  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  long duration = pulseIn(echoPin, HIGH, 30000);

  if (duration == 0) {
    return 999.0;
  }

  return duration * 0.0343 / 2.0;
}

// =====================================================
// VEHICLE DETECTED?
// =====================================================
bool isVehicleDetected() {
  float distance = readDistanceCM(TRIG_PIN, ECHO_PIN);

  Serial.print("Entry distance: ");
  Serial.print(distance);
  Serial.println(" cm");

  return distance <= DETECT_DISTANCE_CM;
}

bool isExitVehicleDetected() {
  float distance = readDistanceCM(EXIT_TRIG_PIN, EXIT_ECHO_PIN);

  Serial.print("Exit distance: ");
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
      resetCommand();
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

void notifyExitDetected() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(serverUrl) + "/api/exit/detect";

  Serial.println("Notifying exit vehicle detected...");
  Serial.println(url);

  http.begin(url);
  http.setTimeout(10000);
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.POST("{}");

  Serial.print("Exit detect HTTP Code: ");
  Serial.println(httpCode);

  if (httpCode > 0) {
    Serial.println(http.getString());
  } else {
    Serial.print("HTTP Error: ");
    Serial.println(http.errorToString(httpCode));
  }

  http.end();
}

void cancelExitDetected() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(serverUrl) + "/api/exit/cancel";

  Serial.println("Canceling exit wait...");
  Serial.println(url);

  if (!http.begin(url)) return;
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");
  http.POST("{}");
  http.end();
}

String getCommand() {
  if (WiFi.status() != WL_CONNECTED) return "idle";

  HTTPClient http;
  String url = String(serverUrl) + "/api/command";

  if (!http.begin(url)) return "idle";
  http.setTimeout(3000);

  int httpCode = http.GET();
  if (httpCode != 200) {
    http.end();
    return "idle";
  }

  String response = http.getString();
  http.end();

  int pos = response.indexOf("\"command\":\"");
  if (pos < 0) return "idle";

  pos += 11;
  int endPos = response.indexOf("\"", pos);
  if (endPos <= pos) return "idle";

  return response.substring(pos, endPos);
}

void resetCommand() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(serverUrl) + "/api/reset";

  if (!http.begin(url)) return;
  http.addHeader("Content-Type", "application/json");
  http.POST("{}");
  http.end();
}

void handleBackendCommand() {
  if (millis() - lastCommandCheck < COMMAND_CHECK_INTERVAL) return;
  lastCommandCheck = millis();

  String cmd = getCommand();

  if (cmd == "open_entry_gate") {
    Serial.println("Backend approved entry. Opening gate...");
    openGate();
    gateState = GATE_OPEN;
    resetCommand();
  }
  else if (cmd == "open_exit_gate") {
    Serial.println("Backend approved exit. Opening gate...");
    openGate();
    gateState = EXIT_GATE_OPEN;
    exitWaitStartedAt = 0;
    resetCommand();
  }
}

bool processExitByQR(String qrCode) {
  qrCode.trim();

  if (WiFi.status() != WL_CONNECTED) return false;
  if (qrCode.length() == 0) return false;

  HTTPClient http;
  String url = String(serverUrl) + "/api/exit/by-qr";
  String body = "{\"qr_code\":\"" + qrCode + "\"}";

  Serial.println("Checking exit QR...");
  Serial.println("POST " + url);
  Serial.println(body);

  http.begin(url);
  http.setTimeout(60000);
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.POST(body);

  Serial.print("Exit HTTP Code: ");
  Serial.println(httpCode);

  if (httpCode <= 0) {
    Serial.print("HTTP Error: ");
    Serial.println(http.errorToString(httpCode));
    http.end();
    return false;
  }

  String response = http.getString();
  Serial.println(response);
  http.end();

  if (httpCode == 200 &&
      (response.indexOf("\"success\":true") >= 0 ||
       response.indexOf("\"success\": true") >= 0)) {
    Serial.println("Exit QR accepted.");
    return true;
  }

  Serial.println("Exit QR rejected.");
  return false;
}

void handleExitCodeInput() {
  if (gateState != EXIT_WAIT_FOR_CODE) return;
  if (!Serial.available()) return;

  String qrCode = Serial.readStringUntil('\n');
  qrCode.trim();

  if (qrCode.length() == 0) return;

  Serial.print("Exit QR entered: ");
  Serial.println(qrCode);

  if (processExitByQR(qrCode)) {
    openGate();
    gateState = EXIT_GATE_OPEN;
    exitWaitStartedAt = 0;
  } else {
    Serial.println("Sai ma QR. Nhap lai so QR de ra:");
    exitWaitStartedAt = millis();
  }
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
      case EXIT_WAIT_FOR_CODE:
        Serial.println("EXIT_WAIT_FOR_CODE");
        Serial.println("Exit Gate - Nhap so QR tren web de ra");
        break;
      case EXIT_GATE_OPEN:
        Serial.println("EXIT_GATE_OPEN");
        break;
    }
  }
}

// =====================================================
// SETUP
// =====================================================
void setup() {
  Serial.begin(115200);
  Serial.setTimeout(20000);
  delay(2000);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(EXIT_TRIG_PIN, OUTPUT);
  pinMode(EXIT_ECHO_PIN, INPUT);

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
    bool exitDetected = isExitVehicleDetected();

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
        else if (exitDetected) {
          Serial.println("Exit vehicle detected.");
          Serial.println("Exit Gate - Nhap so QR tren web de ra");
          notifyExitDetected();
          exitWaitStartedAt = millis();
          gateState = EXIT_WAIT_FOR_CODE;
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

      case EXIT_WAIT_FOR_CODE:
        if (millis() - exitWaitStartedAt > EXIT_CODE_TIMEOUT) {
          Serial.println("Exit QR input timeout.");
          cancelExitDetected();
          gateState = IDLE;
        }
        break;

      case EXIT_GATE_OPEN:
        if (!exitDetected) {
          Serial.println("Exit vehicle passed. Closing gate.");
          closeGate();
          gateState = IDLE;
        }
        break;
    }
  }

  // Kiểm tra QR đã được quét chưa
  checkScannedQR();
  handleExitCodeInput();
  handleBackendCommand();

  delay(50);
}
