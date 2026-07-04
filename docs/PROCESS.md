# Development Process

This repo uses a compact version of the AI Shipping Labs/DataOps process.

## Gates

1. Intake: capture the user request and source materials.
2. Grooming: define scope, acceptance criteria, dependencies, and test evidence.
3. Implementation: make local changes without unrelated churn.
4. Tester verification: run real checks for the touched surface.
5. PM acceptance: review the result from the user workflow perspective.
6. Ship and monitor: publish, push, and check the repository state.

## Acceptance Criteria For This Project

- The prompt pack is unpacked and preserved in the repo.
- The frontend supports drawing multiple architecture primitives.
- The interviewer uses AI engineering system design questions and rubric concepts.
- Z.AI calls are made from the server with environment-based configuration.
- End-of-session feedback uses the transcript and diagram artifacts.
- The repo can be installed, built, and run locally.

## Verification Commands

```bash
npm run typecheck
npm run build
```
