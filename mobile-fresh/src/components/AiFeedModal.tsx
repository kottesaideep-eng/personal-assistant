import React, { useState, useEffect, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  SafeAreaView,
} from "react-native";
import { AiFeedItem } from "../types";
import { getAiFeed, refreshAiFeed } from "../api";
import PlaygroundModal from "./PlaygroundModal";

function cardQuestions(item: AiFeedItem): string[] {
  return [
    `How do I get started with ${item.title}?`,
    `How does ${item.title} compare to alternatives?`,
    `Can I integrate ${item.title} into a Python project?`,
  ];
}

const CATEGORY_META: Record<string, { emoji: string; color: string }> = {
  model:   { emoji: "🧠", color: "#6366f1" },
  tool:    { emoji: "🔧", color: "#0ea5e9" },
  library: { emoji: "📦", color: "#10b981" },
  paper:   { emoji: "📄", color: "#f59e0b" },
  news:    { emoji: "📡", color: "#ec4899" },
};

interface Props {
  visible: boolean;
  onClose: () => void;
  backendUrl: string;
}

export default function AiFeedModal({ visible, onClose, backendUrl }: Props) {
  const [items, setItems] = useState<AiFeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [playgroundTool, setPlaygroundTool] = useState<AiFeedItem | null>(null);
  const [playgroundInitialQ, setPlaygroundInitialQ] = useState<string | undefined>();

  const openPlayground = (item: AiFeedItem, question?: string) => {
    setPlaygroundInitialQ(question);
    setPlaygroundTool(item);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const feed = await getAiFeed(backendUrl);
    setItems(feed);
    if (feed.length > 0) setLastFetched(feed[0].fetched_at);
    setLoading(false);
  }, [backendUrl]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAiFeed(backendUrl);
    await load();
    setRefreshing(false);
  }, [backendUrl, load]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const renderItem = ({ item }: { item: AiFeedItem }) => {
    const meta = CATEGORY_META[item.category] ?? CATEGORY_META.news;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.75}
        onPress={() => item.url && Linking.openURL(item.url)}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.categoryBadge, { backgroundColor: meta.color + "22" }]}>
            <Text style={[styles.categoryText, { color: meta.color }]}>
              {meta.emoji} {item.category}
            </Text>
          </View>
        </View>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardSummary}>{item.summary}</Text>
        <View style={styles.whyBox}>
          <Text style={styles.whyLabel}>Why useful →</Text>
          <Text style={styles.whyText}>{item.why_useful}</Text>
        </View>
        <View style={styles.questionsRow}>
          {cardQuestions(item).map((q) => (
            <TouchableOpacity key={q} style={styles.questionChip} onPress={() => openPlayground(item, q)}>
              <Text style={styles.questionChipText} numberOfLines={2}>💬 {q}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.cardUrl} numberOfLines={1}>{item.url}</Text>
          <TouchableOpacity
            style={styles.tryBtn}
            onPress={() => openPlayground(item)}
          >
            <Text style={styles.tryBtnText}>🧪 Try It</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>🤖 AI Radar</Text>
            {lastFetched && (
              <Text style={styles.subtitle}>
                Updated {new Date(lastFetched).toLocaleDateString()}
              </Text>
            )}
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={onRefresh}
              style={[styles.refreshBtn, refreshing && styles.refreshBtnDisabled]}
              disabled={refreshing}
            >
              {refreshing
                ? <ActivityIndicator size="small" color="#6366f1" />
                : <Text style={styles.refreshText}>↻ Refresh</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading && !refreshing ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#6366f1" />
            <Text style={styles.loadingText}>Scanning AI landscape…</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyEmoji}>📡</Text>
            <Text style={styles.emptyTitle}>No feed yet</Text>
            <Text style={styles.emptySubtitle}>Tap Refresh to fetch the latest AI news</Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(i) => i.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
          />
        )}
      </SafeAreaView>

      <PlaygroundModal
        visible={playgroundTool !== null}
        onClose={() => { setPlaygroundTool(null); setPlaygroundInitialQ(undefined); }}
        backendUrl={backendUrl}
        tool={playgroundTool}
        initialQuestion={playgroundInitialQ}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: "#1e293b",
  },
  title: { fontSize: 20, fontWeight: "700", color: "#f1f5f9" },
  subtitle: { fontSize: 12, color: "#64748b", marginTop: 2 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  refreshBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#1e293b", borderRadius: 8, minWidth: 80, alignItems: "center" },
  refreshBtnDisabled: { opacity: 0.5 },
  refreshText: { color: "#6366f1", fontWeight: "600", fontSize: 14 },
  closeBtn: { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: "#1e293b", borderRadius: 8 },
  closeText: { color: "#94a3b8", fontWeight: "600", fontSize: 15 },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: "#1e293b", borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: "#334155",
  },
  cardHeader: { flexDirection: "row", marginBottom: 8 },
  categoryBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  categoryText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#f1f5f9", marginBottom: 6 },
  cardSummary: { fontSize: 13, color: "#94a3b8", lineHeight: 19, marginBottom: 10 },
  whyBox: {
    backgroundColor: "#0f172a", borderRadius: 8, padding: 10,
    borderLeftWidth: 3, borderLeftColor: "#6366f1", marginBottom: 10,
  },
  whyLabel: { fontSize: 10, color: "#6366f1", fontWeight: "700", marginBottom: 2, textTransform: "uppercase" },
  whyText: { fontSize: 12, color: "#cbd5e1", lineHeight: 17 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardUrl: { fontSize: 11, color: "#475569", flex: 1, marginRight: 10 },
  tryBtn: { backgroundColor: "#6366f1", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  tryBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  questionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  questionChip: { backgroundColor: "#0f172a", borderWidth: 1, borderColor: "#334155", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, maxWidth: "100%" },
  questionChipText: { fontSize: 11, color: "#94a3b8" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: "#64748b", fontSize: 14 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#f1f5f9" },
  emptySubtitle: { fontSize: 13, color: "#64748b", textAlign: "center", paddingHorizontal: 40 },
});
