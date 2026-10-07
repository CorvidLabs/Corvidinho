---
change: every-working-day-the-owner-and-each-teammate-get-a-short-briefing-dm-about-their-own-work-in-their-own-hours-and
artifact: plan
---

# Plan

1. Capture COS-1, COS-2, COS-2.a with `hi` into `hi/cos.md` (new family;
   intent + owner + issue hint), `hi check`; commit alone.
2. People keys `timezone` / `working_hours` (reader, validation, renderers,
   `samePerson`, re-read safety net).
3. `/admin people add` options `timezone` / `hours` (plan, handler, replies,
   list, slash registration).
4. `src/scheduler/briefing.ts`: recipients, hours / slot, facts (local +
   GitHub), composer, `cos_briefings` claim / state, ticker.
5. Export `chatCompletions`; `SchedulerServiceOpts.briefings`; bridge wiring
   and shutdown; `SCRUB_TARGETS`.
6. Tests: `tests/identity.briefing-hours.test.ts`,
   `tests/cos.briefing.test.ts` (fake LLM, clock, GitHub, DM); fail-on-base
   proof (swap the base's sources in, run, restore, run).
7. Docs: `docs/discord.md`, `docs/DISCORD-GO-LIVE.md`, `docs/DAEMON.md`,
   `README.md`, `allowlist.example.toml`, `STATUS.md` HI row.
8. Specs: `discord.spec.md` (files, Public API, invariant), `agent.spec.md`
   (Public API), module testing evidence, deltas (REQ-discord-102 and
   REQ-agent-102 added, REQ-discord-036 modified).
9. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
