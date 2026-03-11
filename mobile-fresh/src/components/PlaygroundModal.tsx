import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Clipboard,
  Alert,
} from "react-native";
import { AiFeedItem } from "../types";
import { explorePlayground, PlaygroundGuide, sendMessage } from "../api";
import { HistoryItem } from "../types";

interface Props {
  visible: boolean;
  onClose: () => void;
  backendUrl: string;
  tool: AiFeedItem | null;
  initialQuestion?: string;
}

type Tab = "guide" | "chat";

function CodeBlock({ code, label }: { code: string; label: string }) {
  const copy = () => {
    Clipboard.setString(code);
    Alert.alert("Copied!", `${label} copied to clipboard`);
  };
  return (
    <View style={codeStyles.wrapper}>
      <View style={codeStyles.header}>
        <Text style={codeStyles.label}>{label}</Text>
        <TouchableOpacity onPress={copy} style={codeStyles.copyBtn}>
          <Text style={codeStyles.copyText}>Copy</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text style={codeStyles.code}>{code}</Text>
      </ScrollView>
    </View>
  );
}

const codeStyles = StyleSheet.create({
  wrapper: { backgroundColor: "#020617", borderRadius: 10, marginVertical: 8, overflow: "hidden", borderWidth: 1, borderColor: "#1e293b" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#0f172a", borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  label: { fontSize: 11, color: "#64748b", fontWeight: "600", textTransform: "uppercase" },
  copyBtn: { backgroundColor: "#1e293b", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
  copyText: { color: "#6366f1", fontSize: 12, fontWeight: "600" },
  code: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 12, color: "#e2e8f0", padding: 12, lineHeight: 18 },
});

export default function PlaygroundModal({ visible, onClose, backendUrl, tool, initialQuestion }: Props) {
  const [tab, setTab] = useState<Tab>("guide");
  const [guide, setGuide] = useState<PlaygroundGuide | null>(null);
  const [loadingGuide, setLoadingGuide] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [chatHistory, setChatHistory] = useState<HistoryItem[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!visible || !tool) return;
    setTab(initialQuestion ? "chat" : "guide");
    setGuide(null);
    setChatMessages([]);
    setChatHistory([]);
    setChatInput(initialQuestion ?? "");
    loadGuide();
  }, [visible, tool?.id]);

  const loadGuide = async () => {
    if (!tool) return;
    setLoadingGuide(true);
    const g = await explorePlayground(backendUrl, tool);
    setGuide(g);
    setLoadingGuide(false);
    // Seed the chat with a starter message
    if (g?.chat_starter) {
      setChatMessages([{ role: "assistant", text: g.chat_starter }]);
      setChatHistory([{ role: "assistant", content: g.chat_starter }]);
    }
  };

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading || !tool) return;
    const userText = chatInput.trim();
    setChatInput("");

    const context = guide
      ? `Context: the user is exploring "${tool.title}". Overview: ${guide.overview}`
      : `Context: the user is exploring "${tool.title}". ${tool.summary}`;

    const messageToSend = chatMessages.length <= 1
      ? `${context}\n\nUser question: ${userText}`
      : userText;

    setChatMessages((prev) => [...prev, { role: "user", text: userText }]);
    setChatLoading(true);
    setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const { reply, history } = await sendMessage(backendUrl, messageToSend, chatHistory);
      setChatMessages((prev) => [...prev, { role: "assistant", text: reply }]);
      setChatHistory(history);
    } catch {
      setChatMessages((prev) => [...prev, { role: "assistant", text: "Sorry, something went wrong. Try again." }]);
    }
    setChatLoading(false);
    setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 100);
  };

  if (!tool) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title} numberOfLines={1}>🧪 {tool.title}</Text>
            <Text style={styles.subtitle}>{tool.category}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, tab === "guide" && styles.tabActive]} onPress={() => setTab("guide")}>
            <Text style={[styles.tabText, tab === "guide" && styles.tabTextActive]}>📖 Guide</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, tab === "chat" && styles.tabActive]} onPress={() => setTab("chat")}>
            <Text style={[styles.tabText, tab === "chat" && styles.tabTextActive]}>💬 Ask Claude</Text>
          </TouchableOpacity>
        </View>

        {/* Guide Tab */}
        {tab === "guide" && (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {loadingGuide ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color="#6366f1" />
                <Text style={styles.loadingText}>Generating integration guide…</Text>
                <Text style={styles.loadingSubtext}>Claude is researching {tool.title}</Text>
              </View>
            ) : guide ? (
              <>
                {/* Overview */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Overview</Text>
                  <Text style={styles.body}>{guide.overview}</Text>
                </View>

                {/* Install */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Installation</Text>
                  <CodeBlock code={guide.install} label="terminal" />
                </View>

                {/* Quick start */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Quick Start</Text>
                  <CodeBlock code={guide.quickstart} label="quickstart.py" />
                </View>

                {/* Roar integration */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Add to Roar App</Text>
                  <Text style={styles.sectionSubtitle}>Drop this into your server.py or tools/</Text>
                  <CodeBlock code={guide.roar_integration} label="server.py / tools" />
                </View>

                {/* Standalone */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Standalone Script</Text>
                  <Text style={styles.sectionSubtitle}>Run this independently to try it out</Text>
                  <CodeBlock code={guide.standalone} label="standalone.py" />
                </View>

                {/* Tips */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Tips & Gotchas</Text>
                  {guide.tips.map((tip, i) => (
                    <View key={i} style={styles.tipRow}>
                      <Text style={styles.tipBullet}>→</Text>
                      <Text style={styles.tipText}>{tip}</Text>
                    </View>
                  ))}
                </View>

                {/* Chat CTA */}
                <TouchableOpacity style={styles.chatCta} onPress={() => setTab("chat")}>
                  <Text style={styles.chatCtaText}>💬 Ask Claude to customize this for you</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.center}>
                <Text style={styles.errorText}>Failed to generate guide. Check your connection.</Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* Chat Tab */}
        {tab === "chat" && (
          <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <FlatList
              ref={chatRef}
              data={chatMessages}
              keyExtractor={(_, i) => String(i)}
              contentContainerStyle={styles.chatList}
              renderItem={({ item }) => (
                <View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.aiBubble]}>
                  <Text style={[styles.bubbleText, item.role === "user" ? styles.userText : styles.aiText]}>
                    {item.text}
                  </Text>
                </View>
              )}
            />
            {chatLoading && (
              <View style={styles.chatLoading}>
                <ActivityIndicator size="small" color="#6366f1" />
                <Text style={styles.chatLoadingText}>Claude is thinking…</Text>
              </View>
            )}
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={chatInput}
                onChangeText={setChatInput}
                placeholder={`Ask about ${tool.title}…`}
                placeholderTextColor="#475569"
                multiline
                onSubmitEditing={sendChat}
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!chatInput.trim() || chatLoading) && styles.sendBtnDisabled]}
                onPress={sendChat}
                disabled={!chatInput.trim() || chatLoading}
              >
                <Text style={styles.sendText}>↑</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  flex: { flex: 1 },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "#1e293b",
  },
  headerLeft: { flex: 1, marginRight: 12 },
  title: { fontSize: 18, fontWeight: "700", color: "#f1f5f9" },
  subtitle: { fontSize: 12, color: "#6366f1", marginTop: 2, textTransform: "uppercase", fontWeight: "600" },
  closeBtn: { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: "#1e293b", borderRadius: 8 },
  closeText: { color: "#6366f1", fontWeight: "600", fontSize: 15 },
  tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: "#6366f1" },
  tabText: { fontSize: 14, color: "#64748b", fontWeight: "600" },
  tabTextActive: { color: "#6366f1" },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#f1f5f9", marginBottom: 4 },
  sectionSubtitle: { fontSize: 12, color: "#64748b", marginBottom: 6 },
  body: { fontSize: 14, color: "#94a3b8", lineHeight: 21 },
  tipRow: { flexDirection: "row", marginBottom: 8, gap: 8 },
  tipBullet: { color: "#6366f1", fontWeight: "700", fontSize: 14, marginTop: 1 },
  tipText: { flex: 1, fontSize: 13, color: "#94a3b8", lineHeight: 19 },
  chatCta: {
    backgroundColor: "#6366f1", borderRadius: 12, padding: 14,
    alignItems: "center", marginTop: 8,
  },
  chatCtaText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  loadingText: { color: "#f1f5f9", fontSize: 16, fontWeight: "600" },
  loadingSubtext: { color: "#64748b", fontSize: 13 },
  errorText: { color: "#94a3b8", fontSize: 14 },
  // Chat
  chatList: { padding: 16, gap: 10 },
  bubble: { maxWidth: "85%", borderRadius: 16, padding: 12 },
  userBubble: { alignSelf: "flex-end", backgroundColor: "#6366f1", borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: "flex-start", backgroundColor: "#1e293b", borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  userText: { color: "#fff" },
  aiText: { color: "#e2e8f0" },
  chatLoading: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  chatLoadingText: { color: "#64748b", fontSize: 13 },
  inputRow: {
    flexDirection: "row", alignItems: "flex-end", gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: "#1e293b",
  },
  input: {
    flex: 1, backgroundColor: "#1e293b", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    color: "#f1f5f9", fontSize: 14, maxHeight: 100,
    borderWidth: 1, borderColor: "#334155",
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "#6366f1", alignItems: "center", justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: "#1e293b" },
  sendText: { color: "#fff", fontSize: 20, fontWeight: "700" },
});
