// App.js
import { useEffect, useMemo, useState } from "react";
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

// =========================
// CẤU HÌNH API BACKEND
// =========================
const API_BASE_URL = "http://10.237.28.105:8000";

// =========================
// TÁCH DỮ LIỆU QR THÀNH TỪNG PHẦN
// =========================
function parseQrData(value) {
  if (!value) return [];

  return value.split("|").map((item, index) => ({
    id: `${index}-${item}`,
    value: item.trim(),
  }));
}

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

  return await response.json();
}

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();

  const [scanning, setScanning] = useState(true);
  const [scanResult, setScanResult] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [saving, setSaving] = useState(false);

  const parsedData = useMemo(
    () => parseQrData(scanResult),
    [scanResult]
  );

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

    setScanResult(qrText);
    setQrCode(code);

    try {
      // Gửi lên backend
      const response = await saveScannedQr(qrText);

      if (!response.success) {
        Alert.alert(
          "Lỗi",
          response.message || "Không lưu được QR."
        );
        return;
      }

      Alert.alert(
        "Quét thành công",
        `Mã vé của bạn là: ${code}\n\n` +
          `Khi lấy xe, vui lòng nhập đúng mã ${code}.`
      );
    } catch (error) {
      Alert.alert(
        "Lỗi",
        error.message || "Không kết nối được server."
      );
    } finally {
      setSaving(false);
    }
  }

  // =========================
  // COPY QR
  // =========================
  async function copyResult() {
    if (!scanResult) return;

    await Clipboard.setStringAsync(scanResult);

    Alert.alert(
      "Đã copy",
      "Nội dung QR đã được copy."
    );
  }

  // =========================
  // MỞ URL
  // =========================
  function openResult() {
    if (
      !scanResult ||
      !scanResult.startsWith("http")
    ) {
      return;
    }

    Linking.openURL(scanResult);
  }

  // =========================
  // QUÉT LẠI
  // =========================
  function resetScanner() {
    if (saving) return;

    setScanResult("");
    setQrCode("");
    setScanning(true);
  }

  // =========================
  // CHƯA KIỂM TRA QUYỀN
  // =========================
  if (!permission) {
    return (
      <SafeAreaView style={styles.centerPage}>
        <StatusBar barStyle="dark-content" />
        <Text style={styles.darkTitle}>
          Đang kiểm tra camera...
        </Text>
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

      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.eyebrow}>
          Smart Parking
        </Text>
        <Text style={styles.title}>
          Quét QR gửi xe
        </Text>
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
            <Text style={styles.scanDoneText}>
              Đã quét thành công
            </Text>
          </View>
        )}

        <View style={styles.scanBox} />
      </View>

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
          <Pressable
            style={styles.primaryButton}
            onPress={resetScanner}
          >
            <Text style={styles.primaryButtonText}>
              {scanResult
                ? "Quét lại"
                : "Bắt đầu quét"}
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

          {scanResult.startsWith("http") ? (
            <Pressable
              style={styles.secondaryButton}
              onPress={openResult}
            >
              <Text
                style={styles.secondaryButtonText}
              >
                Mở link
              </Text>
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

  darkTitle: {
    color: "#17202a",
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
  },

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