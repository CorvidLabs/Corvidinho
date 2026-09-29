---
change: condense-long-chats-at-about-80-of-the-model-s-window-with-the-task-and-latest-instruction-pinned-resume-from-the
artifact: testing
---

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
