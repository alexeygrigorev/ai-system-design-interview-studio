import { Bot, Loader2, Play, RotateCcw, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getHealth, requestInterviewTurn, type HealthStatus } from "./api";
import { DiagramBoard } from "./DiagramBoard";
import { topicBank } from "./questionBank";
import type { CandidateLevel, ChatMessage, DiagramShape, Persona, SessionConfig } from "./types";

function App() {
  const [level, setLevel] = useState<CandidateLevel>("senior");
  const [duration, setDuration] = useState(45);
  const [persona, setPersona] = useState<Persona | "random">("random");
  const [topic, setTopic] = useState("__random__");
  const [customTopic, setCustomTopic] = useState("");
  const [constraintText, setConstraintText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [answer, setAnswer] = useState("");
  const [shapes, setShapes] = useState<DiagramShape[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [screen, setScreen] = useState<"setup" | "interview">("setup");
  const [activePersona, setActivePersona] = useState<Persona>("neutral");
  const [activeTopic, setActiveTopic] = useState(topicBank[0]);

  const session = useMemo<SessionConfig>(() => ({
    level,
    duration,
    persona: activePersona,
    feedbackMode: "end_only",
    topic: activeTopic,
    constraints: constraintText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
  }), [activePersona, activeTopic, constraintText, duration, level]);

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
            model: "unknown",
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

  async function startInterview() {
    const resolvedTopic = topic === "__random__"
      ? topicBank[Math.floor(Math.random() * topicBank.length)]
      : topic === "__custom__"
        ? customTopic.trim()
      : topic;
    const personas: Persona[] = ["neutral", "adversarial"];
    const resolvedPersona = persona === "random"
      ? personas[Math.floor(Math.random() * personas.length)]
      : persona;

    setActiveTopic(resolvedTopic);
    setActivePersona(resolvedPersona);
    setBusy(true);
    setError("");
    setMessages([]);
    setShapes([]);
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
    try {
      const nextSession: SessionConfig = {
        ...session,
        topic: resolvedTopic,
        persona: resolvedPersona,
        feedbackMode: "end_only"
      };
      const { reply } = await requestInterviewTurn(nextSession, [], []);
      setMessages([{ role: "assistant", content: reply }]);
      setScreen("interview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start interview");
    } finally {
      setBusy(false);
    }
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
    setMessages([]);
    setAnswer("");
    setError("");
    setShapes([]);
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

          <label>
            Question
            <select value={topic} onChange={(event) => setTopic(event.target.value)}>
              <option value="__random__">Random question</option>
              <option value="__custom__">Custom problem</option>
              {topicBank.map((item) => <option key={item}>{item}</option>)}
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
            Interviewer
            <select value={persona} onChange={(event) => setPersona(event.target.value as Persona | "random")}>
              <option value="random">Random interviewer</option>
              <option value="neutral">Neutral evaluator</option>
              <option value="adversarial">Adversarial challenger</option>
            </select>
          </label>

          <details className="advanced-settings">
            <summary>Session settings</summary>
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
              Problem-specific constraints
              <textarea
                value={constraintText}
                onChange={(event) => setConstraintText(event.target.value)}
                placeholder="Optional. Example: regulated domain, low latency, human approval for irreversible actions."
                rows={4}
              />
            </label>
          </details>

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
      <header className="interview-header">
        <div>
          <h1>{activeTopic}</h1>
        </div>
        <div className="session-summary">
          <span>{activePersona.replace("-", " ")}</span>
          <span>{level}</span>
          <span>{duration} min</span>
        </div>
        <button className="secondary-button" onClick={resetSession} disabled={busy} type="button">
          <RotateCcw size={17} />
          New session
        </button>
      </header>

      <section className="workspace">
        <DiagramBoard shapes={shapes} setShapes={setShapes} />
      </section>

      <aside className="interview-panel">
        <div className="panel-heading">
          <div>
            <h2>Interview</h2>
            <p>{messages.length ? `${messages.length} transcript turns` : "Starting..."}</p>
          </div>
        </div>

        {error && <div className="error-box">{error}</div>}

        <div className="transcript">
          {messages.length === 0 && (
            <div className="empty-state">
              Choose a topic, add system components on the canvas, then start the AI interviewer.
            </div>
          )}
          {messages.map((message, index) => (
            <article key={`${message.role}-${index}`} className={`message ${message.role}`}>
              <div className="message-role">{message.role === "assistant" ? "Interviewer" : "Candidate"}</div>
              <p>{message.content}</p>
            </article>
          ))}
          {busy && <div className="thinking"><Loader2 className="spin" size={17} /> Waiting for Z.AI</div>}
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
