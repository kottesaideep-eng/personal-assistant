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
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";

import { Message, HistoryItem } from "./src/types";
import { sendMessage, registerDevice } from "./src/api";
import { updateWidgetLastMessage } from "./modules/shared-defaults";
import { donateSarvisShortcut, addSarvisShortcutListener } from "./src/utils/shortcut";
import { saveConversation, loadConversation } from "./src/utils/storage";
import { registerForPushNotificationsAsync, sendTokenToBackend } from "./src/utils/notifications";
import MessageBubble from "./src/components/MessageBubble";
import ChatInput from "./src/components/ChatInput";
import SettingsModal from "./src/components/SettingsModal";
import HistoryModal from "./src/components/HistoryModal";

const BACKEND_URL_KEY = "BACKEND_URL";
let msgCounter = 0;
const newId = () => `msg_${Date.now()}_${++msgCounter}`;

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  timestamp: Date.now(),
  content: "Hi! I'm your personal assistant 👋\n\nI can **search the web**, manage your **calendar**, take **notes**, set **reminders**, remember your **preferences**, and more.\n\nHow can I help you today?",
};

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
  const [showHistory, setShowHistory] = useState(false);
  const [autoVoice, setAutoVoice] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  // Load backend URL and init notifications
  useEffect(() => {
    AsyncStorage.getItem(BACKEND_URL_KEY).then((saved) => {
      if (saved) setBackendUrl(saved);
      else setShowSettings(true);
    });
  }, []);

  // Siri shortcut: donate on launch + listen for invocation
  useEffect(() => {
    donateSarvisShortcut();
    const removeSiriListener = addSarvisShortcutListener(() => {
      setAutoVoice(true);
      // Reset after activation so re-opening doesn't re-trigger
      setTimeout(() => setAutoVoice(false), 2000);
    });
    return () => removeSiriListener();
  }, []);

  // Deep link handler: sarvis://voice activates mic (Android + fallback)
  useEffect(() => {
    const activateIfVoiceUrl = (url: string | null) => {
      if (url?.includes("voice")) {
        setAutoVoice(true);
        setTimeout(() => setAutoVoice(false), 2000);
      }
    };

    Linking.getInitialURL().then(activateIfVoiceUrl);
    const sub = Linking.addEventListener("url", ({ url }) => activateIfVoiceUrl(url));
    return () => sub.remove();
  }, []);

  // Register for push notifications once backend URL is known
  useEffect(() => {
    if (!backendUrl) return;
    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        sendTokenToBackend(token, backendUrl);
        registerDevice(backendUrl, token, Platform.OS);
      }
    });

    // Handle notification tap-to-open
    const responseSub = Notifications.addNotificationResponseReceivedListener((_response) => {
      // Open app (already happens by default); could navigate to specific screen
    });
    return () => responseSub.remove();
  }, [backendUrl]);

  // Show welcome message when backend URL is set and no messages yet
  useEffect(() => {
    if (backendUrl && messages.length === 0) {
      setMessages([{ ...WELCOME_MESSAGE, id: newId(), timestamp: Date.now() }]);
    }
  }, [backendUrl]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const handleSend = useCallback(async (
    text: string,
    image?: { uri: string; base64: string; mimeType: string }
  ) => {
    if (!backendUrl) { setShowSettings(true); return; }

    const userMsg: Message = {
      id: newId(),
      role: "user",
      content: text,
      timestamp: Date.now(),
      imageUri: image?.uri,
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    scrollToBottom();

    try {
      const result = await sendMessage(
        backendUrl, text, apiHistory,
        image?.base64, image?.mimeType
      );
      setMessages((prev) => [...prev, { id: newId(), role: "assistant", content: result.reply, timestamp: Date.now() }]);
      setApiHistory(result.history);
      // Keep iOS widget in sync with latest reply
      updateWidgetLastMessage(result.reply.slice(0, 140));
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

  const handleClear = useCallback(async () => {
    // Auto-save current conversation before clearing (if there are user messages)
    const userMsgs = messages.filter((m) => m.role === "user" && m.id !== "welcome");
    if (userMsgs.length > 0) {
      const title = userMsgs[0].content.slice(0, 40) || "Conversation";
      await saveConversation(title, messages, apiHistory);
    }
    setMessages([{ ...WELCOME_MESSAGE, id: newId(), timestamp: Date.now() }]);
    setApiHistory([]);
  }, [messages, apiHistory]);

  const handleLoadConversation = useCallback(async (id: string) => {
    const data = await loadConversation(id);
    if (data) {
      setMessages(data.messages);
      setApiHistory(data.apiHistory);
    }
  }, []);

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
          <TouchableOpacity onPress={handleClear} style={styles.iconBtn}>
            <Text style={styles.iconBtnText}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowHistory(true)} style={styles.iconBtn}>
            <Text style={styles.iconBtnText}>📋</Text>
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
        <ChatInput onSend={handleSend} disabled={loading} autoActivateMic={autoVoice} />
      </KeyboardAvoidingView>

      <SettingsModal
        visible={showSettings}
        currentUrl={backendUrl}
        onSave={handleSaveUrl}
        onClose={backendUrl ? () => setShowSettings(false) : undefined}
      />

      <HistoryModal
        visible={showHistory}
        onClose={() => setShowHistory(false)}
        onNewChat={() => { setShowHistory(false); handleClear(); }}
        onLoadConversation={handleLoadConversation}
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
