import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { buildSystemPrompt, type SessionConfig } from "./promptPack.js";
import { callZai, type ChatMessage } from "./zaiClient.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const isProduction = process.env.NODE_ENV === "production";
const env = loadEnv(process.env.NODE_ENV ?? "development", projectRoot, "");

for (const [key, value] of Object.entries(env)) {
  process.env[key] ??= value;
}

const port = Number(process.env.PORT ?? 5173);

const app = express();
app.use(express.json({ limit: "4mb" }));

interface TurnRequest {
  session: SessionConfig;
  messages: ChatMessage[];
  canvasSummary?: unknown;
}

function validateTurnRequest(body: unknown): TurnRequest {
  const request = body as Partial<TurnRequest>;
  if (!request.session || !Array.isArray(request.messages)) {
    throw new Error("Request must include session and messages");
  }
  return {
    session: request.session,
    messages: request.messages,
    canvasSummary: request.canvasSummary
  };
}

app.get("/api/health", (_req, res) => {
  const zaiConfigured = Boolean(process.env.ZAI_API_KEY);
  res.json({
    ok: true,
    provider: "zai",
    model: process.env.ZAI_MODEL ?? "glm-5.2",
    zaiConfigured,
    ready: zaiConfigured
  });
});

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (message === "ZAI_API_KEY is not configured") {
    return {
      status: 503,
      error: "ZAI_API_KEY is not configured. Add it to .env and restart the dev server."
    };
  }
  if (message.startsWith("Z.AI request failed") || message === "Z.AI returned an empty response") {
    return {
      status: 502,
      error: `Z.AI provider request failed. Check ZAI_API_KEY, ZAI_MODEL, and ZAI_BASE_URL, then retry. Detail: ${message}`
    };
  }
  return { status: 500, error: message };
}

app.post("/api/interview/turn", async (req, res) => {
  try {
    if (!process.env.ZAI_API_KEY) {
      throw new Error("ZAI_API_KEY is not configured");
    }
    const request = validateTurnRequest(req.body);
    const systemPrompt = await buildSystemPrompt(projectRoot, request.session);
    const canvasSummary = JSON.stringify(request.canvasSummary ?? [], null, 2);
    const instruction = request.messages.length === 0
      ? "Start the interview. Ask the opening system design question only."
      : "Continue the interview from the transcript. Ask the next best single follow-up question only.";

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...request.messages,
      {
        role: "user",
        content: `${instruction}

Current diagram artifacts:
${canvasSummary}

Use diagram artifacts only as supporting evidence. Ask one concise question.`
      }
    ];

    const reply = await callZai(messages);
    res.json({ reply });
  } catch (error) {
    const response = errorResponse(error, "Unknown interview error");
    res.status(response.status).json({ error: response.error });
  }
});

app.post("/api/interview/assess", async (req, res) => {
  try {
    if (!process.env.ZAI_API_KEY) {
      throw new Error("ZAI_API_KEY is not configured");
    }
    const request = validateTurnRequest(req.body);
    const systemPrompt = await buildSystemPrompt(projectRoot, request.session);
    const canvasSummary = JSON.stringify(request.canvasSummary ?? [], null, 2);

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...request.messages,
      {
        role: "user",
        content: `End the interview and provide final structured feedback in markdown.

Canvas artifacts:
${canvasSummary}

Use the configured rubric. Include:
- Overall assessment.
- Scores from 1 to 5.
- Evidence from the transcript and diagram artifacts for each major score.
- Separate observations from the diagram artifacts.
- Missing AI system design considerations.
- Seniority signal.
- Pass/no-pass recommendation for the configured level.
- One concrete practice recommendation.
- One concise example improved answer.

Base feedback only on what the candidate said or drew. Do not invent details.`
      }
    ];

    const assessment = await callZai(messages);
    res.json({ assessment });
  } catch (error) {
    const response = errorResponse(error, "Unknown assessment error");
    res.status(response.status).json({ error: response.error });
  }
});

if (isProduction) {
  app.use(express.static(path.join(projectRoot, "dist")));
  app.get("*splat", (_req, res) => {
    res.sendFile(path.join(projectRoot, "dist", "index.html"));
  });
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true, host: "0.0.0.0" },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

app.listen(port, "0.0.0.0", () => {
  console.log(`AI System Design Trainer running at http://localhost:${port}`);
});
