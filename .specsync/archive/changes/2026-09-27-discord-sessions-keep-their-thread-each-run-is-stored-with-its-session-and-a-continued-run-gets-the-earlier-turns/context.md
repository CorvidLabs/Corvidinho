---
change: discord-sessions-keep-their-thread-each-run-is-stored-with-its-session-and-a-continued-run-gets-the-earlier-turns
artifact: context
---

# Context

AGENT-6 was the one captured AGENT id with no REQ and no code (STATUS.md:
"no turn persistence/replay (AGENT-6; durable sessions only live within the
soft TTL)"; discord.spec.md changelog: "turn persistence/replay and summaries
stay follow-ups"). Issue #72.

Gap on origin/main fc0ed8d: a continued Discord session keeps its session id
and passes `resume: true`, but the spawn client ignores `resume` and runs
`task run --task <prompt>` with only the newest message; `execute.ts` builds
`[system, user(task)]` only; there is no turn table. So every turn lost the
thread, even inside the TTL. A button pick sent only the question and the
label, dropping the original request. Repro (now
`tests/discord.session-thread.test.ts`): @mention "the codeword is PELICAN,
keep it for this task", then reply "what was the codeword?" — run #2 has the
same session id and `resume: true`, but its prompt is memory + identity +
"what was the codeword?", with no PELICAN and no first answer. On main 9 of
the 12 bridge tests fail (the 3 SESSION-3 / SESSION-MULTI-1 / SAFE-4 guards
pass) and the unit file cannot load (no `session-thread.ts`).

Constraints: HI-first; no invented criteria (the #72 condensation is draft
SESSION-5/6); no new slash command, env var, flag or config key; do not bump
the SQLite schema version (a module-owned table, like `spend_ledger`);
SAFE-6 scrub; SAFE-4 confirm tokens only from the current message; SAFE-8 /
REQ-discord-098 no cap text into a later prompt (the existing
`tests/discord.spend.test.ts` and `tests/discord.slash-pending-ask.test.ts`
guards caught the first cut, which replayed the cap answer).

Design choices pending Leif: "later" is bounded by the soft TTL (SESSION-2/3;
MEMORY carries anything longer, SESSION-4); the budget is a fixed constant,
not a knob.
