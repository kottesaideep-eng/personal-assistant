import { HistoryItem, AiFeedItem, TrendingArticle } from "./types";

export async function sendMessage(
  baseUrl: string,
  message: string,
  history: HistoryItem[],
  imageBase64?: string,
  imageMimeType?: string
): Promise<{ reply: string; history: HistoryItem[] }> {
  const url = `${baseUrl.replace(/\/$/, "")}/chat`;

  const body: Record<string, unknown> = { message, history };
  if (imageBase64) {
    body.image_base64 = imageBase64;
    body.image_mime_type = imageMimeType ?? "image/jpeg";
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

export interface PlaygroundGuide {
  overview: string;
  install: string;
  quickstart: string;
  roar_integration: string;
  standalone: string;
  tips: string[];
  chat_starter: string;
}

export async function explorePlayground(
  baseUrl: string,
  item: AiFeedItem
): Promise<PlaygroundGuide | null> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/playground/explore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: item.title,
        summary: item.summary,
        category: item.category,
        url: item.url,
        why_useful: item.why_useful,
      }),
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

export interface Suggestion {
  text: string;
  category: string;
}

export async function getSuggestions(baseUrl: string): Promise<Suggestion[]> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/suggestions`);
    if (!response.ok) return [];
    return response.json();
  } catch {
    return [];
  }
}

export async function getAiFeed(baseUrl: string): Promise<AiFeedItem[]> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/ai-feed`);
    if (!response.ok) return [];
    return response.json();
  } catch {
    return [];
  }
}

export async function refreshAiFeed(baseUrl: string): Promise<number> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/ai-feed/refresh`, { method: "POST" });
    if (!response.ok) return 0;
    const data = await response.json();
    return data.count ?? 0;
  } catch {
    return 0;
  }
}

export async function getTrendingArticles(baseUrl: string): Promise<TrendingArticle[]> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/trending-articles`);
    if (!response.ok) return [];
    return response.json();
  } catch {
    return [];
  }
}

export async function refreshTrendingArticles(baseUrl: string): Promise<number> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/trending-articles/refresh`, { method: "POST" });
    if (!response.ok) return 0;
    const data = await response.json();
    return data.count ?? 0;
  } catch {
    return 0;
  }
}

export async function registerDevice(
  baseUrl: string,
  token: string,
  platform: string
): Promise<void> {
  try {
    await fetch(`${baseUrl.replace(/\/$/, "")}/register-device`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, platform }),
    });
  } catch {
    // Non-fatal: device registration failure doesn't affect chat
  }
}
