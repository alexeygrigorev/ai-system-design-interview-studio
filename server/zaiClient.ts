export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface AnthropicTextBlock {
  type?: string;
  text?: string;
}

interface AnthropicResponse {
  error?: { code?: string | number; type?: string; message?: string };
  message?: string;
  content?: AnthropicTextBlock[] | string;
}

const DEFAULT_BASE_URL = "https://api.z.ai/api/anthropic";
const DEFAULT_MODEL = "glm-5.2";
const ANTHROPIC_VERSION = "2023-06-01";

function buildMessagesUrl(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (normalized.endsWith("/v1/messages")) {
    return normalized;
  }
  if (normalized.endsWith("/v1")) {
    return `${normalized}/messages`;
  }
  return `${normalized}/v1/messages`;
}

function sanitizeProviderText(value: string, apiKey: string) {
  let sanitized = value.replaceAll(apiKey, "[redacted]");
  sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
  sanitized = sanitized.replace(/(x-api-key|api[-_ ]?key|authorization)(["'\s:=]+)([^"',\s}]+)/gi, "$1$2[redacted]");
  sanitized = sanitized.replace(/(request\s+headers|headers)(\s*[:=]\s*)([\s\S]+?)(?=\s+(?:request\s+body|request_body|payload)\s*[:=]|$)/gi, "$1$2[redacted]");
  sanitized = sanitized.replace(/(request\s+body|request_body|payload)(\s*[:=]\s*)([\s\S]+)/gi, "$1$2[redacted]");
  return sanitized.slice(0, 500);
}

function providerErrorMessage(body: AnthropicResponse | null, response: Response, apiKey: string) {
  const code = body?.error?.code ?? body?.error?.type;
  const codeText = code ? `, code ${sanitizeProviderText(String(code), apiKey)}` : "";
  const statusText = response.statusText ? ` ${sanitizeProviderText(response.statusText, apiKey)}` : "";
  const providerMessage = body?.error?.message?.trim();
  const messageText = providerMessage ? `: ${sanitizeProviderText(providerMessage, apiKey)}` : "";
  return `Z.AI request failed (HTTP ${response.status}${statusText}${codeText})${messageText}`;
}

function toAnthropicPayload(messages: ChatMessage[], model: string) {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n\n");

  const conversation: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const message of messages) {
    if (message.role === "system") {
      continue;
    }

    const content = message.content.trim();
    if (!content) {
      continue;
    }

    if (conversation.length === 0 && message.role === "assistant") {
      conversation.push({
        role: "user",
        content: "The transcript begins with the assistant's previous message."
      });
    }

    const previous = conversation.at(-1);
    if (previous?.role === message.role) {
      previous.content = `${previous.content}\n\n${content}`;
    } else {
      conversation.push({ role: message.role, content });
    }
  }

  if (conversation.length === 0) {
    throw new Error("Z.AI request failed: no user or assistant messages were provided");
  }

  return {
    model,
    max_tokens: 2048,
    temperature: 0.35,
    ...(system ? { system } : {}),
    messages: conversation
  };
}

function parseTextContent(body: AnthropicResponse | null) {
  const content = body?.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text?.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function callZai(messages: ChatMessage[]) {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    throw new Error("ZAI_API_KEY is not configured");
  }

  const baseUrl = process.env.ZAI_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const model = process.env.ZAI_MODEL?.trim() || DEFAULT_MODEL;
  const payload = toAnthropicPayload(messages, model);

  let response: Response;
  try {
    response = await fetch(buildMessagesUrl(baseUrl), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept-Language": "en-US,en",
        "anthropic-version": ANTHROPIC_VERSION
      },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new Error("Z.AI request failed: network error contacting provider");
  }

  const body = await response.json().catch(() => null) as AnthropicResponse | null;

  if (!response.ok) {
    throw new Error(providerErrorMessage(body, response, apiKey));
  }

  const content = parseTextContent(body);
  if (!content) {
    throw new Error("Z.AI returned an empty response");
  }

  return content;
}
