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
import PendingRepliesModal from "./src/components/PendingRepliesModal";
import AiFeedModal from "./src/components/AiFeedModal";
import SuggestionBar from "./src/components/SuggestionBar";
import FloatingMenu from "./src/components/FloatingMenu";

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
  const [showPendingReplies, setShowPendingReplies] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [showAiFeed, setShowAiFeed] = useState(false);
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
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      if (data?.type === "pending_reply") {
        setShowPendingReplies(true);
      } else if (data?.type === "ai_feed") {
        setShowAiFeed(true);
      }
    });
    return () => responseSub.remove();
  }, [backendUrl]);

  // Show welcome message when backend URL is set and no messages yet
  useEffect(() => {
    if (backendUrl && messages.length === 0) {
      setMessages([{ ...WELCOME_MESSAGE, id: newId(), timestamp: Date.now() }]);
    }
  }, [backendUrl]);

  // Background badge poll: refresh pending count every 30s when modal is closed
  useEffect(() => {
    if (!backendUrl || showPendingReplies) return;
    const poll = async () => {
      try {
        const resp = await fetch(`${backendUrl}/pending-replies`);
        if (resp.ok) {
          const data = await resp.json();
          const count = data.filter((r: { status: string }) => r.status === "pending").length;
          setPendingCount(count);
        }
      } catch (_) {}
    };
    poll();
    const id = setInterval(poll, 30000);
    return () => clearInterval(id);
  }, [backendUrl, showPendingReplies]);

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
      <StatusBar barStyle="light-content" backgroundColor="#080d1a" />

      {/* Clean Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Text style={{ fontSize: 20 }}>🤖</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>Roar</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, backendUrl ? styles.statusOnline : styles.statusOffline]} />
              <Text style={styles.statusText}>{backendUrl ? "Ready" : "Not configured"}</Text>
            </View>
          </View>
        </View>
        {/* New chat button — top right only */}
        <TouchableOpacity onPress={handleClear} style={styles.newChatBtn}>
          <Text style={styles.newChatText}>+ New</Text>
        </TouchableOpacity>
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
        <SuggestionBar backendUrl={backendUrl} onSelect={(prompt) => handleSend(prompt)} />
        <ChatInput onSend={handleSend} disabled={loading} autoActivateMic={autoVoice} />
      </KeyboardAvoidingView>

      {/* Floating Action Menu */}
      <View style={styles.fabContainer} pointerEvents="box-none">
        <FloatingMenu
          onLongPress={handleClear}
          items={[
            { icon: "📡", label: "AI Radar", onPress: () => setShowAiFeed(true) },
            { icon: "📥", label: "Inbox", onPress: () => setShowPendingReplies(true), badge: pendingCount },
            { icon: "📋", label: "History", onPress: () => setShowHistory(true) },
            { icon: "⚙️", label: "Settings", onPress: () => setShowSettings(true) },
          ]}
        />
      </View>

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

      <PendingRepliesModal
        visible={showPendingReplies}
        backendUrl={backendUrl}
        onClose={() => setShowPendingReplies(false)}
        onCountChange={setPendingCount}
      />

      <AiFeedModal
        visible={showAiFeed}
        backendUrl={backendUrl}
        onClose={() => setShowAiFeed(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#080d1a" },
  flex: { flex: 1 },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 18, paddingVertical: 14,
    backgroundColor: "#080d1a",
    borderBottomWidth: 1, borderBottomColor: "#0f1729",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerIcon: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: "#6366f1", alignItems: "center", justifyContent: "center",
    shadowColor: "#6366f1", shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
  },
  headerTitle: { color: "#f1f5f9", fontSize: 18, fontWeight: "800", letterSpacing: 0.3 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusOnline: { backgroundColor: "#22c55e" },
  statusOffline: { backgroundColor: "#475569" },
  statusText: { color: "#475569", fontSize: 11 },

  newChatBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: "#0f1729",
    borderRadius: 20, borderWidth: 1, borderColor: "#1e293b",
  },
  newChatText: { color: "#6366f1", fontSize: 13, fontWeight: "700" },

  fabContainer: {
    position: "absolute", bottom: 0, right: 0, left: 0, top: 0,
    pointerEvents: "box-none",
  },

  list: { paddingVertical: 16, paddingBottom: 100, flexGrow: 1 },

  emptyState: { flex: 1, alignItems: "center", paddingTop: 80, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 52, marginBottom: 14 },
  emptyTitle: { color: "#64748b", fontSize: 17, fontWeight: "600", marginBottom: 28 },
  suggestionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  suggestion: {
    backgroundColor: "#0f1729", borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1, borderColor: "#1e293b",
  },
  suggestionText: { color: "#64748b", fontSize: 13 },
});
