import React, { useState, useRef, useEffect } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  Image,
  StyleSheet,
  Animated,
  Alert,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import Voice from "@react-native-voice/voice";

interface PendingImage {
  uri: string;
  base64: string;
  mimeType: string;
}

interface Props {
  onSend: (text: string, image?: PendingImage) => void;
  disabled: boolean;
}

export default function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState("");
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Voice setup
  useEffect(() => {
    Voice.onSpeechResults = (e) => {
      if (e.value && e.value.length > 0) {
        setText(e.value[0]);
      }
    };
    Voice.onSpeechError = (e) => {
      setIsRecording(false);
      if (e.error?.message) {
        Alert.alert("Speech recognition error", e.error.message);
      }
    };
    Voice.onSpeechEnd = () => setIsRecording(false);
    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  // Pulsing animation while recording
  useEffect(() => {
    if (isRecording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.4, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  const handleSend = () => {
    const trimmed = text.trim();
    if ((!trimmed && !pendingImage) || disabled) return;
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    onSend(trimmed || "What's in this image?", pendingImage ?? undefined);
    setText("");
    setPendingImage(null);
  };

  const handlePickImage = async () => {
    Alert.alert("Add image", "Choose source", [
      {
        text: "Camera",
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== "granted") { Alert.alert("Permission required", "Camera access is needed."); return; }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            base64: true,
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            setPendingImage({ uri: asset.uri, base64: asset.base64 ?? "", mimeType: asset.mimeType ?? "image/jpeg" });
          }
        },
      },
      {
        text: "Photo Library",
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== "granted") { Alert.alert("Permission required", "Photo library access is needed."); return; }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            base64: true,
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            setPendingImage({ uri: asset.uri, base64: asset.base64 ?? "", mimeType: asset.mimeType ?? "image/jpeg" });
          }
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleMicPressIn = async () => {
    try {
      setIsRecording(true);
      await Voice.start("en-US");
    } catch {
      setIsRecording(false);
    }
  };

  const handleMicPressOut = async () => {
    try {
      await Voice.stop();
    } catch {
      setIsRecording(false);
    }
  };

  const canSend = (text.trim().length > 0 || !!pendingImage) && !disabled;
  const showMic = text.trim().length === 0 && !pendingImage && !disabled;

  return (
    <View style={styles.container}>
      {/* Image preview */}
      {pendingImage && (
        <View style={styles.imagePreviewContainer}>
          <Image source={{ uri: pendingImage.uri }} style={styles.imagePreview} />
          <TouchableOpacity style={styles.imageRemoveBtn} onPress={() => setPendingImage(null)}>
            <Text style={styles.imageRemoveBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.row}>
        {/* Camera button */}
        <TouchableOpacity style={styles.iconBtn} onPress={handlePickImage} disabled={disabled}>
          <Text style={styles.iconBtnText}>📷</Text>
        </TouchableOpacity>

        {/* Text input */}
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Ask me anything…"
            placeholderTextColor="#475569"
            multiline
            maxLength={4000}
            editable={!disabled}
            blurOnSubmit={false}
          />
        </View>

        {/* Mic or Send button */}
        {showMic ? (
          <TouchableOpacity
            onPressIn={handleMicPressIn}
            onPressOut={handleMicPressOut}
            style={styles.iconBtn}
          >
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <Text style={[styles.iconBtnText, isRecording && styles.micRecording]}>
                🎤
              </Text>
            </Animated.View>
          </TouchableOpacity>
        ) : (
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <TouchableOpacity
              style={[styles.sendBtn, canSend ? styles.sendBtnActive : styles.sendBtnInactive]}
              onPress={handleSend}
              disabled={!canSend}
              activeOpacity={0.75}
            >
              <Text style={[styles.sendIcon, !canSend && styles.sendIconInactive]}>↑</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: 16,
    backgroundColor: "#0f172a",
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
  },
  imagePreviewContainer: {
    alignSelf: "flex-start",
    marginBottom: 8,
    marginLeft: 4,
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 10,
  },
  imageRemoveBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  imageRemoveBtnText: { color: "#fff", fontSize: 10, fontWeight: "700" },

  row: { flexDirection: "row", alignItems: "flex-end", gap: 8 },

  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  iconBtnText: { fontSize: 20 },
  micRecording: { color: "#ef4444" },

  inputWrapper: {
    flex: 1,
    backgroundColor: "#1e293b",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 46,
    justifyContent: "center",
  },
  input: {
    color: "#f1f5f9",
    fontSize: 15,
    lineHeight: 21,
    maxHeight: 120,
    padding: 0,
  },

  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnActive: {
    backgroundColor: "#2563eb",
    shadowColor: "#2563eb",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  sendBtnInactive: {
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
  },
  sendIcon: { color: "#ffffff", fontSize: 20, fontWeight: "700" },
  sendIconInactive: { color: "#475569" },
});
