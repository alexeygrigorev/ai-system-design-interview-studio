import type { ChatMessage, DiagramShape, SessionConfig } from "./types";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error ?? `Request failed with ${response.status}`);
  }

  return data as T;
}

export function requestInterviewTurn(
  session: SessionConfig,
  messages: ChatMessage[],
  canvasSummary: DiagramShape[]
) {
  return postJson<{ reply: string }>("/api/interview/turn", {
    session,
    messages,
    canvasSummary
  });
}

export function requestAssessment(
  session: SessionConfig,
  messages: ChatMessage[],
  canvasSummary: DiagramShape[]
) {
  return postJson<{ assessment: string }>("/api/interview/assess", {
    session,
    messages,
    canvasSummary
  });
}
