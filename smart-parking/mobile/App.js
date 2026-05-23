import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { CameraView, useCameraPermissions } from "expo-camera";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://BACKEND_IP:8000";
const ISSUE_OPTIONS = [
  "Khong mo cong",
  "Khong hien QR",
  "Khong quet duoc QR",
  "Khong nhap duoc ma ra",
];

function parseQrData(value) {
  if (!value) return [];
  return value.split("|").map((item, index) => ({
    id: `${index}-${item}`,
    value: item.trim(),
  }));
}

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

  return await response.json();
}

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [scanResult, setScanResult] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState(ISSUE_OPTIONS[0]);
  const [issueDetail, setIssueDetail] = useState("");

  const scanLockRef = useRef(false);
  const invalidAlertRef = useRef(false);
  const parsedData = useMemo(() => parseQrData(scanResult), [scanResult]);
  const hasPermission = permission?.granted;

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  async function handleBarcodeScanned(result) {
    if (!scanning || saving || scanLockRef.current) return;

    const qrText = result.data || "";
    const code = extractQrCode(qrText);

    if (!code) {
      if (!invalidAlertRef.current) {
        invalidAlertRef.current = true;
        Alert.alert("Loi", "QR khong hop le.", [
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
    setScanResult(qrText);
    setQrCode(code);

    try {
      const response = await saveScannedQr(qrText);
      if (!response.success) {
        Alert.alert("Loi", response.message || "Khong luu duoc QR.");
        scanLockRef.current = false;
        return;
      }

      Alert.alert(
        "Quet thanh cong",
        `Ma ve cua ban la: ${code}\n\nKhi lay xe, nhap dung ma nay.`
      );
    } catch (error) {
      Alert.alert("Loi", error.message || "Khong ket noi duoc server.");
      scanLockRef.current = false;
    } finally {
      setSaving(false);
    }
  }

  async function copyResult() {
    if (!scanResult) return;
    await Clipboard.setStringAsync(scanResult);
    Alert.alert("Da sao chep", "Noi dung QR da duoc copy.");
  }

  function openResult() {
    if (!scanResult || !scanResult.startsWith("http")) return;
    Linking.openURL(scanResult);
  }

  function resetScanner() {
    if (saving) return;
    setScanResult("");
    setQrCode("");
    setScanning(true);
    scanLockRef.current = false;
    invalidAlertRef.current = false;
  }

  async function handleReportIssue() {
    try {
      setReporting(true);
      const detail = issueDetail.trim();
      const issueMessage = [
        `Su co: ${selectedIssue}`,
        qrCode ? `Ma ve: ${qrCode}` : "Chua co ma ve",
        detail ? `Ghi chu: ${detail}` : "",
      ].filter(Boolean).join("\n");

      const response = await reportIssue(qrCode, issueMessage);
      Alert.alert(
        response.success ? "Da gui" : "Loi",
        response.success
          ? "Da gui bao loi cho chu bai xe."
          : response.message || "Khong gui duoc bao loi."
      );
    } catch (error) {
      Alert.alert("Loi", error.message || "Khong gui duoc bao loi.");
    } finally {
      setReporting(false);
    }
  }

  if (!permission) {
    return (
      <SafeAreaView style={styles.centerPage}>
        <StatusBar barStyle="dark-content" />
        <Text style={styles.darkTitle}>Dang kiem tra camera...</Text>
      </SafeAreaView>
    );
  }

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.centerPage}>
        <StatusBar barStyle="dark-content" />
        <Text style={styles.darkTitle}>Can quyen camera</Text>
        <Text style={styles.description}>
          Vui long cap quyen camera de quet ma QR gui xe.
        </Text>
        <Pressable style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Cap quyen camera</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Smart Parking</Text>
        <Text style={styles.title}>Quet QR gui xe</Text>
      </View>

      <View style={styles.cameraWrap}>
        {scanning ? (
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={handleBarcodeScanned}
          />
        ) : (
          <View style={styles.scanDone}>
            <Text style={styles.scanDoneText}>Da quet thanh cong</Text>
          </View>
        )}
        <View style={styles.scanBox} />
      </View>

      <ScrollView style={styles.resultPanel} contentContainerStyle={styles.resultContent}>
        <Text style={styles.label}>Ma ve 5 so</Text>
        <Text style={styles.codeText}>{qrCode || "-----"}</Text>

        <Text style={styles.notice}>
          {qrCode
            ? `Khi lay xe, nhap dung ma ${qrCode}.`
            : "Dua camera vao ma QR de quet."}
        </Text>

        <Text style={styles.label}>Noi dung QR</Text>
        <Text style={styles.resultText}>{scanResult || "Chua co du lieu."}</Text>

        {parsedData.length > 1 ? (
          <View style={styles.detailList}>
            {parsedData.map((item) => (
              <View key={item.id} style={styles.detailItem}>
                <Text style={styles.detailText}>{item.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.actions}>
          <Pressable style={styles.primaryButton} onPress={resetScanner}>
            <Text style={styles.primaryButtonText}>
              {scanResult ? "Quet lai" : "Bat dau quet"}
            </Text>
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={copyResult} disabled={!scanResult}>
            <Text style={styles.secondaryButtonText}>Copy</Text>
          </Pressable>

          <Pressable style={styles.warningButton} onPress={handleReportIssue} disabled={reporting}>
            <Text style={styles.primaryButtonText}>Bao loi</Text>
          </Pressable>

          {scanResult.startsWith("http") ? (
            <Pressable style={styles.secondaryButton} onPress={openResult}>
              <Text style={styles.secondaryButtonText}>Mo link</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.label}>Chon su co</Text>
        <View style={styles.issueOptions}>
          {ISSUE_OPTIONS.map((item) => (
            <Pressable
              key={item}
              style={[
                styles.issueButton,
                selectedIssue === item && styles.issueButtonActive,
              ]}
              onPress={() => setSelectedIssue(item)}
            >
              <Text
                style={[
                  styles.issueButtonText,
                  selectedIssue === item && styles.issueButtonTextActive,
                ]}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          style={styles.issueInput}
          value={issueDetail}
          onChangeText={setIssueDetail}
          placeholder="Ghi chu them neu can..."
          placeholderTextColor="#7b8794"
          multiline
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#18242d" },
  centerPage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f4f7fb",
  },
  header: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 14 },
  eyebrow: {
    color: "#8ed2e4",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  title: { marginTop: 6, color: "#ffffff", fontSize: 32, fontWeight: "900" },
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
  camera: { flex: 1 },
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
  scanDoneText: { color: "#ffffff", fontSize: 20, fontWeight: "900" },
  resultPanel: {
    flex: 1,
    marginTop: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#ffffff",
  },
  resultContent: { padding: 22, paddingBottom: 40 },
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
  detailList: { marginTop: 14, gap: 8 },
  detailItem: { padding: 12, borderRadius: 10, backgroundColor: "#eef4f7" },
  detailText: { color: "#21313d", fontSize: 15, fontWeight: "700" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 20 },
  primaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 18,
    backgroundColor: "#126180",
  },
  warningButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 18,
    backgroundColor: "#b42318",
  },
  primaryButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
  secondaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 18,
    backgroundColor: "#e8edf3",
  },
  secondaryButtonText: { color: "#17202a", fontSize: 15, fontWeight: "900" },
  issueOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  issueButton: {
    minHeight: 42,
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: "#e8edf3",
  },
  issueButtonActive: { backgroundColor: "#126180" },
  issueButtonText: { color: "#17202a", fontSize: 13, fontWeight: "900" },
  issueButtonTextActive: { color: "#ffffff" },
  issueInput: {
    minHeight: 74,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#d7dee8",
    borderRadius: 10,
    padding: 12,
    color: "#17202a",
    backgroundColor: "#f9fbfd",
    fontSize: 15,
    fontWeight: "700",
    textAlignVertical: "top",
  },
});
