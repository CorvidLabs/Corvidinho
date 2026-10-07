---
change: saying-new-topic-starts-a-fresh-session-a-normal-mention-keeps-continuing-the-open-one-session-3-b
artifact: requirements
---

# Requirements

- SESSION-3 (captured, `hi/session.md`): "Idle expiry or a clear new topic
  starts a new session."
- SESSION-3.b (captured in this PR with `hi` from Leif's 2026-09-28
  interview, round 16): "Only /session start or my saying 'new topic' starts a
  fresh session; a normal @mention keeps continuing the open one." Built here.
- Design decisions from the interview (round 16, not new criteria): explicit
  only — the phrase 'new topic' at the start of the message (after the bot
  mention; case-insensitive; optional `:` / `-` / `,` then the request),
  in a mention or a reply / thread message where a session would continue;
  it parks the open session the way idle expiry does and starts a fresh
  session with the remainder as its first message; nothing after it ⇒ a
  short fixed ack and the fresh session takes the next message; every
  existing gate respected; a 'new topic' while a run is going waits like any
  message (AGENT-3.a); only the phrase at the start counts — no heuristics,
  no model check; buttons and `/session start` unchanged.
- Kept: AGENT-3.a / AGENT-3.b (REQ-discord-301 / 302 / 303), SESSION-3.a /
  AGENT-6.a (REQ-discord-472: the parked conversation stays kept 30 days and a
  reply to one of its answers still resumes it), SESSION-MULTI-1 (only the
  author's own session), SESSION-WORKTREE-3 (the parked worktree),
  DISCORD-ASK-5 (its open asks become late presses), REQ-discord-201 / 010 /
  212 gates, IDENTITY-8..12 roles and SAFE-12/13 on the fresh run.
- Added: REQ-discord-479. Modified: REQ-discord-019 ("Activity within TTL
  keeps continue_session" now names the 'new topic' exception).
