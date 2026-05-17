<<<<<<< HEAD:smart-parking/mobile/App.js
// App.js
import { useEffect, useMemo, useState } from "react";
=======
import { useEffect, useMemo, useRef, useState } from "react";
>>>>>>> 4403d86b (11h44):smart-parking/smart-parking/mobile/App.js
import {
  Alert,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { CameraView, useCameraPermissions } from "expo-camera";

<<<<<<< HEAD:smart-parking/mobile/App.js
// =========================
// CẤU HÌNH API BACKEND
// =========================
const API_BASE_URL = "http://10.237.28.105:8000";

// =========================
// TÁCH DỮ LIỆU QR THÀNH TỪNG PHẦN
// =========================
function parseQrData(value) {
  if (!value) return [];
=======
const API_BASE_URL = "http://10.237.28.105:8000";
>>>>>>> 4403d86b (11h44):smart-parking/smart-parking/mobile/App.js

function parseQrData(value) {
  if (!value) return [];
  return value.split("|").map((item, index) => ({
    id: `${index}-${item}`,
    value: item.trim(),
  }));
}

<<<<<<< HEAD:smart-parking/mobile/App.js
// =========================
// LẤY 5 SỐ CUỐI
// Ví dụ: PARKING-12345 -> 12345
// =========================
function extractQrCode(value) {
  if (!value) return "";

  const digits = value.replace(/\D/g, "");

  if (digits.length < 5) return "";

  return digits.slice(-5);
}

// =========================
// GỬI QR ĐÃ QUÉT LÊN BACKEND
// =========================
async function saveScannedQr(qrText) {
  const response = await fetch(`${API_BASE_URL}/api/qr/scanned`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: qrText,
    }),
  });

=======
function extractQrCode(value) {
  if (!value) return "";
  const match = value.trim().match(/^(?:PARKING-)?(\d{5})$/);
  return match ? match[1] : "";
}

async function saveScannedQr(qrText) {
  const response = await fetch(`${API_BASE_URL}/api/qr/scanned`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: qrText }),
  });

  if (!response.ok) {
    throw new Error(`Backend error ${response.status}`);
  }

  return await response.json();
}

