import type { CandidateLevel, ChatMessage, DiagramShape, InterviewBrief, SessionConfig } from "./types";

export interface HealthStatus {
  ok: boolean;
  provider: string;
  zaiConfigured: boolean;
  ready: boolean;
}

export async function getHealth() {
  const response = await fetch("/api/health");
  if (!response.ok) {
    throw new Error(`Health check failed with ${response.status}`);
  }
  return response.json() as Promise<HealthStatus>;
}

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

export async function requestInterviewTurnStream(
  session: SessionConfig,
  messages: ChatMessage[],
  canvasSummary: DiagramShape[],
  onToken: (token: string) => void
) {
  const response = await fetch("/api/interview/turn/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session,
      messages,
      canvasSummary
    })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? `Request failed with ${response.status}`);
  }

  if (!response.body) {
    throw new Error("Streaming response was empty");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const token = decoder.decode(value, { stream: true });
    if (token) onToken(token);
  }

  const tail = decoder.decode();
  if (tail) onToken(tail);
}

export function requestInterviewBrief(
  topic: string,
  level: CandidateLevel,
  seedConstraints: string[]
) {
  return postJson<{ brief: InterviewBrief }>("/api/interview/brief", {
    topic,
    level,
    seedConstraints
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
