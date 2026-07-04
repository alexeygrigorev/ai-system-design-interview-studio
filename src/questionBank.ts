export interface InterviewProblem {
  id: string;
  title: string;
  constraints: string[];
}

export const interviewProblems: InterviewProblem[] = [
  {
    id: "enterprise-rag",
    title: "Document Q&A Assistant / RAG system for private enterprise documents.",
    constraints: [
      "Answers must include citations and say when retrieved context does not contain the answer.",
      "Document access must respect user, group, tenant, and source-system permissions.",
      "Inputs include PDFs, slides, wikis, tables, and long reports where document-wide context matters.",
      "Evaluation should cover retrieval quality, faithfulness, answerable/unanswerable cases, and regressions."
    ]
  },
  {
    id: "million-user-chat",
    title: "AI chat feature scaled to 1M daily users, with cost, latency, and reliability tradeoffs.",
    constraints: [
      "Optimize time-to-first-token, p95 latency, token cost, and provider rate limits.",
      "Use model tiering, caching, prompt compression, and fallback routing where quality allows.",
      "Track LLM-specific metrics: cost, latency, hallucination reports, safety blocks, and user satisfaction.",
      "Streaming responses are required; graceful degradation is preferred over hard failure."
    ]
  },
  {
    id: "coding-assistant",
    title: "AI coding assistant for a large engineering organization.",
    constraints: [
      "Repo indexing must preserve code ACLs and redact secrets before model or embedding calls.",
      "Autocomplete needs low latency; chat, code review, and larger edits can use slower stronger models.",
      "Tool actions such as creating commits, opening PRs, or modifying files require explicit user approval.",
      "Quality should be evaluated with internal test suites, compile success, acceptance rate, and defect rate."
    ]
  },
  {
    id: "hospital-voice-assistant",
    title: "Hospital voice assistant that handles noise, privacy, latency, and domain vocabulary.",
    constraints: [
      "The system must handle noisy rooms, accents, interruptions, and medical vocabulary.",
      "PHI handling, audit logs, EHR permissions, and retention policies are mandatory.",
      "Low-confidence transcription or clinical uncertainty must trigger clarification or clinician handoff.",
      "The assistant must not invent clinical facts or make unsupported diagnoses."
    ]
  },
  {
    id: "legal-contract-generation",
    title: "Legal contract generation system with compliance and human approval requirements.",
    constraints: [
      "Generated clauses must come from approved templates, playbooks, or cited legal knowledge sources.",
      "Human legal approval is required before external delivery or signature workflow entry.",
      "The system must keep versioned prompts, templates, outputs, redlines, and reviewer decisions.",
      "Risk summaries should identify unsupported, missing, or non-standard clauses instead of hiding uncertainty."
    ]
  },
  {
    id: "candidate-sourcing",
    title: "AI-powered candidate sourcing system.",
    constraints: [
      "Ranking must be explainable to recruiters and checked for protected-class proxy bias.",
      "Candidate data requires consent, retention limits, deletion support, and source attribution.",
      "The model can draft outreach, but recruiters approve messages before sending.",
      "Evaluate qualified-candidate precision, recruiter acceptance, diversity impact, and false negatives."
    ]
  },
  {
    id: "upload-processing",
    title: "Upload-processing system for 10K monthly user files, including bank payslips, IDs, and references.",
    constraints: [
      "Extract structured fields with OCR/multimodal models and attach confidence plus source evidence.",
      "Financial and identity data must be encrypted, redacted from logs, and governed by retention policy.",
      "Low-confidence extraction, mismatch, or fraud signals must route to human review.",
      "The pipeline can be asynchronous; correctness and auditability matter more than instant response."
    ]
  },
  {
    id: "doctor-insurer-billing",
    title: "Doctor-to-insurer billing automation based on patient notes.",
    constraints: [
      "Clinical notes contain PHI and must follow healthcare privacy, access, and audit requirements.",
      "Billing codes must be linked to supporting evidence from notes, not free-form model guesses.",
      "Payer-specific rules, missing documentation, and confidence thresholds affect submission eligibility.",
      "A billing specialist or clinician approves claims before final insurer submission."
    ]
  },
  {
    id: "fraud-detection",
    title: "Fraud detection system with model monitoring and escalation.",
    constraints: [
      "Decisions need explainable risk factors and escalation paths for analyst review.",
      "False positives harm legitimate users, so thresholds must vary by action value and risk.",
      "Models must be monitored for drift, adversarial behavior, label delay, and feedback-loop bias.",
      "LLMs may summarize evidence for analysts, but should not be the sole source of fraud decisions."
    ]
  },
  {
    id: "conversation-memory",
    title: "ChatGPT-style cross-conversation memory with privacy controls.",
    constraints: [
      "Memory is opt-in and users can inspect, edit, delete, and disable stored memories.",
      "Store structured memories with provenance, timestamps, sensitivity labels, and TTL where appropriate.",
      "Retrieval must isolate users and tenants and avoid surfacing stale or sensitive memories unexpectedly.",
      "Evaluate personalization benefit separately from privacy leaks and hallucinated memories."
    ]
  },
  {
    id: "agentic-workflow",
    title: "Multi-step agentic workflow for meeting scheduling or code review.",
    constraints: [
      "Tool calls need typed schemas, scoped credentials, idempotency, retries, and audit traces.",
      "Irreversible actions require human approval before execution.",
      "The orchestrator enforces max steps, termination conditions, and loop detection.",
      "Evaluate task completion, tool selection accuracy, safety/refusal behavior, and cost per completed task."
    ]
  },
  {
    id: "policy-detection",
    title: "Content and policy violation detection system.",
    constraints: [
      "Support inline low-latency checks plus async human review for borderline cases.",
      "Policies are versioned and category-specific; decisions need appeal and audit support.",
      "Measure precision, recall, severity calibration, and fairness across languages or dialects.",
      "Defend against adversarial evasion without exposing bypass details to users."
    ]
  },
  {
    id: "unified-query-engine",
    title: "Unified query engine across email, calendar, documents, and chat.",
    constraints: [
      "Federated retrieval must preserve source-system ACLs and connector rate limits.",
      "Answers need source links and must distinguish retrieved facts from inferred summaries.",
      "The system must handle time, people, entities, conflicting sources, and freshness requirements.",
      "PII leakage prevention and query audit logs are mandatory."
    ]
  },
  {
    id: "llm-search",
    title: "Real-time LLM-powered search engine.",
    constraints: [
      "Responses must be grounded in fresh retrieved sources with visible citations.",
      "Latency budget must cover search, reranking, generation, streaming, and cache lookup.",
      "The system needs source-quality scoring to reduce spam, hallucination, and stale answers.",
      "Popular queries should use caching, but time-sensitive queries must bypass stale cached answers."
    ]
  },
  {
    id: "image-generation-pipeline",
    title: "Scalable image-generation pipeline for millions of users.",
    constraints: [
      "Use async GPU job queues with prioritization, batching, retries, and progress updates.",
      "Prompt and output safety checks are required before images are delivered.",
      "Model versions, seeds, parameters, and outputs should be traceable for rollback and debugging.",
      "Cost controls include quotas, abuse detection, model tiering, and storage/CDN lifecycle policies."
    ]
  },
  {
    id: "model-deployment-platform",
    title: "Large-scale AI model deployment platform with model serving, routing, caching, and rollback.",
    constraints: [
      "Provide an LLM gateway with model/provider routing, rate limits, fallbacks, and tenant policies.",
      "Version models, prompts, tools, RAG configs, and eval gates before production rollout.",
      "Observability must track latency, token usage, cost, errors, safety blocks, and quality signals.",
      "Support canary, shadow traffic, rollback, exact/semantic caching, and capacity planning."
    ]
  }
];
