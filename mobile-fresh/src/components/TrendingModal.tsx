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
import { TrendingArticle } from "../types";
import { getTrendingArticles, refreshTrendingArticles } from "../api";

const CATEGORY_COLORS: Record<string, string> = {
  World:      "#ec4899",
  Technology: "#6366f1",
  Science:    "#10b981",
  Business:   "#f59e0b",
  Health:     "#22c55e",
  Sports:     "#0ea5e9",
};

interface Props {
  visible: boolean;
  onClose: () => void;
  backendUrl: string;
}

export default function TrendingModal({ visible, onClose, backendUrl }: Props) {
  const [articles, setArticles] = useState<TrendingArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetched, setLastFetched] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getTrendingArticles(backendUrl);
    setArticles(data);
    if (data.length > 0) setLastFetched(data[0].fetched_at);
    setLoading(false);
  }, [backendUrl]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshTrendingArticles(backendUrl);
    await load();
    setRefreshing(false);
  }, [backendUrl, load]);

  useEffect(() => {
    if (visible) load();
  }, [visible]);

  const renderItem = ({ item, index }: { item: TrendingArticle; index: number }) => {
    const color = CATEGORY_COLORS[item.category] ?? "#6366f1";
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.75}
        onPress={() => item.url && Linking.openURL(item.url)}
      >
        <View style={styles.cardTop}>
          <View style={[styles.categoryBadge, { backgroundColor: color + "22" }]}>
            <Text style={[styles.categoryText, { color }]}>{item.category}</Text>
          </View>
          {item.source ? <Text style={styles.source}>{item.source}</Text> : null}
          <View style={styles.indexBadge}>
            <Text style={styles.indexText}>{index + 1}</Text>
          </View>
        </View>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.summary}>{item.summary}</Text>
        <Text style={[styles.readBtn, { color }]}>Read article →</Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title_}>📰 Top Trending</Text>
            {lastFetched && (
              <Text style={styles.subtitle}>
                Updated {new Date(lastFetched).toLocaleDateString()}
              </Text>
            )}
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={onRefresh}
              style={[styles.refreshBtn, refreshing && { opacity: 0.5 }]}
              disabled={refreshing}
            >
              {refreshing
                ? <ActivityIndicator size="small" color="#ec4899" />
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
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={styles.loadingText}>Fetching trending stories…</Text>
          </View>
        ) : articles.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyEmoji}>📰</Text>
            <Text style={styles.emptyTitle}>No trending articles yet</Text>
            <Text style={styles.emptySubtitle}>Tap Refresh to fetch today's top stories</Text>
          </View>
        ) : (
          <FlatList
            data={articles}
            keyExtractor={(a) => a.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#080d1a" },

  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: "#0f1729",
  },
  title_: { fontSize: 20, fontWeight: "700", color: "#f1f5f9" },
  subtitle: { fontSize: 12, color: "#3d5475", marginTop: 2 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  refreshBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: "#0f1729", borderRadius: 8,
    minWidth: 80, alignItems: "center",
    borderWidth: 1, borderColor: "#1a2540",
  },
  refreshText: { color: "#ec4899", fontWeight: "600", fontSize: 14 },
  closeBtn: { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: "#0f1729", borderRadius: 8 },
  closeText: { color: "#94a3b8", fontWeight: "600", fontSize: 15 },

  list: { padding: 16, gap: 12 },

  card: {
    backgroundColor: "#0f1729",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1a2540",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  categoryBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
  categoryText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  source: { fontSize: 11, color: "#3d5475", fontWeight: "500", flex: 1 },
  indexBadge: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "#1a2540", alignItems: "center", justifyContent: "center",
  },
  indexText: { color: "#475569", fontSize: 11, fontWeight: "700" },

  title: { fontSize: 15, fontWeight: "700", color: "#e2e8f0", lineHeight: 22, marginBottom: 8 },
  summary: { fontSize: 13, color: "#64748b", lineHeight: 19, marginBottom: 12 },
  readBtn: { fontSize: 13, fontWeight: "700" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: "#3d5475", fontSize: 14 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#f1f5f9" },
  emptySubtitle: { fontSize: 13, color: "#3d5475", textAlign: "center", paddingHorizontal: 40 },
});
