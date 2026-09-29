---
module: cli
change: prompt-injection-hygiene-display-names-are-cleaned-before-the-model-sees-them-and-a-name-that-imitates-the-owner-or-a
---

# Delta — cli (SAFE-13 notice on the task-run result)

## Added

### REQUIREMENT REQ-cli-071

`task run` SHALL copy the run's SAFE-13 notice — the first tool result that
looked like a prompt-injection attempt, as `{ source, reasons }` (the tool
name and reason ids, never the text), reported by `createTaskExecute({
onInjection })` (REQ-agent-071) — onto `TaskResult.injection`, the way it
copies `spendWarning`, so `--json` and the NDJSON `result` frame carry it
(additive; the protocol version stays 2) and the Discord, WATCH and schedule
surfaces can tell the owner. A run with no hit leaves the field out. No flag,
env var or config key.

Acceptance Criteria
- A run whose tool result trips the detector reports `{ source, reasons }` once through `onInjection`; the Discord and WATCH spawn clients read it back from the result frame with `injectionNoticeFromUnknown` (tool-name source, known reason ids only) and the bridge / WATCH tests drive the owner notice from it.
- Regression tests in `tests/safe.injection.test.ts` fail on the base sources and pass after.
