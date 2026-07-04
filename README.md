# AI System Design Trainer

Practice AI engineering system design interviews with a Z.AI-powered interviewer and a built-in architecture drawing board.

The app uses the unpacked prompt pack in `ai_engineering_interviewer_prompts/` at runtime, so the interviewer behavior can be adjusted by editing those markdown files. Interview topics are derived from the AI Engineering Field Guide system design question set, and the project process follows the AI Shipping Labs/DataOps gates documented in `docs/PROCESS.md`.

## Features

- AI engineering interview setup by level, duration, persona, feedback mode, topic, and constraints
- Focused system design canvas with components, notes, attached connectors, label editing, undo, clear, and JSON export
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

The server calls Z.AI through its Anthropic-compatible Messages endpoint. `ZAI_BASE_URL`
defaults to `https://api.z.ai/api/anthropic`; the server appends `/v1/messages`
unless the configured URL already includes `/v1` or `/v1/messages`.

```bash
ZAI_API_KEY=your-zai-api-key
ZAI_MODEL=glm-5.2
ZAI_BASE_URL=https://api.z.ai/api/anthropic
```

## Build

```bash
npm run build
NODE_ENV=production node dist-server/index.js
```

## Sources

- Prompt pack: `ai_engineering_interviewer_prompts/`
- AI Engineering Field Guide: `https://github.com/alexeygrigorev/ai-engineering-field-guide`
- Z.AI Anthropic-compatible endpoint setup: `https://docs.z.ai/scenario-example/develop-tools/claude`
- AI Shipping Labs/DataOps process reference: `https://github.com/DataTalksClub/dataops/blob/main/_docs/PROCESS.md`
