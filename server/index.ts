import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { buildDiagramPromptContext } from "./diagramContext.js";
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

interface BriefRequest {
  topic: string;
  level: SessionConfig["level"];
  seedConstraints?: string[];
}

interface InterviewBrief {
  problem: string;
  context: string;
  constraints: string[];
  examples: string[];
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

function validateBriefRequest(body: unknown): BriefRequest {
  const request = body as Partial<BriefRequest>;
  if (!request.topic || !request.level) {
    throw new Error("Request must include topic and level");
  }
  return {
    topic: request.topic,
    level: request.level,
    seedConstraints: Array.isArray(request.seedConstraints)
      ? request.seedConstraints.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      : []
  };
}

function firstJsonObject(value: string) {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return undefined;
  return value.slice(start, end + 1);
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function defaultBrief(topic: string, seedConstraints: string[]): InterviewBrief {
  return {
    problem: topic,
    context: "Treat this as a production AI system with real users, cost, safety, reliability, and observability concerns.",
    constraints: seedConstraints.length ? seedConstraints.slice(0, 4) : [
      "The design should cover quality, latency, cost, safety, and monitoring.",
      "Ambiguous or high-risk outputs need a clear fallback or review path."
    ],
    examples: [
      "A normal successful request.",
      "An ambiguous or low-confidence request.",
      "A provider, retrieval, or tool failure."
    ]
  };
}

function normalizeBrief(rawText: string, topic: string, seedConstraints: string[]): InterviewBrief {
  const fallback = defaultBrief(topic, seedConstraints);
  try {
    const json = firstJsonObject(rawText);
    const parsed = json ? JSON.parse(json) as Partial<InterviewBrief> : undefined;
    if (parsed) {
      const constraints = readStringArray(parsed.constraints);
      const examples = readStringArray(parsed.examples);
      return {
        problem: typeof parsed.problem === "string" && parsed.problem.trim() ? parsed.problem.trim() : topic,
        context: typeof parsed.context === "string" && parsed.context.trim()
          ? parsed.context.trim()
          : fallback.context,
        constraints: constraints.length ? constraints : fallback.constraints,
        examples: examples.length ? examples : fallback.examples
      };
    }
  } catch {
    // Fall through to a deterministic fallback.
  }

  return fallback;
}

app.get("/api/health", (_req, res) => {
  const zaiConfigured = Boolean(process.env.ZAI_API_KEY);
  res.json({
    ok: true,
    provider: "zai",
    zaiConfigured,
    ready: zaiConfigured
  });
});

app.post("/api/interview/brief", async (req, res) => {
  try {
    if (!process.env.ZAI_API_KEY) {
      throw new Error("ZAI_API_KEY is not configured");
    }
    const request = validateBriefRequest(req.body);
    const seedText = request.seedConstraints?.length
      ? request.seedConstraints.map((constraint) => `- ${constraint}`).join("\n")
      : "- No seed constraints.";
    const rawBrief = await callZai([
      {
        role: "system",
        content: "Create compact AI system design interview briefs as structured output. Return one valid JSON object only. Do not include markdown."
      },
      {
        role: "user",
        content: `Create one varied interview brief for this topic: ${request.topic}
Candidate level: ${request.level}

Seed constraints:
${seedText}

Return exactly this JSON schema:
{
  "problem": "one sentence, specific but not solution-revealing",
  "context": "one short paragraph with product or domain detail",
  "constraints": ["2-4 concrete constraints"],
  "examples": ["2-3 representative user inputs, documents, requests, or edge cases"]
}

Keep the total under 140 words. Do not solve the architecture.`
      }
    ], { maxTokens: 380, temperature: 0.7 });

    res.json({ brief: normalizeBrief(rawBrief, request.topic, request.seedConstraints ?? []) });
  } catch (error) {
    const response = errorResponse(error, "Unknown interview brief error");
    res.status(response.status).json({ error: response.error });
  }
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
    const diagramContext = buildDiagramPromptContext(request.canvasSummary);
    const instruction = request.messages.length === 0
      ? `Start the interview with the problem statement: "${request.session.topic}".

Do not ask a broad question like "how would you design this system?"
First, invite the candidate to clarify scope and assumptions. Keep the first turn short: name the system to design, then ask what they need to clarify about users, success criteria, data, scale, latency, safety, and constraints before drawing the architecture.`
      : "Continue the interview from the transcript. Ask the next best single follow-up question only.";

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...request.messages,
      {
        role: "user",
        content: `${instruction}

Current diagram text context:
${diagramContext.textContext}

Use only the diagram text context as canvas evidence. Ask one concise question.`
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
    const diagramContext = buildDiagramPromptContext(request.canvasSummary);

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...request.messages,
      {
        role: "user",
        content: `End the interview and provide final structured feedback in markdown.

Diagram text context:
${diagramContext.textContext}

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

Base feedback only on what the candidate said or entered on the canvas. Do not invent details.`
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
