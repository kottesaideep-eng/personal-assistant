import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
} from "react-native";
import { ConversationSummary } from "../types";
import { listConversations, deleteConversation } from "../utils/storage";

interface Props {
  visible: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onLoadConversation: (id: string) => void;
}

export default function HistoryModal({ visible, onClose, onNewChat, onLoadConversation }: Props) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);

  useEffect(() => {
    if (visible) {
      listConversations().then(setConversations);
    }
  }, [visible]);

  const handleDelete = (id: string, title: string) => {
    Alert.alert("Delete conversation", `Delete "${title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteConversation(id);
          setConversations((prev) => prev.filter((c) => c.id !== id));
        },
      },
    ]);
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) +
      " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Chat History</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.newChatBtn} onPress={onNewChat}>
            <Text style={styles.newChatIcon}>✏️</Text>
            <Text style={styles.newChatText}>New Chat</Text>
          </TouchableOpacity>

          {conversations.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>💬</Text>
              <Text style={styles.emptyText}>No saved conversations yet.</Text>
              <Text style={styles.emptyHint}>Conversations are saved when you tap ✕ to clear.</Text>
            </View>
          ) : (
            <FlatList
              data={conversations}
              keyExtractor={(item) => item.id}
              style={styles.list}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => { onLoadConversation(item.id); onClose(); }}
                  onLongPress={() => handleDelete(item.id, item.title)}
                >
                  <View style={styles.rowContent}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.rowPreview} numberOfLines={2}>{item.preview}</Text>
                    <View style={styles.rowMeta}>
                      <Text style={styles.rowDate}>{formatDate(item.timestamp)}</Text>
                      <Text style={styles.rowCount}>{item.messageCount} msgs</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDelete(item.id, item.title)}
                  >
                    <Text style={styles.deleteBtnText}>🗑</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#0f172a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
    paddingBottom: 32,
    borderTopWidth: 1,
    borderColor: "#1e293b",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  title: { color: "#f1f5f9", fontSize: 17, fontWeight: "700" },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "#1e293b", alignItems: "center", justifyContent: "center",
  },
  closeBtnText: { color: "#94a3b8", fontSize: 14 },

  newChatBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: "#1e3a5f",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#2563eb",
    gap: 10,
  },
  newChatIcon: { fontSize: 18 },
  newChatText: { color: "#60a5fa", fontSize: 15, fontWeight: "600" },

  list: { paddingHorizontal: 16 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    borderRadius: 12,
    marginBottom: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#334155",
  },
  rowContent: { flex: 1 },
  rowTitle: { color: "#f1f5f9", fontSize: 14, fontWeight: "600", marginBottom: 3 },
  rowPreview: { color: "#64748b", fontSize: 13, lineHeight: 18, marginBottom: 5 },
  rowMeta: { flexDirection: "row", justifyContent: "space-between" },
  rowDate: { color: "#475569", fontSize: 12 },
  rowCount: { color: "#475569", fontSize: 12 },
  deleteBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    marginLeft: 8,
  },
  deleteBtnText: { fontSize: 16 },

  emptyState: { alignItems: "center", paddingTop: 48, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: "#94a3b8", fontSize: 16, fontWeight: "600", marginBottom: 8 },
  emptyHint: { color: "#475569", fontSize: 13, textAlign: "center" },
});
