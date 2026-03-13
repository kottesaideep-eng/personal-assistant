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
              style={styles.chip}
              activeOpacity={0.7}
              onPress={() => onSelect(item.text)}
            >
              <View style={[styles.dot, { backgroundColor: color }]} />
              <Text style={styles.chipText} numberOfLines={1}>{item.text}</Text>
            </TouchableOpacity>
          );
        }}
        ListHeaderComponent={
          loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#334155" />
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#0f1729",
  },
  list: {
    paddingHorizontal: 14,
    gap: 8,
    alignItems: "center",
  },
  loadingContainer: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f1729",
    borderWidth: 1,
    borderColor: "#1a2540",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 7,
    maxWidth: 220,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  chipText: {
    fontSize: 13,
    color: "#94a3b8",
    fontWeight: "500",
    flexShrink: 1,
  },
});
