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
import { AiFeedItem, TrendingArticle } from "../types";
import { getAiFeed, refreshAiFeed, getTrendingArticles, refreshTrendingArticles } from "../api";
import PlaygroundModal from "./PlaygroundModal";

// ── AI Radar helpers ──────────────────────────────────────────────────────────

function cardQuestions(item: AiFeedItem): string[] {
  return [
    `How do I get started with ${item.title}?`,
    `How does ${item.title} compare to alternatives?`,
    `Can I integrate ${item.title} into a Python project?`,
  ];
}

const AI_CATEGORY_META: Record<string, { emoji: string; color: string }> = {
  model:   { emoji: "🧠", color: "#6366f1" },
  tool:    { emoji: "🔧", color: "#0ea5e9" },
  library: { emoji: "📦", color: "#10b981" },
  paper:   { emoji: "📄", color: "#f59e0b" },
  news:    { emoji: "📡", color: "#ec4899" },
};

// ── Trending category colors ──────────────────────────────────────────────────

const TREND_COLORS: Record<string, string> = {
  World:      "#ec4899",
  Technology: "#6366f1",
  Science:    "#10b981",
  Business:   "#f59e0b",
  Health:     "#22c55e",
  Sports:     "#0ea5e9",
};

// ── Trending article card ─────────────────────────────────────────────────────

function TrendingCard({ article }: { article: TrendingArticle }) {
  const color = TREND_COLORS[article.category] ?? "#6366f1";

  const openArticle = () => {
    if (article.url) Linking.openURL(article.url);
  };

  return (
    <TouchableOpacity style={styles.trendCard} activeOpacity={0.75} onPress={openArticle}>
      <View style={styles.trendCardTop}>
        <View style={[styles.trendCategoryBadge, { backgroundColor: color + "22" }]}>
          <Text style={[styles.trendCategoryText, { color }]}>{article.category}</Text>
        </View>
        {article.source ? (
          <Text style={styles.trendSource}>{article.source}</Text>
        ) : null}
      </View>
      <Text style={styles.trendTitle} numberOfLines={3}>{article.title}</Text>
      <Text style={styles.trendSummary} numberOfLines={4}>{article.summary}</Text>
      <View style={styles.trendFooter}>
        <Text style={[styles.trendReadBtn, { color }]}>Read article →</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Trending section ──────────────────────────────────────────────────────────

interface TrendingSectionProps {
  articles: TrendingArticle[];
  loading: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}

function TrendingSection({ articles, loading, onRefresh, refreshing }: TrendingSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>📰 Top Trending</Text>
        <TouchableOpacity
          onPress={onRefresh}
          style={[styles.sectionRefreshBtn, refreshing && { opacity: 0.5 }]}
          disabled={refreshing}
        >
          {refreshing
            ? <ActivityIndicator size="small" color="#475569" />
            : <Text style={styles.sectionRefreshText}>↻</Text>
          }
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.sectionLoading}>
          <ActivityIndicator size="small" color="#6366f1" />
          <Text style={styles.sectionLoadingText}>Fetching trending stories…</Text>
        </View>
      ) : articles.length === 0 ? (
        <View style={styles.sectionEmpty}>
          <Text style={styles.sectionEmptyText}>No trending articles yet — tap ↻ to load</Text>
        </View>
      ) : (
        <FlatList
          horizontal
          data={articles}
          keyExtractor={(a) => a.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.trendList}
          renderItem={({ item }) => <TrendingCard article={item} />}
          snapToInterval={268}
          decelerationRate="fast"
        />
      )}
    </View>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  backendUrl: string;
}

