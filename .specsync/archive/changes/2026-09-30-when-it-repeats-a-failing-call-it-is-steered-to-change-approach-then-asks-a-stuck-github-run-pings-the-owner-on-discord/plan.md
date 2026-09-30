---
change: when-it-repeats-a-failing-call-it-is-steered-to-change-approach-then-asks-a-stuck-github-run-pings-the-owner-on-discord
artifact: plan
---

# Plan

1. Capture AGENT-16.a with `hi` in its own commit; `hi check`.
2. `src/agent/loop-guards.ts` (pure) and the `runToolLoop` wiring.
3. WATCH: spawn client returns `ask`; `src/watch/owner-ask.ts`; poller call.
4. Bridge: `src/discord/watch-ask.ts`, tick wiring, bridge mark, stop.
5. SAFE-6: `watch_owner_asks.question` in `SCRUB_TARGETS`.
6. Tests: `tests/agent.loop-guards.test.ts`, `tests/watch.stuck-ask.test.ts`.
7. Fail-on-base proof: swap the base's six modified source files in (new
   modules kept so imports resolve), run both files, restore, run again.
8. Docs (docs/discord.md, docs/WATCH.md, docs/DISCORD-GO-LIVE.md), spec
   prose, deltas and testing evidence.
9. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
