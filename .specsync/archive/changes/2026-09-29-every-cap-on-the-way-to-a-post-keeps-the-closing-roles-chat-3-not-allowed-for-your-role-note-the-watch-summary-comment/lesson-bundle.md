# Lesson bundle — every-cap-on-the-way-to-a-post-keeps-the-closing-roles-chat-3-not-allowed-for-your-role-note-the-watch-summary-comment

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Every cap on the way to a post keeps the closing ROLES-CHAT-3 (not allowed for your role) note: the WATCH summary comment, scheduled-run posts and run rows, /work and /session start answers, and the SAFE-8 80% warning append
- **Kind**: BugFix
- **Specs**: discord, watch
- **Paths**: src/discord/ask-ping.ts, src/discord/command-handlers/work.ts, src/discord/command-handlers/session.ts, src/scheduler/service.ts, src/watch/summary.ts, tests/discord.slash-ask7.test.ts, tests/discord.spend.test.ts, tests/scheduler.service.test.ts, tests/watch.summary-scrub.test.ts, specs/discord/discord.spec.md, specs/discord/testing.md, specs/watch/watch.spec.md, specs/watch/testing.md, docs/DISCORD-GO-LIVE.md, docs/WATCH.md, docs/discord.md
- **Acceptance**: A summary that ends with the ROLES-CHAT-3 note (not allowed for your role) keeps it through every later cap on its way to a post: the WATCH summary comment's 1200-char clip (after the SAFE-6 scrub), the scheduled run's 1500-char run-row summary and its channel post, the /work and /session start answers (summary at most 1500 chars and no more than fits after the answer's head within 1900, so the gateway cut never reaches it), and the SAFE-8 80% warning append (appendPostLine); the body loses its end, never the note; a summary without the note is capped exactly as before; one regression test per surface fails on main and passes on the branch; no env var, config key, flag, slash command, table or schema change

## Evidence

- Verification commit: `3661ed23756da6d110c0f4f6fbe9c475f3d2c969`
- Base commit: `0f2e2c2774635d1dcbdff599cba92dbecf8eebd9`
- Verified by: `specsync check --spec discord --spec watch`

## From the change's context.md

# Context

W12 bug sweep, four overlapping records (`watch-summary-drops-role-note`,
`scheduler-summary-cut-drops-role-note`, `slash-summary-cut-drops-role-note`,
`role-note-cut-by-1500-slice`). Leif's 2026-09-28 interview settled the
design: use `clipKeepingRoleNote` at each cap, one test per surface, kind
bug-fix. No new hi criteria.

ROLES-CHAT-3 says a refused tool call is silent to the channel except a short
in-session "not allowed for your role" in the agent summary. REQ-agent-333
makes a run's summary end with `\n\n(not allowed for your role)` and keeps it
through the result-frame (4000) and chat-body (1800) caps. Later caps dropped
it with plain head cuts:

- `src/watch/summary.ts` `buildSummaryBody`: `scrubSecrets(...).trim().slice(0, 1200)`
  (WATCH runs are non-ADMIN, so the note happens there).
- `src/scheduler/service.ts`: `result.summary.slice(0, 1500)` for the run row
  and again in the schedule post (scheduled runs are always `actingIsAdmin: false`).
- `src/discord/command-handlers/work.ts` / `session.ts`:
  `result.summary.slice(0, 1500)`; `/work` also puts up to ~500 chars of head
  before it, so the gateway's 1900 cut could land on the note too.
- `src/discord/ask-ping.ts` `appendPostLine`: cuts the body's tail so the
  SAFE-8 80% warning line fits in 1900 (chat path via `withSpendWarningPost`,
  schedule posts, slash owner notice riding the answer).

Reproduced on `origin/main` 0f2e2c2 with the five new tests (all fail).

Ruled out / left alone: the bridge's `result.summary.slice(0, 1800)` (the
summary is already at most 1800 from `chatBodyFromTaskResult`, a no-op); the
stuck-ask context clip in `formatAskReply` (`ASK_REPLY_CONTEXT_MAX`, 400) and
the `/work` task-store summary (`slice(0, 500)`, never posted) — not among the
surfaces the interview named; #232/#233 scope untouched.

