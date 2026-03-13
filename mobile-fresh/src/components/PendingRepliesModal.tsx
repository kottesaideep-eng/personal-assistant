import React, { useEffect, useState, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { PendingReplyRecord } from "../types";

interface Props {
  visible: boolean;
  backendUrl: string;
  onClose: () => void;
  onCountChange: (count: number) => void;
}

export default function PendingRepliesModal({ visible, backendUrl, onClose, onCountChange }: Props) {
  const [records, setRecords] = useState<PendingReplyRecord[]>([]);
  const [draftTexts, setDraftTexts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRecords = async () => {
    if (!backendUrl) return;
    try {
      const resp = await fetch(`${backendUrl}/pending-replies`);
      if (!resp.ok) return;
      const data: PendingReplyRecord[] = await resp.json();
      const pending = data.filter((r) => r.status === "pending");
      setRecords(pending);
      onCountChange(pending.length);
      // Seed draft texts for new records
      setDraftTexts((prev) => {
        const next = { ...prev };
        for (const r of pending) {
          if (next[r.id] === undefined) {
            next[r.id] = r.draft_reply;
          }
        }
        return next;
      });
    } catch (_) {
      // network error — silently ignore
    }
  };

  useEffect(() => {
    if (visible) {
      setLoading(true);
      fetchRecords().finally(() => setLoading(false));
      intervalRef.current = setInterval(fetchRecords, 5000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [visible, backendUrl]);

  const handleSend = async (record: PendingReplyRecord) => {
    const text = draftTexts[record.id] ?? record.draft_reply;
    setSending((prev) => ({ ...prev, [record.id]: true }));
    try {
      const resp = await fetch(`${backendUrl}/pending-reply/${record.id}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved_text: text }),
      });
      if (resp.ok) {
        setRecords((prev) => prev.filter((r) => r.id !== record.id));
        onCountChange(records.length - 1);
      }
    } catch (e) {
      Alert.alert("Error", "Failed to send reply. Please try again.");
    } finally {
      setSending((prev) => ({ ...prev, [record.id]: false }));
    }
  };

  const handleDismiss = (record: PendingReplyRecord) => {
    Alert.alert("Dismiss Reply", `Dismiss draft reply to ${record.sender_name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Dismiss",
        style: "destructive",
        onPress: async () => {
          try {
            await fetch(`${backendUrl}/pending-reply/${record.id}/dismiss`, {
              method: "PATCH",
            });
            setRecords((prev) => prev.filter((r) => r.id !== record.id));
            onCountChange(records.length - 1);
          } catch (_) {
            Alert.alert("Error", "Failed to dismiss. Please try again.");
          }
        },
      },
    ]);
  };

  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>📥 Inbox</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color="#60a5fa" size="large" />
            </View>
          ) : records.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>✉️</Text>
              <Text style={styles.emptyText}>No pending replies</Text>
              <Text style={styles.emptyHint}>New iMessages will appear here for review.</Text>
            </View>
          ) : (
            <FlatList
              data={records}
              keyExtractor={(item) => item.id}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  {/* Card header */}
                  <View style={styles.cardHeader}>
                    <View style={styles.senderRow}>
                      <View style={styles.senderTopRow}>
                        <View style={[
                          styles.sourceBadge,
                          item.source === "email" ? styles.sourceBadgeEmail : styles.sourceBadgeIMessage,
                        ]}>
                          <Text style={styles.sourceBadgeText}>
                            {item.source === "email" ? "✉️ Email" : "💬 iMessage"}
                          </Text>
                        </View>
                        <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>
                      </View>
                      <Text style={styles.senderName}>{item.sender_name}</Text>
                      <Text style={styles.senderHandle}>
                        {item.source === "email" ? item.sender_email ?? item.sender_handle : item.sender_handle}
                      </Text>
                      {item.subject ? (
                        <Text style={styles.subjectLine} numberOfLines={1}>📌 {item.subject}</Text>
                      ) : null}
                    </View>
                  </View>

                  {/* Their message */}
                  <View style={styles.incomingBubble}>
                    <Text style={styles.incomingLabel}>
                      {item.source === "email" ? "Email content" : "Their message"}
                    </Text>
                    <Text style={styles.incomingText}>{item.original_message}</Text>
                  </View>

                  {/* Roar's draft — editable */}
                  <View style={styles.draftContainer}>
                    <Text style={styles.draftLabel}>Roar's draft</Text>
                    <TextInput
                      style={styles.draftInput}
                      value={draftTexts[item.id] ?? item.draft_reply}
                      onChangeText={(t) =>
                        setDraftTexts((prev) => ({ ...prev, [item.id]: t }))
                      }
                      multiline
                      placeholder="Edit reply..."
                      placeholderTextColor="#475569"
                    />
                  </View>

                  {/* Actions */}
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.dismissBtn}
                      onPress={() => handleDismiss(item)}
                    >
                      <Text style={styles.dismissBtnText}>Dismiss</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.sendBtn, sending[item.id] && styles.sendBtnDisabled]}
                      onPress={() => handleSend(item)}
                      disabled={!!sending[item.id]}
                    >
                      {sending[item.id] ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.sendBtnText}>Send ↗</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
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
    maxHeight: "90%",
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

  centered: { paddingVertical: 40, alignItems: "center" },

  list: { paddingHorizontal: 16 },
  listContent: { paddingTop: 12, paddingBottom: 8 },

  card: {
    backgroundColor: "#1e293b",
    borderRadius: 14,
    marginBottom: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#334155",
  },
  cardHeader: {
    marginBottom: 10,
  },
  senderRow: { flex: 1 },
  senderName: { color: "#f1f5f9", fontSize: 14, fontWeight: "700" },
  senderHandle: { color: "#64748b", fontSize: 12, marginTop: 1 },
  timestamp: { color: "#475569", fontSize: 12 },

  incomingBubble: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#334155",
  },
  incomingLabel: { color: "#475569", fontSize: 11, marginBottom: 4 },
  incomingText: { color: "#94a3b8", fontSize: 14, lineHeight: 20 },

  draftContainer: {
    backgroundColor: "#172033",
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#2563eb",
  },
  draftLabel: { color: "#60a5fa", fontSize: 11, marginBottom: 4 },
  draftInput: {
    color: "#f1f5f9",
    fontSize: 14,
    lineHeight: 20,
    minHeight: 60,
    textAlignVertical: "top",
  },

  cardActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  dismissBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#475569",
  },
  dismissBtnText: { color: "#94a3b8", fontSize: 14, fontWeight: "600" },
  sendBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#2563eb",
    minWidth: 80,
    alignItems: "center",
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  emptyState: { alignItems: "center", paddingTop: 48, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: "#94a3b8", fontSize: 16, fontWeight: "600", marginBottom: 8 },
  emptyHint: { color: "#475569", fontSize: 13, textAlign: "center" },

  senderTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  sourceBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  sourceBadgeIMessage: { backgroundColor: "#1e3a5f" },
  sourceBadgeEmail: { backgroundColor: "#1a3320" },
  sourceBadgeText: { fontSize: 11, fontWeight: "700", color: "#94a3b8" },
  subjectLine: { color: "#60a5fa", fontSize: 12, marginTop: 4, fontStyle: "italic" },
});
