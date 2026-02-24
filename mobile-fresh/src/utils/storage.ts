import AsyncStorage from "@react-native-async-storage/async-storage";
import { Message, HistoryItem, ConversationSummary } from "../types";

const CONV_INDEX_KEY = "CONV_INDEX";

interface StoredConversation {
  id: string;
  title: string;
  preview: string;
  timestamp: number;
  messageCount: number;
  messages: Message[];
  apiHistory: HistoryItem[];
}

async function getIndex(): Promise<ConversationSummary[]> {
  const raw = await AsyncStorage.getItem(CONV_INDEX_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function saveIndex(index: ConversationSummary[]): Promise<void> {
  await AsyncStorage.setItem(CONV_INDEX_KEY, JSON.stringify(index));
}

export async function saveConversation(
  title: string,
  messages: Message[],
  apiHistory: HistoryItem[]
): Promise<string> {
  const id = `CONV_${Date.now()}`;
  const userMessages = messages.filter((m) => m.role === "user");
  const preview = userMessages.length > 0 ? userMessages[0].content.slice(0, 80) : "Empty conversation";

  const stored: StoredConversation = {
    id,
    title,
    preview,
    timestamp: Date.now(),
    messageCount: messages.length,
    messages,
    apiHistory,
  };

  await AsyncStorage.setItem(id, JSON.stringify(stored));

  const index = await getIndex();
  const summary: ConversationSummary = {
    id,
    title,
    preview,
    timestamp: stored.timestamp,
    messageCount: stored.messageCount,
  };
  index.unshift(summary);
  await saveIndex(index);
  return id;
}

export async function listConversations(): Promise<ConversationSummary[]> {
  return getIndex();
}

export async function loadConversation(
  id: string
): Promise<{ messages: Message[]; apiHistory: HistoryItem[] } | null> {
  const raw = await AsyncStorage.getItem(id);
  if (!raw) return null;
  const stored: StoredConversation = JSON.parse(raw);
  return { messages: stored.messages, apiHistory: stored.apiHistory };
}

export async function deleteConversation(id: string): Promise<void> {
  await AsyncStorage.removeItem(id);
  const index = await getIndex();
  await saveIndex(index.filter((c) => c.id !== id));
}
