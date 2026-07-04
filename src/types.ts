export type CandidateLevel = "junior" | "mid-level" | "senior" | "staff";
export type Persona = "supportive" | "neutral" | "adversarial";
export type FeedbackMode = "end_only";

export interface SessionConfig {
  level: CandidateLevel;
  duration: number;
  topic: string;
  persona: Persona;
  feedbackMode: FeedbackMode;
  constraints: string[];
  brief?: InterviewBrief;
}

export interface InterviewBrief {
  problem: string;
  context: string;
  constraints: string[];
  examples: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type Tool = "select" | "component";
export type PrimitiveKind = "generic" | "user" | "service" | "datastore" | "queue" | "vector-index" | "model" | "tool" | "human-review";
export type ShapeType = "rect" | "ellipse" | "note" | "arrow";

export interface Point {
  x: number;
  y: number;
}

export interface DiagramShape {
  id: string;
  type: ShapeType;
  primitive?: PrimitiveKind;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  label?: string;
  points?: Point[];
  sourceId?: string;
  targetId?: string;
}
