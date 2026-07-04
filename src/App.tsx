import { AlertCircle, Bot, CheckCircle2, Loader2, Play, RotateCcw, Send, Sparkles, Wifi } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getHealth, requestAssessment, requestInterviewTurn, type HealthStatus } from "./api";
import { DiagramBoard } from "./DiagramBoard";
import { phaseGuide, processGates, topicBank } from "./questionBank";
import type { CandidateLevel, ChatMessage, DiagramShape, FeedbackMode, Persona, SessionConfig } from "./types";

const defaultConstraints = [
  "Must handle private data safely",
  "Must define launch-blocking metrics",
  "Must include production monitoring"
];

function App() {
  const [level, setLevel] = useState<CandidateLevel>("senior");
  const [duration, setDuration] = useState(45);
  const [persona, setPersona] = useState<Persona>("neutral");
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>("end_only");
  const [topic, setTopic] = useState(topicBank[0]);
  const [constraintText, setConstraintText] = useState(defaultConstraints.join("\n"));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [answer, setAnswer] = useState("");
  const [assessment, setAssessment] = useState("");
  const [shapes, setShapes] = useState<DiagramShape[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<HealthStatus | null>(null);

  const session = useMemo<SessionConfig>(() => ({
    level,
    duration,
    persona,
    feedbackMode,
    topic,
    constraints: constraintText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
  }), [constraintText, duration, feedbackMode, level, persona, topic]);

  const providerReady = Boolean(health?.ok && health.ready);
  const providerStatusClass = !health
    ? "provider-status checking"
    : providerReady
      ? "provider-status ready"
      : health.ok
        ? "provider-status missing"
        : "provider-status failure";
  const providerStatusText = !health
    ? "Checking Z.AI status"
    : providerReady
      ? `Z.AI ready: ${health.model}`
      : health.ok
        ? "Z.AI key missing"
        : "Z.AI health check failed";

  function missingProviderMessage(forAssessment = false) {
    if (!health) return "Still checking AI interviewer provider status. Try again in a moment.";
    if (!health.ok) return "The app health endpoint is unavailable. Check the dev server and reload the page.";
    if (!health.zaiConfigured) {
      return forAssessment
        ? "ZAI_API_KEY is not configured. Final assessment needs the Z.AI interviewer provider."
        : "ZAI_API_KEY is not configured. Add it to .env and restart the dev server to use the AI interviewer.";
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
    setBusy(true);
    setError("");
    setAssessment("");
    setMessages([]);
    const providerError = missingProviderMessage();
    if (providerError) {
      setError(providerError);
      setBusy(false);
      return;
    }
    try {
      const { reply } = await requestInterviewTurn(session, [], shapes);
      setMessages([{ role: "assistant", content: reply }]);
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

  async function finishInterview() {
    if (messages.length === 0 || busy) return;
    const providerError = missingProviderMessage(true);
    if (providerError) {
      setError(providerError);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { assessment: finalAssessment } = await requestAssessment(session, messages, shapes);
      setAssessment(finalAssessment);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assess interview");
    } finally {
      setBusy(false);
    }
  }

  function resetSession() {
    setMessages([]);
    setAnswer("");
    setAssessment("");
    setError("");
  }

  return (
    <main className="app-shell">
      <aside className="setup-panel">
        <div className="brand-row">
          <div className="brand-mark"><Bot size={22} /></div>
          <div>
            <h1>AI System Design Trainer</h1>
            <p>Practice production AI architecture interviews.</p>
          </div>
        </div>

        <div className={providerStatusClass}>
          {providerReady ? <Wifi size={16} /> : health ? <AlertCircle size={16} /> : <Loader2 className="spin" size={16} />}
          <span>{providerStatusText}</span>
        </div>

        <label>
          Topic
          <select value={topic} onChange={(event) => setTopic(event.target.value)}>
            {topicBank.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>

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
          <select value={persona} onChange={(event) => setPersona(event.target.value as Persona)}>
            <option value="supportive">Supportive coach</option>
            <option value="neutral">Neutral evaluator</option>
            <option value="adversarial">Adversarial challenger</option>
          </select>
        </label>

        <label>
          Feedback
          <select value={feedbackMode} onChange={(event) => setFeedbackMode(event.target.value as FeedbackMode)}>
            <option value="end_only">End only</option>
            <option value="midpoint_and_end">Midpoint and end</option>
            <option value="coaching_after_sections">Coaching after sections</option>
          </select>
        </label>

        <label>
          Constraints
          <textarea value={constraintText} onChange={(event) => setConstraintText(event.target.value)} rows={5} />
        </label>

        <div className="action-row">
          <button className="primary-button" onClick={startInterview} disabled={busy} type="button">
            {busy ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
            Start
          </button>
          <button className="secondary-button" onClick={resetSession} disabled={busy} type="button">
            <RotateCcw size={17} />
            Reset
          </button>
        </div>

        <section className="compact-section">
          <h2>Interview Phases</h2>
          <div className="phase-list">
            {phaseGuide.map((phase) => <span key={phase}>{phase}</span>)}
          </div>
        </section>

        <section className="compact-section">
          <h2>Shipping Gates</h2>
          <div className="gate-list">
            {processGates.map((gate) => (
              <span key={gate}><CheckCircle2 size={14} />{gate}</span>
            ))}
          </div>
        </section>
      </aside>

      <section className="workspace">
        <DiagramBoard shapes={shapes} setShapes={setShapes} />
      </section>

      <aside className="interview-panel">
        <div className="panel-heading">
          <div>
            <h2>Interview</h2>
            <p>{messages.length ? `${messages.length} transcript turns` : "Start when ready"}</p>
          </div>
          <button className="assess-button" onClick={finishInterview} disabled={busy || messages.length === 0} type="button">
            <Sparkles size={16} />
            Assess
          </button>
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

        {assessment && (
          <section className="assessment">
            <h2>Final Feedback</h2>
            <pre>{assessment}</pre>
          </section>
        )}
      </aside>
    </main>
  );
}

export default App;
