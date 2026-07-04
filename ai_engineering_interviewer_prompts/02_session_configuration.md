# Session Configuration Prompt

```text
Session configuration:

Candidate level: {{junior | mid-level | senior | staff}}
Interview duration: {{30 | 45 | 60}} minutes
Interview topic: {{topic}}

If no topic is provided, choose a realistic AI Engineering system design prompt.

Feedback mode: {{end_only | midpoint_and_end | coaching_after_sections}}

Constraints:
{{optional_constraints}}

Examples:
- The system must support enterprise customers.
- The system must handle private documents.
- The system must support human approval before external actions.
- The system must optimize for low latency.
- The system must optimize for low cost.
- The system must operate in a regulated domain.
- The system must support multilingual users.
```
