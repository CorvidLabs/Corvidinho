---
module: discord
change: saying-new-topic-starts-a-fresh-session-a-normal-mention-keeps-continuing-the-open-one-session-3-b
---

# Delta: discord (only 'new topic' or /session start starts a fresh session — SESSION-3.b)

## Added

### REQUIREMENT REQ-discord-479

Only `/session start` or my saying 'new topic' starts a fresh session; a
normal @mention keeps continuing the open one (SESSION-3.b, captured in
`hi/session.md` from Leif's 2026-09-28 interview, round 16). Within the soft
TTL every message that would continue its author's open session in a channel
or thread SHALL keep continuing it, except one whose text — after the bot
mention (`stripMentions`, the IDENTITY-5 trailer set aside) — begins with
`new topic`: any case, followed by the end (optionally `.` / `!`), whitespace,
or one `:` / `-` (`–` / `—`) / `,`, then the request (`newTopicRequest`,
`src/discord/new-topic.ts`). Only the phrase at the start counts: the phrase
later in the text, `new topics`, `new topic's` and every other wording SHALL
route as before; no heuristic and no model call decides it.

`routeMessage` SHALL return `new_topic` (`RouteAction`: `session` — the
author's fresh session there, created at routing time; `open?` — the session
the message would have continued; `prompt` — the request) only after the
same gates the path already runs (channel allowlist and deny lists,
REQ-discord-212; actor gate, REQ-discord-201; mute / rate limit,
REQ-discord-010), on each path where the author's session would continue or
an @mention would start one: their own thread session, a reply to one of
their session's answers, the SESSION-3.a retained paths (a live session
carrying the record is `open`; the record is not replayed) and the @mention
lookup. It SHALL mark `open` superseded (`SessionStore.supersede`), so the
author's next message there finds the fresh session (`getByUserChannel`
passes a superseded session over) while `open`'s run and replies to its
answers are unchanged. Another user's session is never touched.

