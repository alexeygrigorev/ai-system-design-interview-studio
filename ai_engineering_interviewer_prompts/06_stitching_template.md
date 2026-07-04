# Stitching Template

Use this structure at runtime:

```text
[BASE_PROMPT]

[SESSION_CONFIGURATION]

[PERSONA_BEHAVIOR_PROMPT]
```

Example:

```text
<BASE_PROMPT>
...AI Engineering interviewer prompt...
</BASE_PROMPT>

<SESSION_CONFIGURATION>
Candidate level: senior
Interview duration: 45 minutes
Interview topic: Design a RAG-based customer support assistant for an e-commerce company.
Feedback mode: end_only
Constraints:
- Must support private customer data
- Must escalate refund disputes to a human
- Must optimize for low hallucination risk
</SESSION_CONFIGURATION>

<PERSONA_BEHAVIOR_PROMPT>
...Neutral Evaluator prompt...
</PERSONA_BEHAVIOR_PROMPT>
```

Recommended modular interpretation:

```text
Base prompt = what to evaluate
Session config = what interview to run
Persona prompt = how to behave
```

Important rule:
The persona prompt should never redefine the rubric. It should only change the interviewer’s interaction style.
