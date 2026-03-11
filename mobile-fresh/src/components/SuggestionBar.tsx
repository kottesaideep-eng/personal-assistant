import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { getSuggestions, Suggestion } from "../api";

const CATEGORY_COLORS: Record<string, string> = {
  AI:       "#6366f1",
  Tech:     "#0ea5e9",
  News:     "#ec4899",
  Science:  "#10b981",
  Business: "#f59e0b",
  Trending: "#f97316",
};

// Static fallback prompts shown before network loads
const FALLBACKS: Suggestion[] = [
  { text: "What's the latest in AI today?", category: "AI" },
  { text: "Any big tech news this week?", category: "Tech" },
  { text: "What's trending right now?", category: "Trending" },
  { text: "Summarize today's top news", category: "News" },
  { text: "What new AI tools launched today?", category: "AI" },
];

interface Props {
  backendUrl: string;
  onSelect: (prompt: string) => void;
}

export default function SuggestionBar({ backendUrl, onSelect }: Props) {
  const [items, setItems] = useState<Suggestion[]>(FALLBACKS);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!backendUrl) return;
    setLoading(true);
    const fetched = await getSuggestions(backendUrl);
    if (fetched.length > 0) setItems(fetched);
    setLoading(false);
  }, [backendUrl]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>📰 Ask about</Text>
        {loading && <ActivityIndicator size="small" color="#475569" style={{ marginLeft: 6 }} />}
      </View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(_, i) => String(i)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const color = CATEGORY_COLORS[item.category] ?? "#6366f1";
          return (
            <TouchableOpacity
              style={[styles.chip, { borderColor: color + "55" }]}
              activeOpacity={0.7}
              onPress={() => onSelect(item.text)}
            >
              <Text style={[styles.chipCategory, { color }]}>{item.category}</Text>
              <Text style={styles.chipText} numberOfLines={2}>{item.text}</Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { paddingTop: 8, paddingBottom: 4, borderTopWidth: 1, borderTopColor: "#1e293b" },
  labelRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, marginBottom: 6 },
  label: { fontSize: 11, color: "#475569", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  list: { paddingHorizontal: 12, gap: 8 },
  chip: {
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 200,
    minWidth: 120,
  },
  chipCategory: { fontSize: 9, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  chipText: { fontSize: 12, color: "#cbd5e1", lineHeight: 16 },
});
