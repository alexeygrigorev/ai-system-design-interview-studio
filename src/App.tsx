import { Download, FileText, Lightbulb, ListRestart, Loader2, MessagesSquare, Moon, MoreVertical, Play, Redo2, RotateCcw, Send, Sun, Trash2, Undo2, User } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getHealth, requestInterviewBrief, requestInterviewTurnStream, type HealthStatus } from "./api";
import { DiagramBoard } from "./DiagramBoard";
import { interviewProblems } from "./questionBank";
import type { CandidateLevel, ChatMessage, DiagramShape, InterviewBrief, Persona, SessionConfig } from "./types";

const SESSION_STORAGE_KEY = "ai-system-design-trainer.session.v1";
const THEME_STORAGE_KEY = "ai-system-design-trainer.theme.v1";
const SVG_THEME_VARIABLES = [
  "--canvas-bg",
  "--diagram-component",
  "--diagram-component-strong",
  "--diagram-grid",
  "--diagram-handle",
  "--diagram-node-accent",
  "--diagram-node-bg",
  "--diagram-note",
  "--note-bg",
  "--text-strong"
];

interface PersistedState {
  level: CandidateLevel;
  duration: number;
  persona: Persona | "random";
  topic: string;
  customTopic: string;
  messages: ChatMessage[];
  answer: string;
  shapes: DiagramShape[];
  screen: "setup" | "interview";
  activePersona: Persona;
  activeTopic: string;
  activeConstraints: string[];
  activeBrief?: InterviewBrief;
  remainingSeconds: number;
}

const hiddenTechnicalRequirementPhrases = [
  "automated evaluation",
  "chunking",
  "document-wide context",
  "faithfulness",
  "launch-blocking metrics",
  "monitoring",
  "retrieval recall",
  "unanswerable"
];

const interviewHints = [
  {
    id: "users",
    label: "Users and roles",
    explanation: "Who uses the system, who is affected, and who approves or audits outputs?"
  },
  {
    id: "success",
    label: "Success criteria",
    explanation: "What outcomes define a good answer, workflow, or launch?"
  },
  {
    id: "data",
    label: "Data sources",
    explanation: "Which documents, events, databases, or third-party systems are involved?"
  },
  {
    id: "scale",
    label: "Scale and usage",
    explanation: "How many users, requests, documents, tenants, or peak events should it handle?"
  },
  {
    id: "latency",
    label: "Latency expectations",
    explanation: "Which paths are interactive, batch, async, or allowed to be slow?"
  },
  {
    id: "safety",
    label: "Safety and privacy",
    explanation: "What private data, risky actions, abuse cases, or compliance duties matter?"
  },
  {
    id: "access",
    label: "Access control",
    explanation: "Which permissions, groups, tenants, or source-system rules must be enforced?"
  },
  {
    id: "requirements",
    label: "System requirements",
    explanation: "Which constraints are product-facing requirements versus implementation choices?"
  }
];

function candidateVisibleRequirements(constraints: string[]) {
  return constraints.filter((constraint) => {
    const normalized = constraint.toLowerCase();
    return !hiddenTechnicalRequirementPhrases.some((phrase) => normalized.includes(phrase));
  });
}

function openingTurn(brief: InterviewBrief) {
  const requirements = candidateVisibleRequirements(brief.constraints);
  const requirementBlock = requirements.length
    ? `\nKnown requirements:\n${requirements.map((constraint) => `- ${constraint}`).join("\n")}\n`
    : "";
  const examples = brief.examples.map((example) => `- ${example}`).join("\n");
  return `Problem: ${brief.problem}

${brief.context}
${requirementBlock}

Examples:
${examples}

Let's begin. What would you ask or establish first?`;
}

function openingPlaceholder(topic: string) {
  return `Problem: ${topic}`;
}

