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
  Alert,
} from "react-native";
import { checkHealth } from "../api";
import { presentAddToSiriDialog } from "../utils/shortcut";

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

          {/* SARVIS voice shortcut */}
          <View style={styles.divider} />
          <Text style={styles.label}>Voice Activation</Text>
          {Platform.OS === "ios" ? (
            <TouchableOpacity
              style={styles.siriBtn}
              onPress={() =>
                presentAddToSiriDialog((status) => {
                  if (status === "added" || status === "updated") {
                    Alert.alert(
                      "SARVIS added to Siri ✅",
                      'Say "Hey Siri, SARVIS" to open the app and start talking.'
                    );
                  }
                })
              }
            >
              <Text style={styles.siriBtnText}>🎙 Add "SARVIS" to Siri</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.androidHint}>
              <Text style={styles.androidHintText}>
                Say <Text style={styles.androidPhrase}>"Hey Google, open SARVIS"</Text> to launch and start talking.
              </Text>
            </View>
          )}

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
  divider: {
    height: 1,
    backgroundColor: "#1e293b",
    marginVertical: 20,
  },
  siriBtn: {
    backgroundColor: "#000",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#334155",
  },
  siriBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  androidHint: {
    backgroundColor: "#1e293b",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#334155",
  },
  androidHintText: {
    color: "#94a3b8",
    fontSize: 14,
    lineHeight: 20,
  },
  androidPhrase: {
    color: "#60a5fa",
    fontWeight: "600",
  },
});
