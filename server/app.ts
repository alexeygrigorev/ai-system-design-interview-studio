import express from "express";
import path from "node:path";
import cookieSession from "cookie-session";
import { buildDiagramPromptContext } from "./diagramContext.js";
import { buildSystemPrompt, type SessionConfig } from "./promptPack.js";
import { callZai, streamZai, type ChatMessage } from "./zaiClient.js";
import { beginOidcLogin, finishOidcLogin, oidcConfigured, oidcLogoutUrl } from "./oidcAuth.js";

const isProduction = process.env.NODE_ENV === "production";

// Passphrase gate — mirrors the AISL Gym (app/web.py AuthMiddleware): a shared
// passphrase unlocks a signed session cookie. Defaults to the gym's passphrase.
const PASSPHRASE = process.env.STUDIO_PASSPHRASE ?? "aislgym";
const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-insecure-secret-change-me";
const PUBLIC_PATHS = new Set([
  "/login",
  "/auth/callback",
  "/auth/error",
  "/api/health",
  "/favicon.ico",
  "/manifest.webmanifest",
  "/sw.js",
  "/icon.svg"
]);

function isPublic(path: string) {
  return PUBLIC_PATHS.has(path) || path.startsWith("/assets/");
}

function loginPage(bad: boolean) {
  const err = bad ? '<p class="err">Wrong passphrase</p>' : "";
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Login · AI System Design Studio</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         font: 16px/1.4 system-ui, sans-serif; background:#0f1115; color:#e6e6e6; }
  .card { width: min(360px, 90vw); }
  h1 { font-size: 1.15rem; margin: 0 0 .25rem; }
  .sub { color:#9aa0a8; margin: 0 0 1.25rem; font-size: .9rem; }
  input { width:100%; box-sizing:border-box; padding:.7rem .8rem; border-radius:8px;
          border:1px solid #2a2f37; background:#171a20; color:#e6e6e6; font-size:1rem; }
  button { width:100%; margin-top:.6rem; padding:.7rem; border:0; border-radius:8px;
           background:#4f7cff; color:#fff; font-size:1rem; cursor:pointer; }
  .err { color:#ff6b6b; margin:.7rem 0 0; font-size:.85rem; }
</style></head>
<body><form method="post" action="/login" class="card">
  <h1>AI System Design Studio</h1>
  <p class="sub">Practice system-design interviews with an AI interviewer.</p>
  <input type="password" name="passphrase" placeholder="Passphrase" autofocus>
  <button>Enter</button>${err}
</form></body></html>`;
}

const authGate: express.RequestHandler = (req, res, next) => {
  if (isPublic(req.path)) return next();
  if (req.session?.auth) return next();
  if (req.method === "GET" || req.method === "HEAD") {
    return res.redirect(303, "/login");
  }
  return res.status(401).send("unauthorized");
};

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

function formatList(items: string[], fallback: string) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : `- ${fallback}`;
}

function buildProblemPrompt(session: SessionConfig) {
  const brief = session.brief ?? {
    problem: session.topic,
    context: "Treat this as a production AI system design interview.",
    constraints: session.constraints,
    examples: []
  };

  return `Detailed interview problem prompt:

Problem:
${brief.problem}

Context:
${brief.context}

Constraints:
${formatList(brief.constraints, "No generated constraints.")}

Examples:
${formatList(brief.examples, "No generated examples.")}

Opening interviewer question shown to the candidate:
Before drawing the architecture, what would you clarify about users, success criteria, data sources, scale, latency, safety, and constraints?

Use this problem prompt as the source of truth for the interview scenario. Do not ask the candidate to design the whole system before they have had a chance to clarify scope and assumptions.`;
}

function isGeneratedOpeningMessage(message: ChatMessage) {
  return message.role === "assistant"
    && message.content.trim().startsWith("Problem:")
    && (
      message.content.includes("Before drawing the architecture")
      || message.content.includes("Generating scenario details")
    );
}

function transcriptMessages(messages: ChatMessage[]) {
  if (messages[0] && isGeneratedOpeningMessage(messages[0])) {
    return messages.slice(1);
  }
  return messages;
}

async function buildTurnMessages(projectRoot: string, request: TurnRequest) {
  const systemPrompt = await buildSystemPrompt(projectRoot, request.session);
  const problemPrompt = buildProblemPrompt(request.session);
  const diagramContext = buildDiagramPromptContext(request.canvasSummary);
  const transcript = transcriptMessages(request.messages);
  const instruction = transcript.length === 0
    ? "Start the interview by asking only the opening clarification question from the problem prompt."
    : "Continue the interview from the transcript. Ask the next best single follow-up question only.";

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: problemPrompt },
    ...transcript,
    {
      role: "user",
      content: `Current interviewer task:
${instruction}

Current diagram text context:
${diagramContext.textContext}

Use only the diagram text context as canvas evidence. Ask one concise question that responds to the candidate's latest answer and the current diagram.`
    }
  ] satisfies ChatMessage[];
}

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

/** Build the Express app. Imported by the dev server (server/index.ts) and the
 *  Lambda HTTP server (lambda/server.ts), run behind the Lambda Web Adapter.
 *  `projectRoot` is where the `dist/` frontend and `ai_engineering_interviewer_prompts/`
 *  live — the repo root in dev, /var/task (LAMBDA_TASK_ROOT) on Lambda. */
export function createApp(projectRoot: string) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json({ limit: "4mb" }));
  app.use(
    cookieSession({
      name: "studio_session",
      keys: [SESSION_SECRET],
      sameSite: "lax",
      secure: isProduction,
      httpOnly: true,
      maxAge: 365 * 24 * 60 * 60 * 1000
    })
  );

  app.get("/login", (req, res) => {
    if (req.session?.auth) return res.redirect(303, "/");
    if (oidcConfigured()) return beginOidcLogin(req, res);
    res.type("html").send(loginPage(String(req.query.bad ?? "") === "1"));
  });
  app.post("/login", (req, res) => {
    const passphrase = String(req.body?.passphrase ?? "").trim();
    if (passphrase && passphrase === PASSPHRASE) {
      req.session!.auth = true;
      return res.redirect(303, "/");
    }
    res.redirect(303, "/login?bad=1");
  });
  app.get("/auth/callback", finishOidcLogin);
  app.get("/auth/error", (_req, res) => {
    res.status(403)
      .set({
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
      })
      .type("html")
      .send("<!doctype html><html><head><meta charset=utf-8><title>Sign-in error · Studio</title><style>body{font:16px system-ui;max-width:32rem;margin:10vh auto;padding:2rem}</style></head><body><h1>Sign-in error</h1><p>Authentication could not be completed.</p><a href=/login>Try again</a></body></html>");
  });
  app.get("/logout", (req, res) => {
    req.session = null;
    res.redirect(303, oidcLogoutUrl());
  });

  // Everything below requires the session cookie.
  app.use(authGate);

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
  "constraints": ["2-4 candidate-visible business, domain, safety, compliance, or user-facing requirements"],
  "examples": ["2-3 representative user inputs, documents, requests, or edge cases"]
}