function replaceLastAssistantMessage(messages: ChatMessage[], content: string): ChatMessage[] {
  const nextMessages: ChatMessage[] = [...messages];
  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    if (nextMessages[index].role === "assistant") {
      nextMessages[index] = { role: "assistant", content };
      return nextMessages;
    }
  }
  return [...messages, { role: "assistant", content }];
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatTimer(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function shapeName(shape: DiagramShape) {
  return shape.label?.trim() || shape.primitive?.replace("-", " ") || shape.type;
}

function shapeKind(shape: DiagramShape) {
  if (shape.primitive === "vector-index" && shape.indexKind) return `${shape.indexKind} index`;
  return shape.primitive?.replace("-", " ") ?? shape.type;
}

function diagramTextSummary(shapes: DiagramShape[]) {
  if (!shapes.length) return "No diagram components provided.";

  const components = shapes.filter((shape) => shape.type === "rect" || shape.type === "ellipse");
  const notes = shapes.filter((shape) => shape.type === "note");
  const arrows = shapes.filter((shape) => shape.type === "arrow");
  const byId = new Map(shapes.map((shape) => [shape.id, shape]));
  const connectedIds = new Set<string>();

  const componentLines = components.length
    ? components.map((shape) => `- ${shapeName(shape)} (${shapeKind(shape)})`)
    : ["- None detected."];
  const noteLines = notes.length
    ? notes.map((shape) => `- ${shapeName(shape)}`)
    : ["- None detected."];
  const relationshipLines = arrows.length
    ? arrows.map((arrow) => {
      const source = arrow.sourceId ? byId.get(arrow.sourceId) : undefined;
      const target = arrow.targetId ? byId.get(arrow.targetId) : undefined;
      if (!source || !target) return "- Unconnected connector";
      connectedIds.add(source.id);
      connectedIds.add(target.id);
      const label = arrow.label ? ` (${arrow.label})` : "";
      return `- ${shapeName(source)} -> ${shapeName(target)}${label}`;
    })
    : ["- None detected."];
  const unconnected = [...components, ...notes].filter((shape) => !connectedIds.has(shape.id));
  const unconnectedLines = unconnected.length
    ? unconnected.map((shape) => `- ${shapeName(shape)} (${shapeKind(shape)})`)
    : ["- None detected."];

  return [
    "Components:",
    ...componentLines,
    "",
    "Notes:",
    ...noteLines,
    "",
    "Relationships inferred from arrows:",
    ...relationshipLines,
    "",
    "Unconnected or non-relationship artifacts:",
    ...unconnectedLines
  ].join("\n");
}

function filenamePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "interview";
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function isSessionSnapshot(value: unknown): value is {
  answer?: unknown;
  messages?: unknown;
  remainingSeconds?: unknown;
  session?: Partial<SessionConfig>;
  shapes?: unknown;
} {
  return typeof value === "object" && value !== null && "session" in value;
}

function loadPersistedState(): Partial<PersistedState> {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (!parsed || typeof parsed !== "object" || parsed.screen !== "interview" || !parsed.activeBrief) return {};
    return parsed;
  } catch {
    return {};
  }
}

function loadPersistedTheme() {
  return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark";
}

function exportedSvgThemeCss() {
  const styles = window.getComputedStyle(document.documentElement);
  const declarations = SVG_THEME_VARIABLES
    .map((name) => `${name}: ${styles.getPropertyValue(name).trim()};`)
    .join(" ");
  return `svg { ${declarations} background: ${styles.getPropertyValue("--canvas-bg").trim()}; }`;
}

