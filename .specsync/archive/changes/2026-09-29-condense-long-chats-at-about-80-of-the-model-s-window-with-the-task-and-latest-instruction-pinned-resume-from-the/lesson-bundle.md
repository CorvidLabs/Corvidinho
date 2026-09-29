# Lesson bundle — condense-long-chats-at-about-80-of-the-model-s-window-with-the-task-and-latest-instruction-pinned-resume-from-the

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Condense long chats at about 80% of the model's window with the task and latest instruction pinned, resume from the summary after the soft TTL, and keep each thread's summary 30 days (SESSION-5/6, SESSION-3.a, AGENT-6.a; #72)
- **Kind**: Feature
- **Specs**: discord, watch
- **Paths**: src/store/conversation.ts, src/store/db.ts, src/store/index.ts, src/store/scrub.ts, src/discord/session-store.ts, src/discord/session-thread.ts, src/discord/message-router.ts, src/discord/bridge.ts, src/watch/poller.ts, src/watch/session-store.ts, src/memory/forget.ts, src/discord/forget-card.ts, tests/session.condense.test.ts, tests/store.conversation.test.ts, tests/discord.session-resume.test.ts, tests/watch.conversation.test.ts, tests/discord.session-thread.unit.test.ts, tests/scheduler.ask-outbox.test.ts, tests/watch.session-store.durable.test.ts, tests/discord.forget-card.test.ts, docs/discord.md, docs/WATCH.md, docs/BOX-UPDATE.md, docs/DISCORD-GO-LIVE.md, .env.example, STATUS.md, specs/discord/discord.spec.md, specs/discord/testing.md, specs/watch/watch.spec.md, specs/watch/testing.md
- **Acceptance**: When a Discord session's prompt (replayed conversation plus the new message) reaches about 80% of the model's context window (CORVIDINHO_LLM_CONTEXT_TOKENS, default 8192 tokens, chars/4, never past the 32000-char transport ceiling) the oldest turns fold into a scrubbed summary stored with the session while the opening request and the newest human turn stay word for word; after a restart or with a smaller window the prompt picks up from that summary; after the soft TTL the user's reply to one of the session's answers, or their message in its thread, passes the channel, actor and mute gates and starts a new session seeded with the old session's summary and last turns instead of no answer; each Discord conversation and each WATCH issue or PR thread keeps its summary and last 20 turns scrubbed for 30 days after its last update in schema v13 conversation_threads and is then purged; WATCH follow-ups on the same issue or PR get that thread's conversation replayed; SessionStore.forgetConversations and forgetConversations(db, person) delete a person's conversations; tests/session.condense.test.ts, tests/store.conversation.test.ts, tests/discord.session-resume.test.ts and tests/watch.conversation.test.ts cover each and fail on the base sources

## Evidence

- Verification commit: `f4ad92829f7f35f99c91125c30db48f2ea5ab8a4`
- Base commit: `d589638c38f27503373601bb256ee6207fb822f9`
- Verified by: `specsync check --spec cli --spec discord --spec watch`

## From the change's context.md

# Context

Issue #72 (M2 "talk anywhere"): long chats. Leif confirmed the criteria in
the 2026-09-28 interview (Round 5 #72, Round 8 SESSION-3, Round 9
MEMORY-1 / AGENT-6 retention); the stacked hi-capture PR (branch
`claude/hi-capture-interview-2026-09-28`) captured them into `hi/`:

- **SESSION-5** "At about 80% of the model's window, older turns are
  condensed into a summary; the current task and its latest instructions
  stay pinned word for word."
- **SESSION-6** "The summary is saved with the session, so after a restart
  or on a different model it picks up from the summary instead of replaying
  the whole history."
- **SESSION-3.a** "A reply to it, or a message in its thread, after the
  session has expired starts a new session that begins from the old one's
  summary, instead of getting no answer."
- **AGENT-6.a** "A conversation's condensed summary and its recent turns are
  kept, scrubbed, for 30 days per thread, so a restart doesn't lose it
  (MEMORY-1); WATCH follow-ups pick up the issue or PR thread's summary;
  forgetting someone deletes theirs."

This change builds them; it does not capture them again (`grep` finds them
in `hi/session.md` / `hi/agent.md` on the base and `hi check` passes).

Gap on the base (d589638): a Discord session replays its turns in a fixed
6000-char block and drops the middle as `(N earlier turns omitted)` — no
summary, no window (REQ-discord-072 said "No model summarising"); turns die
with the session at the soft TTL, so a reply to an expired session's answer,
or a plain message in its thread, gets no answer; WATCH follow-ups carry only
the newest event (REQ-watch-037 kept "turn persistence/replay and stored
summaries" out of scope); nothing is kept per thread for 30 days and there is
no per-person delete.

Constraints: specs only through SpecSync; v1 off-chain (local SQLite only,
MEMORY-3); owner admins and the team works (no role change here); prefer
existing tables — none can outlive a session (`discord_session_turns` and
`discord_session_bot_messages` cascade with it; `memories` soft-deletes
every update and feeds the memory inject), so one new table by a
forward-only migration (schema v13, after main's v12 `forget_requests`) with a test; a new env var only where the
captured text needs it (the model's window). #232/#233 are landed
separately and not touched. The forget-me flow itself (#101, MEMORY-ACL-6)
is not built here: this change exposes the per-person delete it calls, and
since #101 landed on main (merged in 2026-09-29) an approved forget-me runs
it in its transaction and the running bridge drops live summaries too.
Condensed text keeps main's SAFE-12 rules (#71): replayed turns and summary
points are quoted as data and a fenced excerpt keeps its fence markers.

## From the change's design.md

# Design

- `src/store/conversation.ts` (new, shared by Discord and WATCH): the window
  (`resolveContextWindowTokens`: `CORVIDINHO_LLM_CONTEXT_TOKENS`, default
  8192, min 1024), the budget (`condenseBudgetChars` = floor(window × 0.8) × 4,
  capped at 32000), the pure fold (`condenseConversation`: oldest unpinned
  turn first while block + blank line + new message >= budget; pinned = the
  opening human turn and the newest human turn; each fold appends
  `summaryPoint` = `- <Label>: <first 160 chars>`; `appendSummary` caps the
  summary at a third of the budget by shortening older points to 80 chars,
  then leaving them out with a count line; when only pinned turns are left the
  summary shrinks), `boundConversation` (keep the opening human turn + last N,
  fold the rest), the block renderer (`formatConversationBlock`: header, the
  opening human turn, the summary label and points, the other turns, footer;
  no blank line; the old omitted-marker path as a ceiling safety net) and
  `ConversationStore` over `conversation_threads`.
- Schema v13 (after main's v12 `forget_requests`): `conversation_threads(id, surface, thread_key, user_id,
  session_id, project, summary, turns JSON, participants JSON,
  bot_message_ids JSON, updated_at)`, indexes (surface, thread_key, user_id), (session_id),
  (updated_at). `summary` + JSON `turns` in `SCRUB_TARGETS`.
- Discord `SessionStore`: `summaries` / `conversationIds` maps;
  `threadPrompt` condenses and, on a fold, rewrites the session's turn rows
  and saves the summary to the session's record (the live record carries the
  summary; live turns stay in `discord_session_turns`); `loadFromDb` loads a
  live session's summary and keeps the conversation of rows found expired;
  `purgeIfExpired` / `endSession` keep the conversation (summary, turns,
  answer ids from `byBotMessageId`) before removing; `recordTurn` clips by
  role and folds turns past 200 into the summary; `retainedForReply`,
  `retainedForThread`, `resumeFromRetained` (reads the record again, then a
  new session seeded with its summary and turns, in its project, record
  re-pointed to it; nothing when the record is gone), `forgetConversations`,
  `purgeExpiredConversations`. Every conversation DB step is best effort.
- Router: `resumeRetained` after the channel gate, on the thread path (no own
  live session) and the reply path (no live session for the referenced
  answer): own conversation only, same place only, actor + mute/rate gates,
  continue the live session already carrying the record, else
  `start_session` from `resumeFromRetained`.
- Bridge: `store.threadPrompt` replaces `withSessionThread` on chat and
  button-pick runs; the store gets `contextWindowTokens` from the env; an
  hourly unref'd purge timer, cleared on stop.
- WATCH poller: `ConversationStore` on the poller's DB; before each run the
  thread's record (`issue:<repo>#<n>`) is condensed and replayed under
  `WATCH_THREAD_HEADER`; after it the event prompt and the run's summary are
  saved (participants = senders); each cycle purges.
- Rejected: a model-written summary (a second model call per fold, spend, a
  provider dependency in the bridge — the captured text does not ask for one);
  keeping expired `discord_sessions` rows for 30 days (every lookup and
  `/session list` would have to skip them); storing summaries in `memories`
  (soft-deleted history per update, and the memory inject would replay them
  to every run); passing the prompt over stdin/a file to lift the 32000-char
  ceiling (a CLI surface change not asked for); a scheduler-tick purge (the
  daemon has no session store; reads/writes plus a bridge timer and the WATCH
  cycle purge instead).

## From the change's testing.md

# Testing

Fixture tests only: in-memory or temp SQLite DBs, `startBridge` with a null
gateway and a recording agent, `startWatchPoller` with fixture events and an
echo ack client; no live Discord, GitHub or model.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-472` | `tests/session.condense.test.ts` | Window: unset / invalid → 8192, `32768` / `200000` kept, `100` → 1024; budget `floor(w×0.8)×4`, 1,000,000 → 32000. Fold: nothing under the budget; reaching it folds; at half the prompt the oldest turns fold first (`A0` right after the task), each a point of its own words, the task, latest instruction and new message whole, result under budget, task line before the summary label; with a 10-char budget only the two pinned turns stay; an earlier summary is kept and bounded (`(N earlier points left out)`); the block is one `[Corvidinho` paragraph Planning skips. `SessionStore`: 1,000,000 tokens → every turn, no summary; 2048 → condensed under budget, task and latest whole, `REQ1` a point; summary stored scrubbed (`[redacted:github-token]`), turn rows = kept turns; reopen → same prompt, no folded turn; 1024 after 3072 → further condensed under its budget from the earlier summary; past 200 turns folded into the stored summary. SAFE-12: a fenced WATCH-style turn folded into a point keeps its words between the fence's own markers (a long body clipped inside them); a summary over its cap leaves a fenced point out whole; a replayed block quotes a fake footer and turn label, strips a bidi override from a point, and restores the end marker of a turn clipped inside its fence. |
| `REQ-discord-472` | `tests/store.conversation.test.ts` | v12 DB (table dropped, version 12, a session row and a pending forget request) → v13 with the 11 columns, rows kept, re-run idempotent; a v11 DB → v13 with `forget_requests` and `conversation_threads`; save scrubs summary and turns, keeps opening + last 20 (rest folded), newest 100 answer ids; lookups by id / session / thread + user / answer id; 30-day retention restarted by an update, purged after (row gone); `forgetConversations` deletes by Discord id, GitHub login (upper case given) and participant (3 of 5), nobody else's; `rescrubDatabase` rewrites summary and JSON turns; an idled-out and an ended session keep their conversation (a silent one keeps nothing), purge after 30 days; `SessionStore.forgetConversations` clears live turns (memory + DB) and summary, deletes the retained records, leaves another user's thread; an approved forget-me's `forgetMemoryTargets` deletes a declared person's records by Discord id, linked GitHub login and participation (2 of 3) with their memory, an undeclared asker's by Discord id only; `forgetTurnsOfUsers` drops the live summary and records and the next prompt replays nothing. |
| `REQ-discord-472` / `REQ-discord-019` | `tests/discord.session-resume.test.ts` | Through `startBridge`: after the TTL a reply to the answer → new session id, `resume: false`, `humanText` the new message, prompt holds request and answer in order; a second reply to the old answer continues that new session (`resume: true`); a plain thread message → new session from it; a resumed conversation carries its summary label and points; another user's reply (with or without mention) or thread message never gets it; muted and deny-listed users and a non-allowlisted channel get no run, unmuted the reply resumes; bridge restarted after the TTL on the same DB file → reply resumes; a reply to the FIRST answer after the resumed session idled out unnoticed → the new session starts from the resumed session's second request and answer, one record holding them; a session nothing looked up for 30 days after its last activity → no run, table empty; 30 days later → purged, no run, table empty; forgotten → no run; router + store: a talk on project `other` resumes in `other` (bind works there, record keeps it), and once `other` is gone the resumed session's bind fails instead of using the default project; `CORVIDINHO_LLM_CONTEXT_TOKENS=2048` in the bridge env → the block is under 80%, task and latest instruction whole, `step 2` only as a point. |
| `REQ-discord-072` | `tests/discord.session-thread.unit.test.ts`, `tests/discord.session-thread.test.ts` | Renderer past the 32000-char ceiling keeps the opening request, one exact omitted marker and the newest turns; an agent turn clipped at 1500, a 4000-char human turn whole, a human turn past 8000 clipped; every earlier AGENT-6 test unchanged and passing (a fresh @mention after the TTL still replays nothing). |
| `REQ-watch-472` / `REQ-watch-037` | `tests/watch.conversation.test.ts` | A follow-up on the same issue starts with `WATCH_THREAD_HEADER`, holds the earlier event and `You (Corvidinho): answer 1` before the new event, Planning skips it; the first event and another issue get none; 2 h later (past the session TTL) it still replays, 30 days later it is purged; with a 1024-token window the prompt stays under budget with the summary, opening and latest request whole; a 7000+-char opening event prompt replays whole (its fence header marked `(quoted)`, SAFE-12); stored turns scrubbed, participants `github:0xleif` / `github:someone`, forgetting `SOMEONE` deletes the thread. |

## Fail on the base sources

With `git checkout d589638 -- src/` (the stacked base's sources; the new
`src/store/conversation.ts` left in place so the files load) and this
branch's tests:

- `tests/session.condense.test.ts`: 6 pass, 5 fail — every `SessionStore`
  test fails; the 6 that pass test only the new module (without it the file
  does not load: 0 pass).
- `tests/store.conversation.test.ts`: 0 pass, 7 fail.
- `tests/discord.session-resume.test.ts`: 1 pass, 8 fail — the pass is the
  guard "another user's reply … never gets my conversation".
- `tests/watch.conversation.test.ts`: 0 pass, 4 fail.
- `tests/discord.session-thread.unit.test.ts`: does not load (no
  `SESSION_THREAD_HUMAN_TURN_MAX_CHARS`).

On the branch: 11/11, 7/7, 9/9, 4/4 and 13/13 pass.

Review follow-up (same change): four tests added for fixes found in
review, each run against the reviewed sources (c6132bc) first:

- `tests/discord.session-resume.test.ts` "a reply to an older answer after
  the resumed session idled out starts from its newest turns": fails there
  (the new session got only the first request and answer, and the record
  lost the second), passes here.
- `tests/discord.session-resume.test.ts` "a session noticed idle late counts
  its 30 days from its last activity": fails there (kept and resumed 30 days
  after the last activity), passes here.
- `tests/discord.session-resume.test.ts` "never silently the default
  project…": fails there (the resumed session worked in the default project),
  passes here.
- `tests/watch.conversation.test.ts` "a long opening issue comment replays
  whole": fails with a 6000-char human clip, passes with 8000.

## Where these lessons go

- `specs/discord/context.md`
- `specs/watch/context.md`
