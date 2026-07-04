export type CandidateLevel = "junior" | "mid-level" | "senior" | "staff";
export type Persona = "supportive" | "neutral" | "adversarial";
export type FeedbackMode = "end_only" | "midpoint_and_end" | "coaching_after_sections";

export interface SessionConfig {
  level: CandidateLevel;
  duration: number;
  topic: string;
  persona: Persona;
  feedbackMode: FeedbackMode;
  constraints: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type Tool = "select" | "rect" | "ellipse" | "note" | "arrow" | "line" | "freehand";
export type PrimitiveKind = "service" | "datastore" | "queue" | "vector-index" | "model" | "tool" | "human-review";

export interface Point {
  x: number;
  y: number;
}

export interface DiagramShape {
  id: string;
  type: Exclude<Tool, "select">;
  primitive?: PrimitiveKind;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  label?: string;
  points?: Point[];
}
