import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StatusBar,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Message, HistoryItem } from "./src/types";
import { sendMessage } from "./src/api";
import MessageBubble from "./src/components/MessageBubble";
import ChatInput from "./src/components/ChatInput";
import SettingsModal from "./src/components/SettingsModal";

const BACKEND_URL_KEY = "BACKEND_URL";
let msgCounter = 0;
const newId = () => `msg_${Date.now()}_${++msgCounter}`;

function TypingIndicator() {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(480 - i * 160),
        ])
      )
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, []);

  return (
    <View style={typingStyles.row}>
      <View style={typingStyles.avatar}>
        <Text style={{ fontSize: 14 }}>🤖</Text>
      </View>
      <View style={typingStyles.bubble}>
        {dots.map((dot, i) => (
          <Animated.View
            key={i}
            style={[typingStyles.dot, { opacity: dot, transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }]}
          />
        ))}
      </View>
    </View>
  );
}

const typingStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", marginHorizontal: 12, marginVertical: 5 },
  avatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "#1e293b", alignItems: "center", justifyContent: "center",
    marginRight: 8, borderWidth: 1, borderColor: "#334155",
  },
  bubble: {
    backgroundColor: "#1e293b", borderRadius: 22, borderBottomLeftRadius: 5,
    borderWidth: 1, borderColor: "#334155",
    paddingHorizontal: 16, paddingVertical: 14,
    flexDirection: "row", alignItems: "center", gap: 5,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#60a5fa" },
});

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [apiHistory, setApiHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [backendUrl, setBackendUrl] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    AsyncStorage.getItem(BACKEND_URL_KEY).then((saved) => {
      if (saved) setBackendUrl(saved);
      else setShowSettings(true);
    });
  }, []);

  useEffect(() => {
    if (backendUrl && messages.length === 0) {
      setMessages([{
        id: newId(), role: "assistant", timestamp: Date.now(),
        content: "Hi! I'm your personal assistant 👋\n\nI can **search the web**, manage your **calendar**, take **notes**, set **reminders**, remember your **preferences**, and more.\n\nHow can I help you today?",
      }]);
    }
  }, [backendUrl]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const handleSend = useCallback(async (text: string) => {
    if (!backendUrl) { setShowSettings(true); return; }

    setMessages((prev) => [...prev, { id: newId(), role: "user", content: text, timestamp: Date.now() }]);
    setLoading(true);
    scrollToBottom();

    try {
      const result = await sendMessage(backendUrl, text, apiHistory);
      setMessages((prev) => [...prev, { id: newId(), role: "assistant", content: result.reply, timestamp: Date.now() }]);
      setApiHistory(result.history);
    } catch (err: unknown) {
      setMessages((prev) => [...prev, {
        id: newId(), role: "assistant", timestamp: Date.now(),
        content: `⚠️ **Error:** ${err instanceof Error ? err.message : "Failed to reach server."}\n\nCheck your backend URL in Settings.`,
      }]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }, [backendUrl, apiHistory, scrollToBottom]);

  const handleSaveUrl = useCallback(async (url: string) => {
    await AsyncStorage.setItem(BACKEND_URL_KEY, url);
    setBackendUrl(url);
    setShowSettings(false);
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0f1e" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Text style={{ fontSize: 20 }}>🤖</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>Personal Assistant</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, backendUrl ? styles.statusOnline : styles.statusOffline]} />
              <Text style={styles.statusText}>{backendUrl ? "Online" : "Not configured"}</Text>
            </View>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => { setMessages([]); setApiHistory([]); }} style={styles.iconBtn}>
            <Text style={styles.iconBtnText}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.iconBtn}>
            <Text style={styles.iconBtnText}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={styles.list}
          onContentSizeChange={scrollToBottom}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>✨</Text>
              <Text style={styles.emptyTitle}>What can I help with?</Text>
              <View style={styles.suggestionGrid}>
                {["Search the web", "Add calendar event", "Create a note", "Set a reminder"].map((s) => (
                  <TouchableOpacity key={s} style={styles.suggestion} onPress={() => handleSend(s)}>
                    <Text style={styles.suggestionText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
        />

        {loading && <TypingIndicator />}
        <ChatInput onSend={handleSend} disabled={loading} />
      </KeyboardAvoidingView>

      <SettingsModal
        visible={showSettings}
        currentUrl={backendUrl}
        onSave={handleSaveUrl}
        onClose={backendUrl ? () => setShowSettings(false) : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0a0f1e" },
  flex: { flex: 1 },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: "#0a0f1e",
    borderBottomWidth: 1, borderBottomColor: "#1e293b",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "#1e293b", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#334155",
  },
  headerTitle: { color: "#f1f5f9", fontSize: 16, fontWeight: "700" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusOnline: { backgroundColor: "#22c55e" },
  statusOffline: { backgroundColor: "#64748b" },
  statusText: { color: "#64748b", fontSize: 12 },
  headerActions: { flexDirection: "row", gap: 4 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#1e293b", alignItems: "center", justifyContent: "center",
  },
  iconBtnText: { fontSize: 16 },

  list: { paddingVertical: 16, paddingBottom: 8, flexGrow: 1 },

  emptyState: { flex: 1, alignItems: "center", paddingTop: 60, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: "#94a3b8", fontSize: 18, fontWeight: "600", marginBottom: 24 },
  suggestionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  suggestion: {
    backgroundColor: "#1e293b", borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1, borderColor: "#334155",
  },
  suggestionText: { color: "#94a3b8", fontSize: 14 },
});
