import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
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
function newId() {
  return `msg_${Date.now()}_${++msgCounter}`;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [apiHistory, setApiHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [backendUrl, setBackendUrl] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  // Load saved backend URL on mount
  useEffect(() => {
    AsyncStorage.getItem(BACKEND_URL_KEY).then((saved) => {
      if (saved) {
        setBackendUrl(saved);
      } else {
        setShowSettings(true); // First launch — prompt for URL
      }
    });
  }, []);

  // Add a welcome message once URL is configured
  useEffect(() => {
    if (backendUrl && messages.length === 0) {
      setMessages([
        {
          id: newId(),
          role: "assistant",
          content:
            "Hi! I'm your personal assistant 👋\n\nI can search the web, manage your calendar, take notes, set reminders, remember your preferences, and more. How can I help you today?",
          timestamp: Date.now(),
        },
      ]);
    }
  }, [backendUrl]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      if (!backendUrl) {
        setShowSettings(true);
        return;
      }

      const userMsg: Message = {
        id: newId(),
        role: "user",
        content: text,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);
      scrollToBottom();

      try {
        const result = await sendMessage(backendUrl, text, apiHistory);

        const assistantMsg: Message = {
          id: newId(),
          role: "assistant",
          content: result.reply,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMsg]);
        setApiHistory(result.history);
        scrollToBottom();
      } catch (err: unknown) {
        const errorMsg: Message = {
          id: newId(),
          role: "assistant",
          content: `⚠️ Error: ${err instanceof Error ? err.message : "Failed to reach server."}\n\nCheck your backend URL in Settings.`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
        scrollToBottom();
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, apiHistory, scrollToBottom]
  );

  const handleSaveUrl = useCallback(async (url: string) => {
    await AsyncStorage.setItem(BACKEND_URL_KEY, url);
    setBackendUrl(url);
    setShowSettings(false);
  }, []);

  const handleClearChat = useCallback(() => {
    setMessages([]);
    setApiHistory([]);
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Personal Assistant</Text>
          <Text style={styles.headerSub}>
            {backendUrl ? "● Connected" : "○ Not configured"}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleClearChat} style={styles.iconBtn}>
            <Text style={styles.iconBtnText}>🗑</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowSettings(true)}
            style={styles.iconBtn}
          >
            <Text style={styles.iconBtnText}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {/* Message list */}
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
              <Text style={styles.emptyIcon}>🤖</Text>
              <Text style={styles.emptyText}>
                {backendUrl
                  ? "Start a conversation…"
                  : "Configure your backend URL to get started."}
              </Text>
            </View>
          }
        />

        {/* Typing indicator */}
        {loading && (
          <View style={styles.typingRow}>
            <ActivityIndicator color="#3b82f6" size="small" />
            <Text style={styles.typingText}>  Thinking…</Text>
          </View>
        )}

        {/* Input */}
        <ChatInput onSend={handleSend} disabled={loading} />
      </KeyboardAvoidingView>

      {/* Settings modal */}
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
  safe: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0f172a",
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  headerTitle: {
    color: "#f1f5f9",
    fontSize: 17,
    fontWeight: "700",
  },
  headerSub: {
    color: "#22c55e",
    fontSize: 12,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: "row",
    gap: 4,
  },
  iconBtn: {
    padding: 8,
  },
  iconBtnText: {
    fontSize: 20,
  },
  list: {
    paddingVertical: 12,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyText: {
    color: "#475569",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  typingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  typingText: {
    color: "#64748b",
    fontSize: 13,
    fontStyle: "italic",
  },
});
