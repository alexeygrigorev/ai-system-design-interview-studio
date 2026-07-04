import { Bot, Loader2, MoreVertical, Play, RotateCcw, Send, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getHealth, requestInterviewTurn, type HealthStatus } from "./api";
import { DiagramBoard } from "./DiagramBoard";
import { interviewProblems } from "./questionBank";
import type { CandidateLevel, ChatMessage, DiagramShape, Persona, PrimitiveKind, SessionConfig } from "./types";

const SESSION_STORAGE_KEY = "ai-system-design-trainer.session.v1";

interface PersistedState {
  level: CandidateLevel;
  duration: number;
  persona: Persona | "random";
  topic: string;
  customTopic: string;
  constraintText: string;
  messages: ChatMessage[];
  answer: string;
  shapes: DiagramShape[];
  screen: "setup" | "interview";
  activePersona: Persona;
  activeTopic: string;
  activeConstraints: string[];
  remainingSeconds: number;
}

function humanizeKind(value?: PrimitiveKind) {
  if (!value) return "component";
  return value.replace("-", " ");
}

function diagramLabel(shape: DiagramShape) {
  const label = shape.label?.trim();
  if (label) return label;
  return shape.primitive ? humanizeKind(shape.primitive) : "Unlabeled item";
}

function summarizeConnector(shape: DiagramShape, shapesById: Map<string, DiagramShape>) {
  const source = shape.sourceId ? shapesById.get(shape.sourceId) : undefined;
  const target = shape.targetId ? shapesById.get(shape.targetId) : undefined;
  if (source && target) return `${diagramLabel(source)} -> ${diagramLabel(target)}`;
  return "Unconnected connector";
}

function openingTurn(topic: string) {
  return `Problem: ${topic}

Before drawing the architecture, what would you clarify about users, success criteria, data sources, scale, latency, safety, and constraints?`;
}