export default function AiFeedModal({ visible, onClose, backendUrl }: Props) {
  const [feedItems, setFeedItems] = useState<AiFeedItem[]>([]);
  const [trending, setTrending] = useState<TrendingArticle[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [trendLoading, setTrendLoading] = useState(false);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [trendRefreshing, setTrendRefreshing] = useState(false);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [playgroundTool, setPlaygroundTool] = useState<AiFeedItem | null>(null);
  const [playgroundInitialQ, setPlaygroundInitialQ] = useState<string | undefined>();

  const openPlayground = (item: AiFeedItem, question?: string) => {
    setPlaygroundInitialQ(question);
    setPlaygroundTool(item);
  };

  const loadFeed = useCallback(async () => {
    setFeedLoading(true);
    const feed = await getAiFeed(backendUrl);
    setFeedItems(feed);
    if (feed.length > 0) setLastFetched(feed[0].fetched_at);
    setFeedLoading(false);
  }, [backendUrl]);

  const loadTrending = useCallback(async () => {
    setTrendLoading(true);
    const articles = await getTrendingArticles(backendUrl);
    setTrending(articles);
    setTrendLoading(false);
  }, [backendUrl]);

  const onRefreshFeed = useCallback(async () => {
    setFeedRefreshing(true);
    await refreshAiFeed(backendUrl);
    await loadFeed();
    setFeedRefreshing(false);
  }, [backendUrl, loadFeed]);

  const onRefreshTrending = useCallback(async () => {
    setTrendRefreshing(true);
    await refreshTrendingArticles(backendUrl);
    await loadTrending();
    setTrendRefreshing(false);
  }, [backendUrl, loadTrending]);

  useEffect(() => {
    if (visible) {
      loadFeed();
      loadTrending();
    }
  }, [visible]);

  const renderFeedItem = ({ item }: { item: AiFeedItem }) => {
    const meta = AI_CATEGORY_META[item.category] ?? AI_CATEGORY_META.news;
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
          <TouchableOpacity style={styles.tryBtn} onPress={() => openPlayground(item)}>
            <Text style={styles.tryBtnText}>🧪 Try It</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const ListHeader = (
    <>
      {/* Trending subsection */}
      <TrendingSection
        articles={trending}
        loading={trendLoading}
        onRefresh={onRefreshTrending}
        refreshing={trendRefreshing}
      />

      {/* AI Radar subsection header */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🤖 AI Radar</Text>
          <TouchableOpacity
            onPress={onRefreshFeed}
            style={[styles.sectionRefreshBtn, feedRefreshing && { opacity: 0.5 }]}
            disabled={feedRefreshing}
          >
            {feedRefreshing
              ? <ActivityIndicator size="small" color="#475569" />
              : <Text style={styles.sectionRefreshText}>↻</Text>
            }
          </TouchableOpacity>
        </View>
        {lastFetched && (
          <Text style={styles.sectionSubtitle}>
            Updated {new Date(lastFetched).toLocaleDateString()}
          </Text>
        )}
      </View>

      {feedLoading && !feedRefreshing && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loadingText}>Scanning AI landscape…</Text>
        </View>
      )}
    </>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {/* Modal header */}
        <View style={styles.header}>
          <Text style={styles.title}>Feed</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>Done</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={feedLoading && !feedRefreshing ? [] : feedItems}
          keyExtractor={(i) => i.id}
          renderItem={renderFeedItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            !feedLoading ? (
              <View style={styles.emptyAiRadar}>
                <Text style={styles.emptySubtitle}>Tap ↻ to fetch the latest AI news</Text>
              </View>
            ) : null
          }
        />
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
  container: { flex: 1, backgroundColor: "#080d1a" },

  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: "#0f1729",
  },
  title: { fontSize: 20, fontWeight: "700", color: "#f1f5f9" },
  closeBtn: { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: "#0f1729", borderRadius: 8 },
  closeText: { color: "#94a3b8", fontWeight: "600", fontSize: 15 },

  list: { paddingBottom: 32 },

  // ── Section headers ──
  section: { marginTop: 4 },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#f1f5f9" },
  sectionSubtitle: { fontSize: 12, color: "#3d5475", paddingHorizontal: 20, marginBottom: 4 },
  sectionRefreshBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "#0f1729", borderWidth: 1, borderColor: "#1a2540",
    alignItems: "center", justifyContent: "center",
  },
  sectionRefreshText: { color: "#6366f1", fontSize: 16, fontWeight: "700" },
  sectionLoading: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingBottom: 16 },
  sectionLoadingText: { color: "#3d5475", fontSize: 13 },
  sectionEmpty: { paddingHorizontal: 20, paddingBottom: 16 },
  sectionEmptyText: { color: "#3d5475", fontSize: 13 },

  // ── Trending cards (horizontal scroll) ──
  trendList: { paddingHorizontal: 16, paddingBottom: 4, gap: 12 },
  trendCard: {
    width: 256,
    backgroundColor: "#0f1729",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1a2540",
  },
  trendCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  trendCategoryBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
  trendCategoryText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  trendSource: { fontSize: 11, color: "#3d5475", fontWeight: "500" },
  trendTitle: { fontSize: 14, fontWeight: "700", color: "#e2e8f0", lineHeight: 20, marginBottom: 8 },
  trendSummary: { fontSize: 12, color: "#64748b", lineHeight: 18, flex: 1, marginBottom: 12 },
  trendFooter: { marginTop: "auto" as any },
  trendReadBtn: { fontSize: 12, fontWeight: "700" },

  // ── AI Radar cards (vertical list) ──
  card: {
    backgroundColor: "#0f1729",
    borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: "#1a2540",
    marginHorizontal: 16, marginBottom: 12,
  },
  cardHeader: { flexDirection: "row", marginBottom: 8 },
  categoryBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  categoryText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#f1f5f9", marginBottom: 6 },
  cardSummary: { fontSize: 13, color: "#64748b", lineHeight: 19, marginBottom: 10 },
  whyBox: {
    backgroundColor: "#080d1a", borderRadius: 10, padding: 10,
    borderLeftWidth: 3, borderLeftColor: "#6366f1", marginBottom: 10,
  },
  whyLabel: { fontSize: 10, color: "#6366f1", fontWeight: "700", marginBottom: 2, textTransform: "uppercase" },
  whyText: { fontSize: 12, color: "#94a3b8", lineHeight: 17 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardUrl: { fontSize: 11, color: "#334155", flex: 1, marginRight: 10 },
  tryBtn: { backgroundColor: "#6366f1", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  tryBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  questionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  questionChip: {
    backgroundColor: "#080d1a", borderWidth: 1, borderColor: "#1a2540",
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, maxWidth: "100%",
  },
  questionChipText: { fontSize: 11, color: "#64748b" },

  center: { alignItems: "center", paddingVertical: 32, gap: 12 },
  loadingText: { color: "#3d5475", fontSize: 14 },
  emptyAiRadar: { paddingHorizontal: 20, paddingBottom: 16 },
  emptySubtitle: { fontSize: 13, color: "#3d5475" },
});
