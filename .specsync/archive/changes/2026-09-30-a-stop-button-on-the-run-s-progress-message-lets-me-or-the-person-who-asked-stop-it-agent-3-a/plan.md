---
change: a-stop-button-on-the-run-s-progress-message-lets-me-or-the-person-who-asked-stop-it-agent-3-a
artifact: plan
---

# Plan

1. Confirm AGENT-3.a / AGENT-3.b on main (no capture) and the tracking issue
   (#122).
2. `run-control.ts`: Stop button ids, parser, components and texts.
3. `ThinkingStatus` components (send, reuse, clear on done / fail / answer /
   discard); `ThinkingOutbound`, gateway and in-memory outbound plumbing;
   interrupted notice clears components.
4. Bridge: Stop components on the chat and pick / Answer runs; `stopRun`
   helper; `pressPassesGates` shared with the ask branch; `cvstop` branch.
   `/session start` and `/work` pass the components.
5. Tests: `tests/discord.stop-run.test.ts` (Stop button describe + id unit),
   `tests/discord.thinking-status.test.ts` (Stop button describe), the Answer
   form test's stub expectation; fail-on-base proof (swap the base's six
   modified sources in, keep `run-control.ts`, run, restore).
6. Docs (`docs/discord.md`), spec prose (`discord.spec.md` Public API,
   Invariants, a scenario, error rows), module testing evidence, deltas.
7. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