function formatTimer(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatConstraints(constraints: string[]) {
  return constraints.join("\n");
}

function parseConstraints(value: string) {
  return value
    .split("\n")
    .map((line) => line.replace(/^-+\s*/, "").trim())
    .filter(Boolean);
}

function loadPersistedState(): Partial<PersistedState> {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function DiagramSummary({ shapes }: { shapes: DiagramShape[] }) {
  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]));
  const components = shapes.filter((shape) => shape.type === "rect" || shape.type === "ellipse");
  const connectors = shapes.filter((shape) => shape.type === "arrow");
  const notes = shapes.filter((shape) => shape.type === "note");
  const hasDiagram = components.length > 0 || connectors.length > 0 || notes.length > 0;
  if (!hasDiagram) return null;

  return (
    <section className="ai-context-panel" aria-label="AI-visible diagram summary">
      <div className="ai-context-heading">
        <h3>AI sees</h3>
        <span>{components.length} components</span>
      </div>
      <div className="ai-context-groups">
        <div>
          <h4>Components</h4>
          {components.length ? (
            <ul>
              {components.map((shape) => (
                <li key={shape.id}>{diagramLabel(shape)} <span>{humanizeKind(shape.primitive)}</span></li>
              ))}
            </ul>
          ) : <p>None</p>}
        </div>
        <div>
          <h4>Connections</h4>
          {connectors.length ? (
            <ul>
              {connectors.map((shape) => <li key={shape.id}>{summarizeConnector(shape, shapesById)}</li>)}
            </ul>
          ) : <p>None</p>}
        </div>
        {notes.length > 0 && (
          <div>
            <h4>Notes</h4>
            <ul>
              {notes.map((shape) => <li key={shape.id}>{diagramLabel(shape)}</li>)}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function App() {
  const [persistedState] = useState(loadPersistedState);
  const [level, setLevel] = useState<CandidateLevel>(persistedState.level ?? "senior");
  const [duration, setDuration] = useState(persistedState.duration ?? 45);
  const [persona, setPersona] = useState<Persona | "random">(persistedState.persona ?? "random");
  const [topic, setTopic] = useState(persistedState.topic ?? "__random__");
  const [customTopic, setCustomTopic] = useState(persistedState.customTopic ?? "");
  const [constraintText, setConstraintText] = useState(persistedState.constraintText ?? formatConstraints(interviewProblems[0].constraints));
  const [activeConstraints, setActiveConstraints] = useState<string[]>(persistedState.activeConstraints ?? []);
  const [messages, setMessages] = useState<ChatMessage[]>(persistedState.messages ?? []);
  const [answer, setAnswer] = useState(persistedState.answer ?? "");
  const [shapes, setShapes] = useState<DiagramShape[]>(persistedState.shapes ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [screen, setScreen] = useState<"setup" | "interview">(persistedState.screen ?? "setup");
  const [activePersona, setActivePersona] = useState<Persona>(persistedState.activePersona ?? "neutral");
  const [activeTopic, setActiveTopic] = useState(persistedState.activeTopic ?? interviewProblems[0].title);
  const [remainingSeconds, setRemainingSeconds] = useState(persistedState.remainingSeconds ?? duration * 60);

  const session = useMemo<SessionConfig>(() => ({
    level,
    duration,
    persona: activePersona,
    feedbackMode: "end_only",
    topic: activeTopic,
    constraints: activeConstraints
  }), [activeConstraints, activePersona, activeTopic, duration, level]);

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
    const nextState: PersistedState = {
      level,
      duration,
      persona,
      topic,
      customTopic,
      constraintText,
      messages,
      answer,
      shapes,
      screen,
      activePersona,
      activeTopic,
      activeConstraints,
      remainingSeconds
    };
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextState));
  }, [
    activeConstraints,
    activePersona,
    activeTopic,
    answer,
    constraintText,
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

  function updateTopic(nextTopic: string) {
    setTopic(nextTopic);
    if (nextTopic === "__custom__") {
      setConstraintText("");
      return;
    }
    const selectedProblem = interviewProblems.find((problem) => problem.title === nextTopic);
    if (selectedProblem) {
      setConstraintText(formatConstraints(selectedProblem.constraints));
    }
  }

  async function startInterview() {
    const randomProblem = interviewProblems[Math.floor(Math.random() * interviewProblems.length)];
    const selectedProblem = interviewProblems.find((problem) => problem.title === topic);
    const resolvedProblem = topic === "__random__" ? randomProblem : selectedProblem;
    const resolvedTopic = topic === "__custom__" ? customTopic.trim() : resolvedProblem?.title ?? topic;
    const resolvedConstraints = topic === "__random__"
      ? randomProblem.constraints
      : parseConstraints(constraintText);
    const personas: Persona[] = ["neutral", "adversarial"];
    const resolvedPersona = persona === "random"
      ? personas[Math.floor(Math.random() * personas.length)]
      : persona;

    setActiveTopic(resolvedTopic);
    setActivePersona(resolvedPersona);
    setActiveConstraints(resolvedConstraints);
    setBusy(true);
    setError("");
    setMessages([]);
    setShapes([]);
    setRemainingSeconds(duration * 60);
    if (!resolvedTopic) {
      setError("Enter a custom problem or choose one from the list.");
      setBusy(false);
      return;
    }
    const providerError = missingProviderMessage();
    if (providerError) {
      setError(providerError);
      setBusy(false);
      return;
    }
    setMessages([{ role: "assistant", content: openingTurn(resolvedTopic) }]);
    setScreen("interview");
    setBusy(false);
  }

  async function sendAnswer() {
    const trimmed = answer.trim();
    if (!trimmed || busy || messages.length === 0) return;
    const providerError = missingProviderMessage();
    if (providerError) {
      setError(providerError);
      return;
    }
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setAnswer("");
    setMessages(nextMessages);
    setBusy(true);
    setError("");
    try {
      const { reply } = await requestInterviewTurn(session, nextMessages, shapes);
      setMessages([...nextMessages, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not continue interview");
    } finally {
      setBusy(false);
    }
  }

  function resetSession() {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setMessages([]);
    setAnswer("");
    setError("");
    setShapes([]);
    setActiveConstraints([]);
    setRemainingSeconds(duration * 60);
    setScreen("setup");
  }

  if (screen === "setup") {
    return (
      <main className="setup-screen">
        <section className="setup-workspace">
          <div className="brand-row">
            <div className="brand-mark"><Bot size={22} /></div>
            <div>
              <h1>AI System Design Trainer</h1>
              <p>Choose the interview, then work in a focused canvas and transcript.</p>
            </div>
          </div>

          {error && <div className="error-box">{error}</div>}

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
            <label>
              Custom problem
              <textarea
                value={customTopic}
                onChange={(event) => setCustomTopic(event.target.value)}
                placeholder="Example: Internal support assistant that answers questions from private runbooks and escalates risky actions."
                rows={3}
              />
            </label>
          )}

          <label>
            Problem-specific constraints
            <textarea
              value={constraintText}
              onChange={(event) => setConstraintText(event.target.value)}
              placeholder="Optional. Example: regulated domain, low latency, human approval for irreversible actions."
              rows={4}
            />
          </label>

          <button className="primary-button setup-start" onClick={startInterview} disabled={busy || !providerReady} type="button">
            {busy ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
            Start interview
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="interview-shell">
      <section className="workspace">
        <DiagramBoard shapes={shapes} setShapes={setShapes} />
      </section>

      <aside className="interview-panel">
        <div className="panel-heading compact-heading">
          <span className="timer-pill">{formatTimer(remainingSeconds)}</span>
          <details className="session-menu">
            <summary aria-label="Session actions">
              <MoreVertical size={18} />
            </summary>
            <div className="session-menu-content">
              <button onClick={resetSession} disabled={busy} type="button">
                <RotateCcw size={16} />
                New session
              </button>
            </div>
          </details>
        </div>

        {error && <div className="error-box">{error}</div>}

        <DiagramSummary shapes={shapes} />

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
                  {message.role === "assistant" ? <Bot size={15} /> : <User size={15} />}
                </span>
                <div className="message-role">{message.role === "assistant" ? "Interviewer" : "Candidate"}</div>
              </div>
              <p>{message.content}</p>
            </article>
          ))}
          {busy && <div className="thinking"><Loader2 className="spin" size={17} /> Interviewer is thinking</div>}
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
          <button className="primary-button" onClick={sendAnswer} disabled={busy || messages.length === 0 || !answer.trim()} type="button">
            <Send size={17} />
            Send
          </button>
        </div>

      </aside>
    </main>
  );
}

export default App;
