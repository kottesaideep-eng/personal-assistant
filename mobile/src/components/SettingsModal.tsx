import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { checkHealth } from "../api";

interface Props {
  visible: boolean;
  currentUrl: string;
  onSave: (url: string) => void;
  onClose?: () => void;
}

export default function SettingsModal({ visible, currentUrl, onSave, onClose }: Props) {
  const [url, setUrl] = useState(currentUrl);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "fail">("idle");

  const handleTest = async () => {
    setTesting(true);
    setStatus("idle");
    const ok = await checkHealth(url.trim());
    setStatus(ok ? "ok" : "fail");
    setTesting(false);
  };

  const handleSave = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    onSave(trimmed);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          <Text style={styles.title}>⚙️  Server Settings</Text>
          <Text style={styles.label}>Railway Backend URL</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="https://your-app.up.railway.app"
            placeholderTextColor="#475569"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <TouchableOpacity style={styles.testBtn} onPress={handleTest} disabled={testing}>
            {testing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.testBtnText}>Test Connection</Text>
            )}
          </TouchableOpacity>

          {status === "ok" && (
            <Text style={styles.statusOk}>✅ Connected successfully!</Text>
          )}
          {status === "fail" && (
            <Text style={styles.statusFail}>❌ Could not reach server. Check the URL.</Text>
          )}

          <View style={styles.actions}>
            {onClose && (
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.saveBtn, !url.trim() && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!url.trim()}
            >
              <Text style={styles.saveText}>Save & Connect</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            Deploy the backend to Railway, then paste the generated URL here.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#0f172a",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
  },
  title: {
    color: "#f1f5f9",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 20,
  },
  label: {
    color: "#94a3b8",
    fontSize: 13,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: "#1e293b",
    color: "#f1f5f9",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  testBtn: {
    backgroundColor: "#334155",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    marginBottom: 8,
  },
  testBtnText: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "600",
  },
  statusOk: {
    color: "#4ade80",
    fontSize: 14,
    marginBottom: 12,
    textAlign: "center",
  },
  statusFail: {
    color: "#f87171",
    fontSize: 14,
    marginBottom: 12,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#1e293b",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelText: {
    color: "#94a3b8",
    fontSize: 15,
    fontWeight: "600",
  },
  saveBtn: {
    flex: 2,
    backgroundColor: "#3b82f6",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveBtnDisabled: {
    backgroundColor: "#1e3a5f",
  },
  saveText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  hint: {
    color: "#475569",
    fontSize: 12,
    marginTop: 16,
    textAlign: "center",
    lineHeight: 18,
  },
});
