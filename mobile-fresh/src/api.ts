import { HistoryItem } from "./types";

export async function sendMessage(
  baseUrl: string,
  message: string,
  history: HistoryItem[]
): Promise<{ reply: string; history: HistoryItem[] }> {
  const url = `${baseUrl.replace(/\/$/, "")}/chat`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Server error ${response.status}: ${text}`);
  }

  return response.json();
}

export async function checkHealth(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/health`,
      { method: "GET" }
    );
    return response.ok;
  } catch {
    return false;
  }
}
