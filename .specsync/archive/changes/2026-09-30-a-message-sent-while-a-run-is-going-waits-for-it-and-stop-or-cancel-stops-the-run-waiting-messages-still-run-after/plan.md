---
change: a-message-sent-while-a-run-is-going-waits-for-it-and-stop-or-cancel-stops-the-run-waiting-messages-still-run-after
artifact: plan
---

# Plan

1. Capture AGENT-3.b with `hi` (own commit), confirm AGENT-3 / AGENT-3.a on
   main and the tracking issue (#122).
2. `src/discord/run-control.ts`: queue, turn handle, stop, close, settle,
   stop words and texts.
3. Router `stop_run` route and `RouteAction` kind; bridge chat path (stop,
   queue, stopped / closed handling), pick path, `stopRunFor`, `close` /
   `settle` in `stop()`, `noteForgotten` in `onForgotten`, `onStopped` card
   pass.
4. `SlashContext.runControl`; `/session start` and `/work` turns and stopped
   handling.
5. `tests/discord.run-queue.test.ts`, `tests/discord.stop-run.test.ts`;
   fail-on-base proof (swap the base's six modified sources in, keep the new
   module, run, restore).
6. Docs (`docs/discord.md`), spec prose (`discord.spec.md` files, Public
   API, Invariants, a scenario, error rows), module testing evidence, deltas.
7. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