function App() {
  const [persistedState] = useState(loadPersistedState);
  const [darkMode, setDarkMode] = useState(loadPersistedTheme);
  const [level, setLevel] = useState<CandidateLevel>(persistedState.level ?? "senior");
  const [duration, setDuration] = useState(persistedState.duration ?? 45);
  const [persona, setPersona] = useState<Persona | "random">(persistedState.persona ?? "random");
  const [topic, setTopic] = useState(persistedState.topic ?? "__random__");
  const [customTopic, setCustomTopic] = useState(persistedState.customTopic ?? "");
  const [activeConstraints, setActiveConstraints] = useState<string[]>(persistedState.activeConstraints ?? []);
  const [activeBrief, setActiveBrief] = useState<InterviewBrief | undefined>(persistedState.activeBrief);
  const [messages, setMessages] = useState<ChatMessage[]>(persistedState.messages ?? []);
  const [answer, setAnswer] = useState(persistedState.answer ?? "");
  const [shapes, setShapes] = useState<DiagramShape[]>(persistedState.shapes ?? []);
  const [busy, setBusy] = useState(false);
  const [preparingOpening, setPreparingOpening] = useState(false);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [screen, setScreen] = useState<"setup" | "interview">(persistedState.screen ?? "setup");
  const [activePersona, setActivePersona] = useState<Persona>(persistedState.activePersona ?? "neutral");
  const [activeTopic, setActiveTopic] = useState(persistedState.activeTopic ?? interviewProblems[0].title);
  const [remainingSeconds, setRemainingSeconds] = useState(persistedState.remainingSeconds ?? duration * 60);
  const [cornerPanel, setCornerPanel] = useState<"hints" | "diagram" | null>(null);
  const [checkedHints, setCheckedHints] = useState<string[]>([]);
  const sessionMenuRef = useRef<HTMLDetailsElement | null>(null);
  const customProblemRef = useRef<HTMLTextAreaElement | null>(null);
  const loadSessionInputRef = useRef<HTMLInputElement | null>(null);

  const session = useMemo<SessionConfig>(() => ({
    level,
    duration,
    persona: activePersona,
    feedbackMode: "end_only",
    topic: activeTopic,
    constraints: activeConstraints,
    brief: activeBrief
  }), [activeBrief, activeConstraints, activePersona, activeTopic, duration, level]);
  const diagramSummary = useMemo(() => diagramTextSummary(shapes), [shapes]);

  const providerReady = Boolean(health?.ok && health.ready);
  function missingProviderMessage() {
    if (!health) return "Still checking AI interviewer provider status. Try again in a moment.";
    if (!health.ok) return "The app health endpoint is unavailable. Check the dev server and reload the page.";
    if (!health.zaiConfigured) {
      return "ZAI_API_KEY is not configured. Add it to .env and restart the dev server to use the AI interviewer.";
    }
    return "";
  }

  function refreshHealth(active: () => boolean) {
    getHealth()
      .then((status) => {
        if (active()) setHealth(status);
      })
      .catch(() => {
        if (active()) {
          setHealth({
            ok: false,
            provider: "zai",
            zaiConfigured: false,
            ready: false
          });
        }
      });
  }

  useEffect(() => {
    let active = true;
    refreshHealth(() => active);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    document.documentElement.style.colorScheme = darkMode ? "dark" : "light";
    window.localStorage.setItem(THEME_STORAGE_KEY, darkMode ? "dark" : "light");
  }, [darkMode]);

  function toggleTheme() {
    setDarkMode((current) => !current);
  }

  useEffect(() => {
    const nextState: PersistedState = {
      level,
      duration,
      persona,
      topic,
      customTopic,
      messages,
      answer,
      shapes,
      screen,
      activePersona,
      activeTopic,
      activeConstraints,
      activeBrief,
      remainingSeconds
    };
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextState));
  }, [
    activeConstraints,
    activeBrief,
    activePersona,
    activeTopic,
    answer,
    customTopic,
    duration,
    level,
    messages,
    persona,
    remainingSeconds,
    screen,
    shapes,
    topic
  ]);

  useEffect(() => {
    if (screen !== "interview") return undefined;
    const timer = window.setInterval(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [screen]);

  useEffect(() => {
    if (screen === "setup" && topic === "__custom__") {
      customProblemRef.current?.focus();
    }
  }, [screen, topic]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const menu = sessionMenuRef.current;
      const target = event.target;
      if (!menu?.open || !(target instanceof Node) || menu.contains(target)) return;
      closeSessionMenu();
    }

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function updateTopic(nextTopic: string) {
    setTopic(nextTopic);
  }

  function closeSessionMenu() {
    sessionMenuRef.current?.removeAttribute("open");
  }

  async function startInterview() {
    const randomProblem = interviewProblems[Math.floor(Math.random() * interviewProblems.length)];
    const selectedProblem = interviewProblems.find((problem) => problem.title === topic);
    const resolvedProblem = topic === "__random__" ? randomProblem : selectedProblem;
    const resolvedTopic = topic === "__custom__" ? customTopic.trim() : resolvedProblem?.title ?? topic;
    const seedConstraints = resolvedProblem?.constraints ?? [];
    const personas: Persona[] = ["supportive", "neutral", "adversarial"];
    const resolvedPersona = persona === "random"
      ? personas[Math.floor(Math.random() * personas.length)]
      : persona;

    if (!resolvedTopic) {
      setError("Enter a custom problem or choose one from the list.");
      return;
    }
    const providerError = missingProviderMessage();
    if (providerError) {
      setError(providerError);
      return;
    }

    setActiveTopic(resolvedTopic);
    setActivePersona(resolvedPersona);
    setActiveBrief(undefined);
    setActiveConstraints([]);
    setBusy(true);
    setPreparingOpening(true);
    setError("");
    setMessages([{ role: "assistant", content: openingPlaceholder(resolvedTopic) }]);
    setShapes([]);
    setCornerPanel(null);
    setCheckedHints([]);
    setRemainingSeconds(duration * 60);
    setScreen("interview");

    try {
      const { brief } = await requestInterviewBrief(resolvedTopic, level, seedConstraints);
      const opening = openingTurn(brief);
      setActiveTopic(brief.problem);
      setActiveBrief(brief);
      setActiveConstraints(brief.constraints);
      const chunkSize = Math.max(18, Math.ceil(opening.length / 32));
      for (let length = chunkSize; length < opening.length; length += chunkSize) {
        setMessages((currentMessages) => replaceLastAssistantMessage(currentMessages, opening.slice(0, length)));
        await wait(18);
      }
      setMessages((currentMessages) => replaceLastAssistantMessage(currentMessages, opening));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare interview brief");
    } finally {
      setPreparingOpening(false);
      setBusy(false);
    }
  }

  async function sendAnswer() {
    const trimmed = answer.trim();
    if (!trimmed || busy || messages.length === 0 || !activeBrief) return;
    const providerError = missingProviderMessage();
    if (providerError) {
      setError(providerError);
      return;
    }
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setAnswer("");
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setBusy(true);
    setError("");
    try {
      let reply = "";
      await requestInterviewTurnStream(session, nextMessages, shapes, (token) => {
        reply += token;
        setMessages([...nextMessages, { role: "assistant", content: reply }]);
      });
      if (!reply.trim()) {
        throw new Error("Interviewer returned an empty response");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not continue interview");
      setMessages(nextMessages);
    } finally {
      setBusy(false);
    }
  }

  function resetSession() {
    closeSessionMenu();
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setMessages([]);
    setAnswer("");
    setError("");
    setShapes([]);
    setCornerPanel(null);
    setCheckedHints([]);
    setActiveConstraints([]);
    setActiveBrief(undefined);
    setTopic("__random__");
    setCustomTopic("");
    setRemainingSeconds(duration * 60);
    setScreen("setup");
  }

  function restartCurrentProblem() {
    if (!activeBrief) return;
    closeSessionMenu();
    setMessages([{ role: "assistant", content: openingTurn(activeBrief) }]);
    setAnswer("");
    setError("");
    setShapes([]);
    setCornerPanel(null);
    setCheckedHints([]);
    setRemainingSeconds(duration * 60);
    setScreen("interview");
  }

  function saveSessionSnapshot() {
    closeSessionMenu();
    const snapshot = {
      savedAt: new Date().toISOString(),
      session,
      messages,
      shapes,
      remainingSeconds,
      answer
    };
    downloadTextFile(
      `${filenamePart(activeTopic)}-session.json`,
      `${JSON.stringify(snapshot, null, 2)}\n`,
      "application/json"
    );
  }

  function saveDiagramSvg() {
    closeSessionMenu();
    const svg = document.querySelector<SVGSVGElement>("svg.drawing-surface");
    if (!svg) {
      setError("Could not find the diagram SVG to save.");
      return;
    }
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("font-family", "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif");
    const rect = svg.getBoundingClientRect();
    clone.setAttribute("width", String(Math.round(rect.width)));
    clone.setAttribute("height", String(Math.round(rect.height)));
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = `${exportedSvgThemeCss()} text { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }`;
    clone.prepend(style);
    downloadTextFile(
      `${filenamePart(activeTopic)}-diagram.svg`,
      `${new XMLSerializer().serializeToString(clone)}\n`,
      "image/svg+xml"
    );
  }

  async function loadSessionSnapshot(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!isSessionSnapshot(parsed) || !parsed.session) {
        throw new Error("This file is not a saved interview session.");
      }
      const loadedSession = parsed.session;
      if (!loadedSession.brief || !loadedSession.topic || !loadedSession.persona || !loadedSession.level || !loadedSession.duration) {
        throw new Error("The saved session is missing interview details.");
      }
      const loadedMessages = Array.isArray(parsed.messages) ? parsed.messages as ChatMessage[] : [];
      const loadedShapes = Array.isArray(parsed.shapes) ? parsed.shapes as DiagramShape[] : [];
      const loadedAnswer = typeof parsed.answer === "string" ? parsed.answer : "";
      const loadedRemainingSeconds = typeof parsed.remainingSeconds === "number"
        ? parsed.remainingSeconds
        : loadedSession.duration * 60;

      setLevel(loadedSession.level);
      setDuration(loadedSession.duration);
      setPersona(loadedSession.persona);
      setTopic("__custom__");
      setCustomTopic(loadedSession.topic);
      setActivePersona(loadedSession.persona);
      setActiveTopic(loadedSession.topic);
      setActiveConstraints(loadedSession.constraints ?? []);
      setActiveBrief(loadedSession.brief);
      setMessages(loadedMessages);
      setShapes(loadedShapes);
      setAnswer(loadedAnswer);
      setRemainingSeconds(loadedRemainingSeconds);
      setCornerPanel(null);
      setCheckedHints([]);
      setError("");
      setScreen("interview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load saved session.");
    }
  }

  if (screen === "setup") {
    return (
      <main className="setup-screen">
        <section className="setup-workspace">
          {error && <div className="error-box">{error}</div>}

          <div className="setup-header">
            <h1>Interview setup</h1>
            <button className="icon-button theme-toggle" onClick={toggleTheme} title={darkMode ? "Use light mode" : "Use dark mode"} type="button">
              {darkMode ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>

          <div className="field-grid">
            <label>
              Level
              <select value={level} onChange={(event) => setLevel(event.target.value as CandidateLevel)}>
                <option value="junior">Junior</option>
                <option value="mid-level">Mid-level</option>
                <option value="senior">Senior</option>
                <option value="staff">Staff</option>
              </select>
            </label>
            <label>
              Minutes
              <select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
                <option value={30}>30</option>
                <option value={45}>45</option>
                <option value={60}>60</option>
              </select>
            </label>
          </div>

          <label>
            Interviewer
            <select value={persona} onChange={(event) => setPersona(event.target.value as Persona | "random")}>
              <option value="random">Random interviewer</option>
              <option value="supportive">Supportive coach</option>
              <option value="neutral">Neutral evaluator</option>
              <option value="adversarial">Adversarial challenger</option>
            </select>
          </label>

          <label>
            Question
            <select value={topic} onChange={(event) => updateTopic(event.target.value)}>
              <option value="__random__">Random question</option>
              <option value="__custom__">Custom problem</option>
              {interviewProblems.map((item) => <option key={item.id} value={item.title}>{item.title}</option>)}
            </select>
          </label>

          {topic === "__custom__" && (
            <label className="custom-problem-field">
              Problem statement
              <textarea
                ref={customProblemRef}
                value={customTopic}
                onChange={(event) => setCustomTopic(event.target.value)}
                placeholder="Example: Internal support assistant that answers questions from private runbooks and escalates risky actions."
                rows={4}
              />
            </label>
          )}

          <button className="primary-button setup-start" onClick={startInterview} disabled={busy || !providerReady} type="button">
            {busy ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
            Start interview
          </button>
          <input
            ref={loadSessionInputRef}
            accept="application/json,.json"
            className="visually-hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadSessionSnapshot(file);
              event.target.value = "";
            }}
            type="file"
          />
          <button className="setup-load" onClick={() => loadSessionInputRef.current?.click()} type="button">
            Load saved session
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="interview-shell">
      <section className="workspace">
        <DiagramBoard
          shapes={shapes}
          setShapes={setShapes}
          sessionControls={({ canRedo, canUndo, clearCanvas, redo, undo }) => (
            <>
              <button className="icon-button" onClick={undo} disabled={!canUndo} title="Undo" type="button">
                <Undo2 size={18} />
              </button>
              <button className="icon-button" onClick={redo} disabled={!canRedo} title="Redo" type="button">
                <Redo2 size={18} />
              </button>
              <span className="timer-pill">{formatTimer(remainingSeconds)}</span>
              <details className="session-menu" ref={sessionMenuRef}>
                <summary aria-label="Session actions">
                  <MoreVertical size={18} />
                </summary>
                <div className="session-menu-content">
                  <button onClick={resetSession} disabled={busy} type="button">
                    <ListRestart size={16} />
                    Select problem
                  </button>
                  <button onClick={restartCurrentProblem} disabled={busy || !activeBrief} type="button">
                    <RotateCcw size={16} />
                    Restart problem
                  </button>
                  <button onClick={saveSessionSnapshot} type="button">
                    <Download size={16} />
                    Save session
                  </button>
                  <button onClick={saveDiagramSvg} type="button">
                    <Download size={16} />
                    Save SVG
                  </button>
                  <button onClick={toggleTheme} type="button">
                    {darkMode ? <Sun size={16} /> : <Moon size={16} />}
                    {darkMode ? "Light mode" : "Dark mode"}
                  </button>
                  <button className="danger" onClick={() => { closeSessionMenu(); clearCanvas(); }} type="button">
                    <Trash2 size={16} />
                    Clear canvas
                  </button>
                </div>
              </details>
            </>
          )}
        />
        <div className="canvas-corner-tools">
          {cornerPanel === "hints" && (
            <div className="corner-popover" role="dialog" aria-label="Interview hints">
              <ul className="hint-checklist">
                {interviewHints.map((hint) => {
                  const checked = checkedHints.includes(hint.id);
                  return (
                    <li key={hint.id} className={checked ? "hint-item checked" : "hint-item"}>
                      <label>
                        <input
                          checked={checked}
                          onChange={(event) => {
                            setCheckedHints((current) => (
                              event.target.checked
                                ? [...current, hint.id]
                                : current.filter((id) => id !== hint.id)
                            ));
                          }}
                          type="checkbox"
                        />
                        <span>{hint.label}</span>
                      </label>
                      <div className="hint-explanation">{hint.explanation}</div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {cornerPanel === "diagram" && (
            <div className="corner-popover diagram-text-popover" role="dialog" aria-label="AI-visible diagram text">
              <pre>{diagramSummary}</pre>
            </div>
          )}
          <div className="corner-tool-row">
            <button
              className={cornerPanel === "hints" ? "corner-tool active" : "corner-tool"}
              onClick={() => setCornerPanel((current) => (current === "hints" ? null : "hints"))}
              type="button"
            >
              <Lightbulb size={15} />
              Hints
            </button>
            <button
              className={cornerPanel === "diagram" ? "corner-tool active" : "corner-tool"}
              onClick={() => setCornerPanel((current) => (current === "diagram" ? null : "diagram"))}
              type="button"
            >
              <FileText size={15} />
              Diagram text
            </button>
          </div>
        </div>
      </section>

      <aside className="interview-panel">
        {error && <div className="error-box">{error}</div>}

        <div className="transcript">
          {messages.length === 0 && (
            <div className="empty-state">
              Choose a topic, add system components on the canvas, then start the AI interviewer.
            </div>
          )}
          {messages.map((message, index) => (
            <article key={`${message.role}-${index}`} className={`message ${message.role}`}>
              <div className="message-header">
                <span className="message-avatar">
                  {message.role === "assistant" ? <MessagesSquare size={15} /> : <User size={15} />}
                </span>
                <div className="message-role">{message.role === "assistant" ? "Interviewer" : "Candidate"}</div>
              </div>
              {preparingOpening && message.role === "assistant" && index === 0 && (
                <div className="opening-loading">
                  <span className="opening-spinner"><Loader2 className="spin" size={14} /></span>
                  <span>Generating problem details</span>
                  <span className="loading-dots" aria-hidden="true"><span /> <span /> <span /></span>
                </div>
              )}
              <p>{message.content || (busy && index === messages.length - 1 ? "..." : "")}</p>
              {preparingOpening && message.role === "assistant" && index === 0 && message.content === openingPlaceholder(activeTopic) && (
                <div className="opening-skeleton" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              )}
            </article>
          ))}
        </div>

        <div className="answer-box">
          <textarea
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Answer the current question..."
            rows={5}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                void sendAnswer();
              }
            }}
          />
          <button className="primary-button" onClick={sendAnswer} disabled={busy || messages.length === 0 || !activeBrief || !answer.trim()} type="button">
            <Send size={17} />
            Send
          </button>
        </div>

      </aside>
    </main>
  );
}

export default App;