Constraints must not reveal implementation tactics, evaluation design, chunking strategy, retrieval strategy, observability, metrics, or architecture hints unless the topic itself makes them a business requirement.
Use seed constraints only when they are candidate-visible product/domain requirements; do not simply copy technical seed constraints.
Keep the total under 140 words. Do not solve the architecture.`
        }
      ], { maxTokens: 380, temperature: 0.7 });

      res.json({ brief: normalizeBrief(rawBrief, request.topic, request.seedConstraints ?? []) });
    } catch (error) {
      const response = errorResponse(error, "Unknown interview brief error");
      res.status(response.status).json({ error: response.error });
    }
  });

  app.post("/api/interview/turn", async (req, res) => {
    try {
      if (!process.env.ZAI_API_KEY) {
        throw new Error("ZAI_API_KEY is not configured");
      }
      const request = validateTurnRequest(req.body);
      const messages = await buildTurnMessages(projectRoot, request);
      const reply = await callZai(messages);
      res.json({ reply });
    } catch (error) {
      const response = errorResponse(error, "Unknown interview error");
      res.status(response.status).json({ error: response.error });
    }
  });

  app.post("/api/interview/turn/stream", async (req, res) => {
    try {
      if (!process.env.ZAI_API_KEY) {
        throw new Error("ZAI_API_KEY is not configured");
      }
      const request = validateTurnRequest(req.body);
      const messages = await buildTurnMessages(projectRoot, request);

      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff"
      });

      for await (const token of streamZai(messages)) {
        res.write(token);
      }
      res.end();
    } catch (error) {
      const response = errorResponse(error, "Unknown streaming interview error");
      if (!res.headersSent) {
        res.status(response.status).json({ error: response.error });
        return;
      }
      res.write(`\n\n[stream error: ${response.error}]`);
      res.end();
    }
  });

  app.post("/api/interview/assess", async (req, res) => {
    try {
      if (!process.env.ZAI_API_KEY) {
        throw new Error("ZAI_API_KEY is not configured");
      }
      const request = validateTurnRequest(req.body);
      const systemPrompt = await buildSystemPrompt(projectRoot, request.session);
      const problemPrompt = buildProblemPrompt(request.session);
      const diagramContext = buildDiagramPromptContext(request.canvasSummary);
      const transcript = transcriptMessages(request.messages);

      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: problemPrompt },
        ...transcript,
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
  }

  return app;
}
