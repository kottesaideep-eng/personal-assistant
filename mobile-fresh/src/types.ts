export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  imageUri?: string;
}

export interface HistoryItem {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  preview: string;
  timestamp: number;
  messageCount: number;
}

export interface PendingReplyRecord {
  id: string;
  sender_name: string;
  sender_handle: string;
  chat_id: string;
  original_message: string;
  draft_reply: string;
  status: string;
  approved_text: string | null;
  created_at: string;
}