## From the change's design.md

# Design

- Reuse `clipKeepingRoleNote(text, max, clip)` from `src/agent/task-summary.ts`
  (REQ-agent-333) at every cap; no parallel helper for the note itself.
- `src/discord/ask-ping.ts` (already imported by the scheduler and both slash
  handlers, and home of `ASK_REPLY_MAX` 1900):
  - `POST_SUMMARY_MAX = 1500` and `clipPostSummary(summary, headLength = 0)`
    = `clipKeepingRoleNote(summary, max(0, min(1500, 1900 - headLength)), plain head cut)`.
  - `appendPostLine` clips `content` to `room` with `clipKeepingRoleNote` and
    the old `…` cut (guarded so a zero budget yields "" rather than
    `slice(0, -1)`); without the note the output is byte-identical.
- Scheduler: `summary = clipPostSummary(result.summary)` (run row + ask
  context unchanged in shape); post `head + clipPostSummary(summary, head.length)`.
- `/work`: `summary = clipPostSummary(result.summary)` is still what the
  session thread records; the answer is `head + clipPostSummary(summary,
  head.length)` (asks keep `ask.content` as before). `/session start` the same.
- WATCH: `clipKeepingRoleNote(scrubSecrets(summary).trim(), 1200, head cut)` —
  scrub stays before the clip (REQ-watch-231).
- Trade-off: without the note every cut lands where it did before (a plain
  head cut at the same length; the `/work` fit equals what the gateway's
  1900 slice kept), so only summaries ending with the note change.
- No env var, config key, flag, slash command, table or schema change.

## From the change's testing.md

# Testing

One regression test per surface, each in the surface's existing test file;
no live Discord, GitHub or network. The inputs are the real
`chatBodyFromTaskResult` output of a summary ending with the note (1800 chars
for the Discord surfaces, 1529 for WATCH).

- Before the fix (`origin/main` 0f2e2c2's `src/discord/ask-ping.ts`,
  `src/discord/command-handlers/work.ts`, `session.ts`,
  `src/scheduler/service.ts` and `src/watch/summary.ts` swapped in): the five
  new tests fail, the other 50 tests in those four files pass.
- After the fix: all pass; `bunx tsc --noEmit` clean; full `bun test` and
  `fledge lanes run verify --non-interactive` green.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-734` | `tests/scheduler.service.test.ts` › "a long summary ending with the note keeps it in the run row and the post; one without is cut as before" | Run row summary is 1500 chars ending with the note; the post under a 448-char schedule name is ≤ 1900 and ends with the note; a plain 1800-char summary is stored and posted as its first 1500 chars. |
| `REQ-discord-734` | `tests/discord.slash-ask7.test.ts` › "/work answer for a non-owner keeps the closing role note within the 1900 cap" | Non-owner `/work` (owner-only PR line, 207-char description): collapsed answer ≤ 1900, summary part < 1500 (fitted after the head), ends with the note. |
| `REQ-discord-734` | `tests/discord.slash-ask7.test.ts` › "/session start answer for a non-owner keeps the closing role note within the 1900 cap" | Answer ≤ 1900, summary part ≤ 1500, ends with the note. |
| `REQ-discord-734` | `tests/discord.spend.test.ts` › "the cut for the warning line keeps a closing role note" | `withSpendWarningPost` on an 1800-char body with the note: 1900 chars ending `y…`, the note, blank line, owner-pinging 80% line; a fitting body is untouched; the no-note cut test still ends `…\n\nLINE`. |
| `REQ-watch-734` | `tests/watch.summary-scrub.test.ts` › "a long summary is clipped before its note, after the scrub; one without a note is clipped as before" | 1200-char preview ending with the note before the `---` footer; a token where the note makes room leaves no `ghp_`; a plain 1500-char summary keeps its first 1200 chars. |

## Where these lessons go

- `specs/discord/context.md`
- `specs/watch/context.md`
