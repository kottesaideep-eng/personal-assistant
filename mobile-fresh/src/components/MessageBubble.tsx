import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Share,
  Platform,
  ActionSheetIOS,
  Alert,
  Animated,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import Markdown from "react-native-markdown-display";
import { Message } from "../types";

interface Props {
  message: Message;
}

const assistantMarkdown = {
  body: { color: "#e2e8f0", fontSize: 15.5, lineHeight: 24 },
  strong: { color: "#f8fafc", fontWeight: "700" as const },
  em: { color: "#cbd5e1", fontStyle: "italic" as const },
  heading1: { color: "#f8fafc", fontSize: 18, fontWeight: "700" as const, marginVertical: 6 },
  heading2: { color: "#f1f5f9", fontSize: 16, fontWeight: "700" as const, marginVertical: 4 },
  heading3: { color: "#94a3b8", fontSize: 15, fontWeight: "600" as const, marginVertical: 2 },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item: { marginBottom: 4 },
  bullet_list_icon: { color: "#6366f1", marginTop: 8 },
  code_inline: {
    backgroundColor: "#0a0f1e",
    color: "#a78bfa",
    borderRadius: 6,
    paddingHorizontal: 5,
    fontFamily: "monospace",
    fontSize: 13.5,
  },
  fence: {
    backgroundColor: "#0a0f1e",
    borderRadius: 12,
    padding: 14,
    marginVertical: 8,
  },
  code_block: { color: "#a78bfa", fontFamily: "monospace", fontSize: 13 },
  blockquote: {
    borderLeftColor: "#6366f1",
    borderLeftWidth: 3,
    paddingLeft: 12,
    marginLeft: 0,
    opacity: 0.85,
  },
  link: { color: "#818cf8" },
  hr: { backgroundColor: "#1e293b", height: 1, marginVertical: 10 },
};

const userMarkdown = {
  body: { color: "#ffffff", fontSize: 15.5, lineHeight: 24 },
  strong: { color: "#ffffff", fontWeight: "700" as const },
  em: { color: "rgba(255,255,255,0.85)", fontStyle: "italic" as const },
  code_inline: {
    backgroundColor: "rgba(0,0,0,0.3)",
    color: "#c7d2fe",
    borderRadius: 6,
    paddingHorizontal: 5,
    fontFamily: "monospace",
    fontSize: 13.5,
  },
  link: { color: "#c7d2fe" },
};

function showCopyShareSheet(content: string) {
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ["Copy text", "Share", "Cancel"], cancelButtonIndex: 2 },
      async (index) => {
        if (index === 0) await Clipboard.setStringAsync(content);
        if (index === 1) await Share.share({ message: content });
      }
    );
  } else {
    Alert.alert("Message options", undefined, [
      { text: "Copy text", onPress: () => Clipboard.setStringAsync(content) },
      { text: "Share", onPress: () => Share.share({ message: content }) },
      { text: "Cancel", style: "cancel" },
    ]);
  }
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const slideAnim = useRef(new Animated.Value(12)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 140, friction: 12, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.row,
        isUser ? styles.rowUser : styles.rowAssistant,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      {/* Assistant avatar */}
      {!isUser && (
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>R</Text>
          </View>
        </View>
      )}

      {/* Bubble + timestamp group */}
      <View style={[styles.group, isUser ? styles.groupUser : styles.groupAssistant]}>
        <TouchableOpacity
          activeOpacity={0.88}
          onLongPress={() => showCopyShareSheet(message.content)}
          style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}
        >
          {message.imageUri && (
            <Image
              source={{ uri: message.imageUri }}
              style={styles.image}
              resizeMode="cover"
            />
          )}
          <Markdown style={isUser ? userMarkdown : assistantMarkdown}>
            {message.content}
          </Markdown>
        </TouchableOpacity>
        <Text style={[styles.time, isUser ? styles.timeUser : styles.timeAssistant]}>
          {time}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    marginVertical: 3,
    marginHorizontal: 14,
    alignItems: "flex-end",
  },
  rowUser: { justifyContent: "flex-end" },
  rowAssistant: { justifyContent: "flex-start" },

  avatarContainer: {
    marginRight: 8,
    marginBottom: 20, // sits above the timestamp line
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#6366f1",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#6366f1",
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  avatarText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  group: { maxWidth: "78%" },
  groupUser: { alignItems: "flex-end" },
  groupAssistant: { alignItems: "flex-start" },

  bubble: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 22,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  bubbleUser: {
    backgroundColor: "#2563eb",
    borderBottomRightRadius: 5,
  },
  bubbleAssistant: {
    backgroundColor: "#141b2d",
    borderBottomLeftRadius: 5,
  },

  image: {
    width: "100%",
    height: 200,
    borderRadius: 14,
    marginBottom: 8,
  },

  time: {
    fontSize: 11,
    marginTop: 4,
    marginHorizontal: 4,
    letterSpacing: 0.2,
  },
  timeUser: { color: "rgba(255,255,255,0.3)" },
  timeAssistant: { color: "#334155" },
});
