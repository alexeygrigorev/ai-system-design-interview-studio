# AI System Design Trainer

Practice AI engineering system design interviews with a Z.AI-powered interviewer and a built-in architecture drawing board.

The app uses the unpacked prompt pack in `ai_engineering_interviewer_prompts/` at runtime, so the interviewer behavior can be adjusted by editing those markdown files. Interview topics are derived from the AI Engineering Field Guide system design question set, and the project process follows the AI Shipping Labs/DataOps gates documented in `docs/PROCESS.md`.

## Features

- AI engineering interview setup by level, duration, persona, feedback mode, topic, and constraints
- Drawing board with rectangles, ellipses, notes, arrows, lines, freehand strokes, colors, undo, clear, and JSON export
- Transcript-based interviewer turns
- End-of-session structured feedback against the AI engineering rubric
- Server-side Z.AI integration, keeping API keys out of the browser

## Run Locally

```bash
npm install
cp .env.example .env
# edit .env and set ZAI_API_KEY
npm run dev
```

Open `http://localhost:5173`.

## Z.AI Configuration

The server calls Z.AI through its OpenAI-compatible chat completions endpoint.

```bash
ZAI_API_KEY=your-zai-api-key
ZAI_MODEL=glm-5.2
ZAI_BASE_URL=https://api.z.ai/api/paas/v4
```

## Build

```bash
npm run build
NODE_ENV=production node dist-server/index.js
```

## Sources

- Prompt pack: `ai_engineering_interviewer_prompts/`
- AI Engineering Field Guide: `https://github.com/alexeygrigorev/ai-engineering-field-guide`
- Z.AI OpenAI-compatible API docs: `https://docs.z.ai/guides/develop/openai/python`
- AI Shipping Labs/DataOps process reference: `https://github.com/DataTalksClub/dataops/blob/main/_docs/PROCESS.md`
