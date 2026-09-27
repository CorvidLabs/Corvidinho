---
change: schedule-auto-pause-and-pre-run-failures-record-a-stuck-ask-on-the-run-row-so-the-owner-is-pinged-once-through-the
artifact: testing
---

# Testing

Fixture tests only: in-memory SQLite, injected agents, temp dirs and a temp
git repo for the pre-run failures; no live Discord, no network, no token.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-353` (auto-pause) | `tests/scheduler.ask-outbox.test.ts` | Daemon + bridge on one DB: 4 daemon failures record no ask and post nothing; the 5th pauses the schedule, stores `ask_reason` `stuck` with `autoPauseAsk().question` and `ask_posted_at` null, `onRunFinished` `{ autoPaused: true, askReason: "stuck" }`; the bridge's next tick posts it once (prefix, stuck headline, `<@owner>`, pause line, `failed (exit 1)` context, `mentionUserIds` [owner]); two more ticks post nothing. A STUCK 5th run posts one ask: pause line + `Last failure: <question>`. Bridge-claimed: 4 silent `❌` posts, then the pause ask with the owner ping and the `failed (exit 1)` context, never the run's output `boom` (no `❌`), ping key recorded, not posted again. Bridge-claimed pause ask whose post resolves `false`, and again one whose post throws: nothing posted, `ask_posted_at` null, no ping key; the next tick posts it once with the ping. A bridge run that throws on the 5th failure: the pause ask posts at once with the ping and without the spawn error's host path. 5 creator-refused runs: 0 agent calls, 0 posts, pause ask pending; once the creator is listed the next tick posts it with the ping. |
| `REQ-discord-353` (pre-run failures) | `tests/scheduler.ask-outbox.test.ts` | Daemon run with a missing project (worktrees on, temp root): 0 agent calls, row error `project resolve failed: project path not found: missing-proj …` (with the temp root), ask `PROJECT_RESOLVE_FAILED_QUESTION`; the bridge posts it with the owner ping and without the temp root; a second identical failure posts without a ping. Bridge run on a temp git repo with a `talk` branch (blocks `talk/<run>`): 0 agent calls, row error `worktree failed: Failed to create worktree: …`, ask `WORKTREE_FAILED_QUESTION` posted at once with the owner ping, without the temp root, once. A worktree step that throws (`WORKTREE_BASE_DIR` under a regular file, ENOTDIR): same row error prefix, same ask and post. |
| `REQ-discord-353` (SQL count) | `tests/scheduler.service.test.ts` | A store handle whose cached count is stale: at SQL count 4 the run keeps its own ask; at 5 it stores the pause ask (row and cached run); a success stores no ask and resets the count to 0. |
| `REQ-discord-347`, `REQ-discord-020`, `REQ-discord-108`, `REQ-cli-098` | `tests/scheduler.ask-outbox.test.ts`, `tests/scheduler.actor-gate.test.ts`, `tests/scheduler.claim.test.ts`, `tests/discord.ask-ping.test.ts`, `tests/discord.spend.test.ts` | The existing outbox, gate, claim, ask-ping and spend suites pass unchanged. |

Fail-on-main proof: with main's `src/scheduler/service.ts` (plus only the
three new text exports appended) and main's `src/scheduler/store.ts`, all 10
new tests fail and the 20 existing tests in the two files pass; with the
branch sources all 30 pass. The review's 3 added tests and the added
context assertions also fail on the first draft of this change (a pause
ask claimed and never handed back, a thrown pause run posted only on the
next tick, a throwing worktree step recorded with no ask, the raw run
output as context).

Full suite: `bun test` green; `bunx tsc --noEmit` clean;
`specsync check --require-coverage 100` 100%; `fledge lanes run verify
--non-interactive` completed.
