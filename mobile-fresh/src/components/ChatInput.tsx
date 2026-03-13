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

// Voice is a native-only module — not available in Expo Go.
let Voice: any = null;
try {
  Voice = require("@react-native-voice/voice").default;
} catch {}

interface PendingImage {
  uri: string;
  base64: string;
  mimeType: string;
}

interface Props {
  onSend: (text: string, image?: PendingImage) => void;
  disabled: boolean;
  autoActivateMic?: boolean;
}

export default function ChatInput({ onSend, disabled, autoActivateMic }: Props) {
  const [text, setText] = useState("");
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [focused, setFocused] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const borderAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(borderAnim, {
      toValue: focused ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [focused]);

  useEffect(() => {
    if (!Voice) return;
    Voice.onSpeechResults = (e: any) => {
      if (e.value && e.value.length > 0) setText(e.value[0]);
    };
    Voice.onSpeechError = (e: any) => {
      setIsRecording(false);
      if (e.error?.message) Alert.alert("Speech recognition error", e.error.message);
    };
    Voice.onSpeechEnd = () => setIsRecording(false);
    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  useEffect(() => {
    if (autoActivateMic && !disabled) {
      const timer = setTimeout(() => handleMicPressIn(), 600);
      return () => clearTimeout(timer);
    }
  }, [autoActivateMic]);

  useEffect(() => {
    if (isRecording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.25, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
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
      Animated.timing(scaleAnim, { toValue: 0.85, duration: 70, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 200, friction: 8, useNativeDriver: true }),
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
    if (!Voice) { Alert.alert("Not available", "Voice input requires a full build (not Expo Go)."); return; }
    try {
      setIsRecording(true);
      await Voice.start("en-US");
    } catch {
      setIsRecording(false);
    }
  };

  const handleMicPressOut = async () => {
    if (!Voice) return;
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
        <TouchableOpacity style={styles.sideBtn} onPress={handlePickImage} disabled={disabled}>
          <Text style={styles.sideBtnIcon}>📷</Text>
        </TouchableOpacity>

        {/* Input pill — text + action button inside */}
        <Animated.View
          style={[
            styles.inputPill,
            {
              borderColor: borderAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ["#1e293b", "#6366f1"],
              }),
            },
          ]}
        >
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Message Roar…"
            placeholderTextColor="#3d5066"
            multiline
            maxLength={4000}
            editable={!disabled}
            blurOnSubmit={false}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />

          {/* Mic or Send — inside the pill */}
          {showMic ? (
            <TouchableOpacity
              onPressIn={handleMicPressIn}
              onPressOut={handleMicPressOut}
              style={styles.inlineBtn}
              activeOpacity={0.7}
            >
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <Text style={[styles.inlineBtnIcon, isRecording && styles.micActive]}>
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
                activeOpacity={0.8}
              >
                <Text style={[styles.sendIcon, !canSend && styles.sendIconDisabled]}>↑</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 14 : 12,
    backgroundColor: "#080d1a",
    borderTopWidth: 1,
    borderTopColor: "#0f1729",
  },
  imagePreviewContainer: {
    alignSelf: "flex-start",
    marginBottom: 8,
    marginLeft: 52,
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 12,
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

  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },

  sideBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0f1729",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1e293b",
    marginBottom: 2,
  },
  sideBtnIcon: { fontSize: 18 },

  inputPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#0f1729",
    borderRadius: 26,
    borderWidth: 1.5,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 46,
  },
  input: {
    flex: 1,
    color: "#f1f5f9",
    fontSize: 15.5,
    lineHeight: 22,
    maxHeight: 120,
    padding: 0,
    paddingTop: 4,
    paddingBottom: 4,
  },

  inlineBtn: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  inlineBtnIcon: { fontSize: 18 },
  micActive: { opacity: 0.6 },

  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  sendBtnActive: {
    backgroundColor: "#2563eb",
    shadowColor: "#2563eb",
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  sendBtnInactive: {
    backgroundColor: "#1e293b",
  },
  sendIcon: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 22,
  },
  sendIconDisabled: { color: "#334155" },
});
