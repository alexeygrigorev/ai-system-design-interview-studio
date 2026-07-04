import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSystemPrompt, type SessionConfig } from "./promptPack.js";
import { callZai, type ChatMessage } from "./zaiClient.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const isProduction = process.env.NODE_ENV === "production";
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
  res.json({
    ok: true,
    model: process.env.ZAI_MODEL ?? "glm-5.2",
    zaiConfigured: Boolean(process.env.ZAI_API_KEY)
  });
});

app.post("/api/interview/turn", async (req, res) => {
  try {
    const request = validateTurnRequest(req.body);
    const systemPrompt = await buildSystemPrompt(projectRoot, request.session);
    const instruction = request.messages.length === 0
      ? "Start the interview. Ask the opening system design question only."
      : "Continue the interview from the transcript. Ask the next best single follow-up question only.";

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...request.messages,
      { role: "user", content: instruction }
    ];

    const reply = await callZai(messages);
    res.json({ reply });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown interview error"
    });
  }
});

app.post("/api/interview/assess", async (req, res) => {
  try {
    const request = validateTurnRequest(req.body);
    const systemPrompt = await buildSystemPrompt(projectRoot, request.session);
    const canvasSummary = JSON.stringify(request.canvasSummary ?? {}, null, 2);

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...request.messages,
      {
        role: "user",
        content: `End the interview and provide final structured feedback in markdown.

Canvas artifacts:
${canvasSummary}

Use the configured rubric. Include scores from 1 to 5, seniority signal, pass/no-pass recommendation, one concrete practice recommendation, and one concise example improved answer.`
      }
    ];

    const assessment = await callZai(messages);
    res.json({ assessment });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown assessment error"
    });
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
