export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ZaiResponse {
  error?: { message?: string };
  message?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export async function callZai(messages: ChatMessage[]) {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    throw new Error("ZAI_API_KEY is not configured");
  }

  const baseUrl = (process.env.ZAI_BASE_URL ?? "https://api.z.ai/api/paas/v4").replace(/\/$/, "");
  const model = process.env.ZAI_MODEL ?? "glm-5.2";

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Accept-Language": "en-US,en"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.35
    })
  });

  const body = await response.json().catch(() => null) as ZaiResponse | null;

  if (!response.ok) {
    const message = body?.error?.message ?? body?.message ?? response.statusText;
    throw new Error(`Z.AI request failed: ${message}`);
  }

  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Z.AI returned an empty response");
  }

  return content.trim();
}
