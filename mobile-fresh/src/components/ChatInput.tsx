import React, { useState, useRef } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
} from "react-native";

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
}

export default function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState("");
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    // Bounce animation on send
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    onSend(trimmed);
    setText("");
  };

  const canSend = text.trim().length > 0 && !disabled;

  return (
    <View style={styles.container}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: 16,
    backgroundColor: "#0f172a",
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
    gap: 8,
  },
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
  sendIcon: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
  },
  sendIconInactive: {
    color: "#475569",
  },
});