async function reportIssue(qrCode, message) {
  const response = await fetch(`${API_BASE_URL}/api/report-issue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ qr_code: qrCode, message }),
  });

  if (!response.ok) {
    throw new Error(`Backend error ${response.status}`);
  }

>>>>>>> 4403d86b (11h44):smart-parking/smart-parking/mobile/App.js
  return await response.json();
}

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();

  const [scanning, setScanning] = useState(true);
  const [scanResult, setScanResult] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [saving, setSaving] = useState(false);
<<<<<<< HEAD:smart-parking/mobile/App.js

  const parsedData = useMemo(
    () => parseQrData(scanResult),
    [scanResult]
  );
=======
  const [reporting, setReporting] = useState(false);
  const scanLockRef = useRef(false);
  const invalidAlertRef = useRef(false);
>>>>>>> 4403d86b (11h44):smart-parking/smart-parking/mobile/App.js

  const hasPermission = permission?.granted;

  // =========================
  // XIN QUYỀN CAMERA
  // =========================
  useEffect(() => {
    if (
      permission &&
      !permission.granted &&
      permission.canAskAgain
    ) {
      requestPermission();
    }
  }, [permission, requestPermission]);

<<<<<<< HEAD:smart-parking/mobile/App.js
  // =========================
  // XỬ LÝ KHI QUÉT QR
  // =========================
  async function handleBarcodeScanned(result) {
    // Không cho quét nhiều lần
    if (!scanning || saving) {
      return;
    }

    const qrText = result.data || "";
    const code = extractQrCode(qrText);

    if (!code) {
      Alert.alert("Lỗi", "QR không hợp lệ.");
      return;
    }

    // Dừng quét
    setScanning(false);
    setSaving(true);

=======
  async function handleBarcodeScanned(result) {
    if (!scanning || saving || scanLockRef.current) return;

    const qrText = result.data || "";
    const code = extractQrCode(qrText);

    if (!code) {
      if (!invalidAlertRef.current) {
        invalidAlertRef.current = true;
        Alert.alert("Error", "Invalid parking QR.", [
          {
            text: "OK",
            onPress: () => {
              invalidAlertRef.current = false;
            },
          },
        ]);
      }
      return;
    }

    scanLockRef.current = true;
    setScanning(false);
    setSaving(true);
>>>>>>> 4403d86b (11h44):smart-parking/smart-parking/mobile/App.js
    setScanResult(qrText);
    setQrCode(code);

    try {
<<<<<<< HEAD:smart-parking/mobile/App.js
      // Gửi lên backend
      const response = await saveScannedQr(qrText);

      if (!response.success) {
        Alert.alert(
          "Lỗi",
          response.message || "Không lưu được QR."
        );
=======
      const response = await saveScannedQr(qrText);
      if (!response.success) {
        Alert.alert("Error", response.message || "Cannot save QR.");
        scanLockRef.current = false;
>>>>>>> 4403d86b (11h44):smart-parking/smart-parking/mobile/App.js
        return;
      }

      Alert.alert(
<<<<<<< HEAD:smart-parking/mobile/App.js
        "Quét thành công",
        `Mã vé của bạn là: ${code}\n\n` +
          `Khi lấy xe, vui lòng nhập đúng mã ${code}.`
      );
    } catch (error) {
      Alert.alert(
        "Lỗi",
        error.message || "Không kết nối được server."
      );
=======
        "Scan success",
        `Your ticket code is ${code}.\nUse this code at the exit gate.`
      );
    } catch (error) {
      Alert.alert("Error", error.message || "Cannot connect to server.");
      scanLockRef.current = false;
>>>>>>> 4403d86b (11h44):smart-parking/smart-parking/mobile/App.js
    } finally {
      setSaving(false);
    }
  }

  // =========================
  // COPY QR
  // =========================
  async function copyResult() {
    if (!scanResult) return;
<<<<<<< HEAD:smart-parking/mobile/App.js

    await Clipboard.setStringAsync(scanResult);

    Alert.alert(
      "Đã copy",
      "Nội dung QR đã được copy."
    );
=======
    await Clipboard.setStringAsync(scanResult);
    Alert.alert("Copied", "QR content copied.");
>>>>>>> 4403d86b (11h44):smart-parking/smart-parking/mobile/App.js
  }

  // =========================
  // MỞ URL
  // =========================
  function openResult() {
<<<<<<< HEAD:smart-parking/mobile/App.js
    if (
      !scanResult ||
      !scanResult.startsWith("http")
    ) {
      return;
    }

=======
    if (!scanResult || !scanResult.startsWith("http")) return;
>>>>>>> 4403d86b (11h44):smart-parking/smart-parking/mobile/App.js
    Linking.openURL(scanResult);
  }

  // =========================
  // QUÉT LẠI
  // =========================
  function resetScanner() {
    if (saving) return;
<<<<<<< HEAD:smart-parking/mobile/App.js

=======
>>>>>>> 4403d86b (11h44):smart-parking/smart-parking/mobile/App.js
    setScanResult("");
    setQrCode("");
    setScanning(true);
    scanLockRef.current = false;
    invalidAlertRef.current = false;
  }

  async function handleReportIssue() {
    try {
      setReporting(true);
      const response = await reportIssue(
        qrCode,
        qrCode ? `Customer reported a gate/QR issue for ticket ${qrCode}` : "Customer reported QR/gate issue before scanning"
      );
      Alert.alert(
        response.success ? "Reported" : "Error",
        response.success ? "Issue sent to parking owner." : response.message || "Cannot send issue."
      );
    } catch (error) {
      Alert.alert("Error", error.message || "Cannot send issue.");
    } finally {
      setReporting(false);
    }
  }

  // =========================
  // CHƯA KIỂM TRA QUYỀN
  // =========================
  if (!permission) {
    return (
      <SafeAreaView style={styles.centerPage}>
        <StatusBar barStyle="dark-content" />
<<<<<<< HEAD:smart-parking/mobile/App.js
        <Text style={styles.darkTitle}>
          Đang kiểm tra camera...
        </Text>
=======
        <Text style={styles.darkTitle}>Checking camera...</Text>
>>>>>>> 4403d86b (11h44):smart-parking/smart-parking/mobile/App.js
      </SafeAreaView>
    );
  }

  // =========================
  // CHƯA CÓ QUYỀN CAMERA
  // =========================
  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.centerPage}>
        <StatusBar barStyle="dark-content" />
<<<<<<< HEAD:smart-parking/mobile/App.js

        <Text style={styles.darkTitle}>
          Cần quyền camera
        </Text>

        <Text style={styles.description}>
          Khách hàng cần cho phép camera để quét
          mã QR gửi xe.
        </Text>

        <Pressable
          style={styles.primaryButton}
          onPress={requestPermission}
        >
          <Text style={styles.primaryButtonText}>
            Cấp quyền camera
          </Text>
=======
        <Text style={styles.darkTitle}>Camera permission needed</Text>
        <Text style={styles.description}>
          Allow camera access to scan your parking QR.
        </Text>
        <Pressable style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Allow camera</Text>
>>>>>>> 4403d86b (11h44):smart-parking/smart-parking/mobile/App.js
        </Pressable>
      </SafeAreaView>
    );
  }

  // =========================
  // GIAO DIỆN CHÍNH
  // =========================
  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle="light-content" />

<<<<<<< HEAD:smart-parking/mobile/App.js
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.eyebrow}>
          Smart Parking
        </Text>
        <Text style={styles.title}>
          Quét QR gửi xe
        </Text>
=======
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Smart Parking</Text>
        <Text style={styles.title}>Scan entry QR</Text>
>>>>>>> 4403d86b (11h44):smart-parking/smart-parking/mobile/App.js
      </View>

      {/* CAMERA */}
      <View style={styles.cameraWrap}>
        {scanning ? (
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ["qr"],
            }}
            onBarcodeScanned={handleBarcodeScanned}
          />
        ) : (
          <View style={styles.scanDone}>
<<<<<<< HEAD:smart-parking/mobile/App.js
            <Text style={styles.scanDoneText}>
              Đã quét thành công
            </Text>
=======
            <Text style={styles.scanDoneText}>Scan completed</Text>
>>>>>>> 4403d86b (11h44):smart-parking/smart-parking/mobile/App.js
          </View>
        )}

        <View style={styles.scanBox} />
      </View>

<<<<<<< HEAD:smart-parking/mobile/App.js
      {/* KẾT QUẢ */}
      <ScrollView
        style={styles.resultPanel}
        contentContainerStyle={styles.resultContent}
      >
        <Text style={styles.label}>
          Mã vé 5 số
        </Text>

        <Text style={styles.codeText}>
          {qrCode || "-----"}
        </Text>

        <Text style={styles.notice}>
          {qrCode
            ? `Khi lấy xe, vui lòng nhập đúng mã ${qrCode}.`
            : "Đưa camera vào mã QR để quét."}
        </Text>

        <Text style={styles.label}>
          Nội dung QR
        </Text>

        <Text style={styles.resultText}>
          {scanResult || "Chưa có dữ liệu."}
        </Text>
=======
      <ScrollView style={styles.resultPanel} contentContainerStyle={styles.resultContent}>
        <Text style={styles.label}>5-digit ticket code</Text>
        <Text style={styles.codeText}>{qrCode || "-----"}</Text>

        <Text style={styles.notice}>
          {qrCode
            ? `Use code ${qrCode} when you leave the parking lot.`
            : "Point your camera at the parking QR."}
        </Text>

        <Text style={styles.label}>QR content</Text>
        <Text style={styles.resultText}>{scanResult || "No data yet."}</Text>
>>>>>>> 4403d86b (11h44):smart-parking/smart-parking/mobile/App.js

        {parsedData.length > 1 ? (
          <View style={styles.detailList}>
            {parsedData.map((item) => (
              <View
                key={item.id}
                style={styles.detailItem}
              >
                <Text style={styles.detailText}>
                  {item.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* ACTIONS */}
        <View style={styles.actions}>
<<<<<<< HEAD:smart-parking/mobile/App.js
          <Pressable
            style={styles.primaryButton}
            onPress={resetScanner}
          >
            <Text style={styles.primaryButtonText}>
              {scanResult
                ? "Quét lại"
                : "Bắt đầu quét"}
=======
          <Pressable style={styles.primaryButton} onPress={resetScanner}>
            <Text style={styles.primaryButtonText}>
              {scanResult ? "Scan again" : "Start scan"}
>>>>>>> 4403d86b (11h44):smart-parking/smart-parking/mobile/App.js
            </Text>
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={copyResult}
            disabled={!scanResult}
          >
            <Text
              style={styles.secondaryButtonText}
            >
              Copy
            </Text>
          </Pressable>

          <Pressable style={styles.warningButton} onPress={handleReportIssue} disabled={reporting}>
            <Text style={styles.primaryButtonText}>Report issue</Text>
          </Pressable>

          {scanResult.startsWith("http") ? (
<<<<<<< HEAD:smart-parking/mobile/App.js
            <Pressable
              style={styles.secondaryButton}
              onPress={openResult}
            >
              <Text
                style={styles.secondaryButtonText}
              >
                Mở link
              </Text>
=======
            <Pressable style={styles.secondaryButton} onPress={openResult}>
              <Text style={styles.secondaryButtonText}>Open link</Text>
>>>>>>> 4403d86b (11h44):smart-parking/smart-parking/mobile/App.js
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// =========================
// STYLES
// =========================
const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#18242d",
  },

  centerPage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f4f7fb",
  },

  header: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 14,
  },

  eyebrow: {
    color: "#8ed2e4",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },

  title: {
    marginTop: 6,
    color: "#ffffff",
    fontSize: 32,
    fontWeight: "900",
  },
<<<<<<< HEAD:smart-parking/mobile/App.js

=======
>>>>>>> 4403d86b (11h44):smart-parking/smart-parking/mobile/App.js
  darkTitle: {
    color: "#17202a",
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
  },
<<<<<<< HEAD:smart-parking/mobile/App.js

=======
>>>>>>> 4403d86b (11h44):smart-parking/smart-parking/mobile/App.js
  description: {
    marginVertical: 16,
    color: "#536273",
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },

  cameraWrap: {
    height: 420,
    marginHorizontal: 16,
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: "#000000",
  },

  camera: {
    flex: 1,
  },

  scanBox: {
    position: "absolute",
    top: "22%",
    left: "12%",
    width: "76%",
    height: "56%",
    borderWidth: 3,
    borderColor: "#f0b84b",
    borderRadius: 18,
  },

  scanDone: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#21313d",
  },

  scanDoneText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
  },

  resultPanel: {
    flex: 1,
    marginTop: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#ffffff",
  },

  resultContent: {
    padding: 22,
    paddingBottom: 40,
  },

  label: {
    color: "#126180",
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
    marginTop: 10,
<<<<<<< HEAD:smart-parking/mobile/App.js
=======
  },
  codeText: {
    marginTop: 8,
    fontSize: 42,
    fontWeight: "900",
    color: "#e67e22",
    textAlign: "center",
  },
  notice: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    color: "#17202a",
    lineHeight: 24,
>>>>>>> 4403d86b (11h44):smart-parking/smart-parking/mobile/App.js
  },

  codeText: {
    marginTop: 8,
    fontSize: 42,
    fontWeight: "900",
    color: "#e67e22",
    textAlign: "center",
  },

  notice: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    color: "#17202a",
    lineHeight: 24,
  },

  resultText: {
    marginTop: 10,
    color: "#17202a",
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 25,
  },

  detailList: {
    marginTop: 14,
    gap: 8,
  },

  detailItem: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#eef4f7",
  },

  detailText: {
    color: "#21313d",
    fontSize: 15,
    fontWeight: "700",
  },

  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 20,
  },

  primaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 18,
    backgroundColor: "#126180",
  },
<<<<<<< HEAD:smart-parking/mobile/App.js

=======
  warningButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 18,
    backgroundColor: "#b42318",
  },
>>>>>>> 4403d86b (11h44):smart-parking/smart-parking/mobile/App.js
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  secondaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 18,
    backgroundColor: "#e8edf3",
  },

  secondaryButtonText: {
    color: "#17202a",
    fontSize: 15,
    fontWeight: "900",
  },
});