import React from "react";
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
} from "react-native";
import * as Clipboard from "expo-clipboard";
import Markdown from "react-native-markdown-display";
import { Message } from "../types";

interface Props {
  message: Message;
}

const assistantMarkdown = {
  body: { color: "#e2e8f0", fontSize: 15, lineHeight: 23 },
  strong: { color: "#f1f5f9", fontWeight: "700" as const },
  em: { color: "#cbd5e1", fontStyle: "italic" as const },
  heading1: { color: "#f8fafc", fontSize: 18, fontWeight: "700" as const, marginVertical: 6 },
  heading2: { color: "#f1f5f9", fontSize: 16, fontWeight: "700" as const, marginVertical: 4 },
  heading3: { color: "#94a3b8", fontSize: 15, fontWeight: "600" as const, marginVertical: 2 },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item: { marginBottom: 3 },
  bullet_list_icon: { color: "#60a5fa", marginTop: 7 },
  code_inline: {
    backgroundColor: "#0f172a",
    color: "#7dd3fc",
    borderRadius: 5,
    paddingHorizontal: 5,
    fontFamily: "monospace",
    fontSize: 13,
  },
  fence: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
  },
  code_block: { color: "#7dd3fc", fontFamily: "monospace", fontSize: 13 },
  blockquote: {
    borderLeftColor: "#3b82f6",
    borderLeftWidth: 3,
    paddingLeft: 12,
    marginLeft: 0,
    opacity: 0.85,
  },
  link: { color: "#60a5fa" },
  hr: { backgroundColor: "#334155", height: 1, marginVertical: 8 },
};

const userMarkdown = {
  body: { color: "#fff", fontSize: 15, lineHeight: 23 },
  strong: { color: "#fff", fontWeight: "700" as const },
  code_inline: {
    backgroundColor: "rgba(0,0,0,0.25)",
    color: "#bfdbfe",
    borderRadius: 5,
    paddingHorizontal: 5,
    fontFamily: "monospace",
    fontSize: 13,
  },
  link: { color: "#bfdbfe" },
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

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      {!isUser && (
        <View style={styles.avatar}>
          <Text style={styles.avatarEmoji}>🤖</Text>
        </View>
      )}
      <TouchableOpacity
        activeOpacity={0.85}
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
        <Text style={[styles.time, isUser ? styles.timeUser : styles.timeAssistant]}>
          {time}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    marginVertical: 5,
    marginHorizontal: 12,
    alignItems: "flex-end",
  },
  rowUser: { justifyContent: "flex-end" },
  rowAssistant: { justifyContent: "flex-start" },

  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#334155",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  avatarEmoji: { fontSize: 18 },

  bubble: {
    maxWidth: "80%",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
    borderRadius: 22,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  bubbleUser: {
    backgroundColor: "#2563eb",
    borderBottomRightRadius: 5,
  },
  bubbleAssistant: {
    backgroundColor: "#1e293b",
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: "#334155",
  },

  image: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    marginBottom: 8,
  },

  time: { fontSize: 11, marginTop: 5, textAlign: "right" },
  timeUser: { color: "rgba(255,255,255,0.45)" },
  timeAssistant: { color: "#475569" },
});