The bridge SHALL take the fresh session's turn, then `open`'s turn: a `new
topic` sent while a run of `open` is going waits for it like any message
(AGENT-3.a, REQ-discord-301; in flight from when it starts waiting,
REQ-discord-311), and a message sent after it waits behind it on the fresh
session; while it waits, a `stop` / `cancel` the author says in the fresh
session SHALL reach the open session's run (REQ-discord-302). While it waits
the fresh session SHALL count as busy (`SessionStore.runActive`), so an open
run that outlasts the soft TTL never purges it, or the messages waiting
behind it, as idle. After a wait it SHALL go on only while the fresh session
is still live and its author still passes the channel, actor and mute gates
(`waitedMessageStillAllowed`) and was not forgotten; otherwise nothing is
parked, run or posted. It SHALL then park `open` the way idle expiry does
(`SessionStore.endForNewTopic`, sharing `purgeIfExpired`'s steps: the
conversation kept 30 days, REQ-discord-472, so a reply to one of its answers
still resumes it; the worktree parked, SESSION-WORKTREE-3; open asks closed,
DISCORD-ASK-5; maps and row dropped) — unless a message of `open`'s own (a
reply to one of its answers, a pick) came in while it waited and waits behind
it (`SessionRunControl.waitingBehind`): that message SHALL then run in
`open` as before, and `open`, no longer anyone's @mention target, is left to
idle out — and run the request as the fresh session's first message
(`resume: false`, nothing replayed, the bridge's default project), with the
roles, SAFE-12 / 13, memory, identity and Stop button of any chat run; a
SAFE-13 refusal drops the fresh session. With nothing after the phrase it SHALL post only
`NEW_TOPIC_ACK` (`New topic — your next message starts it fresh.`, fixed
text, no mentions), tracked to the fresh session, and run nothing; the
author's next message there (a reply to it, a thread message, an @mention)
goes to the fresh session. Buttons and `/session start` are unchanged. No new
env var, config key, slash command, table or schema change.

Acceptance Criteria
- `newTopicRequest`: `new topic: X`, `New Topic - X`, `NEW TOPIC, X`, `new topic X`, `new topic:X`, `new topic — X` give `X` (the mention trailer kept); `new topic`, `new topic.`, `new topic!`, `new topic:` give `""`; `tell me about the new topic`, `a new topic: X`, `new topics …`, `new topic's …`, `renew topic`, `newtopic: X` give null.
- `routeMessage`: a plain @mention and `tell me about the new topic` continue the open session; `new topic: …` gives `new_topic` with that session as `open`, a new `session` and the request, and the author's next @mention finds the fresh session; with nothing open it gives `new_topic` without `open` and leaves another user's session alone; a thread message and a reply to an answer count; a plain channel message without a mention is still ignored.
- Through the bridge: `new topic: …` runs in a new session id (`resume: false`, `humanText` the request, nothing of the open session replayed) and the open session is gone; a plain @mention, and the phrase mid-text, then continue the fresh session; a reply to one of the old session's answers resumes the old conversation (SESSION-3.a).
- In a thread without a mention, and as a reply to an answer, `new topic …` starts fresh there; the next message continues the fresh session.
- `new topic.` alone posts only `NEW_TOPIC_ACK`, runs nothing and parks the open session; a reply to the ack and the next @mention run in the fresh session with nothing replayed.
- While a run of the open session is going, `new topic: …` starts no run and parks nothing; after the run it runs in a new session, and a message sent after it waits behind it and continues the fresh session.
- A `stop` said while `new topic: …` waits stops the open session's run (`⏹ Stopping the run.`); the request then runs in a new session.
- A `new topic: …` that waits longer than the soft TTL (idle lookups run meanwhile) still runs in a live fresh session, and a message sent after it continues that session instead of being dropped.
- A reply to one of the open session's answers sent while `new topic: …` waits runs in the open session with its turns replayed; the request runs in a new session, and the next @mention goes to the fresh one.
- A muted, deny-listed or off-allowlist `new topic` runs nothing and leaves the open session open; muted while it waits, nothing is parked, run or posted.
- With the base's sources these tests fail; they pass on the branch.

## Modified

### REQUIREMENT REQ-discord-019

Discord `SessionStore` (and `WorkStore`) SHALL optionally persist to a local
SQLite database under the shared Corvidinho data directory
(`~/.local/share/corvidinho/` by default, overridable via `CORVIDINHO_DATA_DIR`)
so session and work stubs survive process restarts (SESSION durable substrate).
Cross-session continuity SHALL use the same shared SQLite file via MEMORY
tables (REQ-discord-021), not a long-lived ProcessManager.

Soft TTL SHALL default to about **45 minutes** (within SESSION-2's 30–60 minute
band), overridable via `CORVIDINHO_SESSION_TTL_MS` clamped to that band.
Continued activity (`touch` / continue paths) SHALL refresh `lastActivityAt`
(SESSION-2). Lookups for sessions idle past the TTL SHALL treat them as expired
and SHALL NOT continue them, so the next eligible mention starts a fresh
session (SESSION-1 / SESSION-3). The expired session's conversation is kept
apart for 30 days (REQ-discord-472): its user's reply to one of its answers,
or their message in its thread, starts a new session that begins from it
(SESSION-3.a); a new @mention elsewhere in the channel still starts with
nothing replayed.

The bridge SHALL open the shared DB when starting (unless tests inject
in-memory stores). Schedules and memories MAY share the same SQLite file
(REQ-discord-020 / REQ-discord-021). Fixture tests SHALL cover persist/reload
and TTL expiry without a live Discord token.

Acceptance Criteria
- Session create + bot-message/thread maps reload from SQLite after reopen.
- Work task stubs reload from the same DB after reopen.
- Default TTL ~45m; env override clamped to 30–60m.
- Idle past TTL → getByThread/getByBotMessage/get/list omit or purge; continue path does not resume.
- A reply to an expired session's answer by its user starts a new session (new id, `resume: false`) from its retained conversation (REQ-discord-472); a new @mention in the channel starts one with nothing replayed.
- Activity within TTL keeps continue_session.
- Within the TTL a message beginning with `new topic` parks the open session as the TTL purge does and starts a fresh one (new id, `resume: false`, nothing replayed); every other message keeps continue_session (SESSION-3.b / REQ-discord-479).
- Data dir defaults to `~/.local/share/corvidinho/`; `CORVIDINHO_DATA_DIR` overrides.
- Memories share `corvidinho.db` (schema v3) without a second database.
- No ProcessManager; secrets out of repo; existing allowlists unchanged.
- Fixture tests pass without live Discord token.

Session durable store SHALL additionally persist optional worktree fields
(`project`, `worktree_path`, `worktree_branch`, `worktree_state`) on schema **v4**
without breaking soft TTL behavior (SESSION-WORKTREE / REQ-discord-022). Soft TTL
purge SHALL park or remove the session worktree before dropping the row
(SESSION-WORKTREE-3).

Acceptance Criteria (worktree addendum)
- Schema v4 migration adds worktree columns; reload restores worktree binding.
- Soft TTL purge parks/removes worktree then drops session row.
- Prior TTL fixtures still green.
