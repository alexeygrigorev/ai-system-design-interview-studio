import { readFile } from "node:fs/promises";
import path from "node:path";

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

interface InterviewBrief {
  problem: string;
  context: string;
  constraints: string[];
  examples: string[];
}

const personaFiles: Record<Persona, string> = {
  supportive: "03_persona_supportive_coach.md",
  neutral: "04_persona_neutral_evaluator.md",
  adversarial: "05_persona_adversarial_challenger.md"
};

function extractTextFence(markdown: string) {
  const match = markdown.match(/```text\n([\s\S]*?)```/);
  return match?.[1]?.trim() ?? markdown.trim();
}

async function readPromptFile(root: string, file: string) {
  const markdown = await readFile(path.join(root, "ai_engineering_interviewer_prompts", file), "utf8");
  return extractTextFence(markdown);
}

export async function buildSystemPrompt(projectRoot: string, session: SessionConfig) {
  const [basePrompt, personaPrompt] = await Promise.all([
    readPromptFile(projectRoot, "01_base_ai_engineering_system_design_interviewer.md"),
    readPromptFile(projectRoot, personaFiles[session.persona])
  ]);

  const sessionPrompt = `Session configuration:

Candidate level: ${session.level}
Interview duration: ${session.duration} minutes
Interview topic: ${session.topic}
Feedback mode: ${session.feedbackMode}`;

  return `${basePrompt}

${sessionPrompt}

${personaPrompt}

Application instructions:
- The candidate may use a diagram canvas. Treat diagram text context as canvas evidence, not as a replacement for spoken reasoning.
- Do not infer details that are not represented in the transcript or diagram text context.
- Ask exactly one interviewer question per turn.
- Keep interviewer turns concise.
- For final assessment, base scores only on the transcript and canvas artifacts provided.`;
}
