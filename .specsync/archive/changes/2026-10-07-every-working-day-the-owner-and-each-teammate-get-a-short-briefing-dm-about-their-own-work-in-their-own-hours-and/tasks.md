---
change: every-working-day-the-owner-and-each-teammate-get-a-short-briefing-dm-about-their-own-work-in-their-own-hours-and
artifact: tasks
---

# Tasks

- [x] Capture COS-1, COS-2, COS-2.a with `hi` into the new `hi/cos.md` (intent, owner, issue hint); `hi check` passes; committed alone.
- [x] `timezone` / `working_hours` on declared people: read (TOML + JSON), canonical spelling, bad value skips the entry whole; never matched.
- [x] `/admin people add` `timezone:` / `hours:` options: plan validation and refusal, TOML / JSON writer and safety net, replies, `/admin people list`, slash registration; audited as before.
- [x] `src/scheduler/briefing.ts`: recipients (owner + team; deny / mute / clash / no owner excluded), hours and working-day slot, `cos_briefings` claim and states, that person's local and GitHub facts, skip when empty, read-tier composer under the spend guard, scrubbed DM text, DM retry and expiry, spend-stop hand-off, ticker.
- [x] `chatCompletions` / `Completion` exported; `SchedulerServiceOpts.briefings` on every tick; bridge wiring (dry run off unless seams), shutdown; `cos_briefings.text` in `SCRUB_TARGETS`.
- [x] `tests/identity.briefing-hours.test.ts` (7) and `tests/cos.briefing.test.ts` (17); fail-on-base proof recorded in testing.md.
- [x] Docs (`docs/discord.md`, `docs/DISCORD-GO-LIVE.md`, `docs/DAEMON.md`, `README.md`, `allowlist.example.toml`, `STATUS.md`).
- [x] Spec prose (`discord.spec.md`, `agent.spec.md`), module testing evidence, deltas (REQ-discord-102, REQ-agent-102 added; REQ-discord-036 modified).
- [x] `specsync change approve`, `change check --commit`, `change audit`, `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
