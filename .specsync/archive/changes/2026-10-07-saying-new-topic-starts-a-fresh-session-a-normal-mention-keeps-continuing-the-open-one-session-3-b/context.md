---
change: saying-new-topic-starts-a-fresh-session-a-normal-mention-keeps-continuing-the-open-one-session-3-b
artifact: context
---

# Context

Leif's 2026-09-28 interview record (`/home/user/coord/interview-2026-09-28.md`),
round 16 (2026-10-06), "SESSION-3 new topic: **explicit only** — /session
start or saying 'new topic' starts a fresh session; a normal @mention keeps
continuing the open one." SESSION-3 ("Idle expiry or a clear new topic starts
a new session.") and SESSION-3.a were on main; SESSION-3.b was not captured.
This PR captures it with `hi SESSION-3.b "…"` (its own commit, `hi check`
green) and then builds it.

What was missing on main (e1a24ed2): within the soft TTL every @mention,
reply or thread message continued its author's open session in that channel
or thread (`routeMessage` → `continue_session`); only `/session start`
started a separate one, and there was no way to say "new topic" in chat.

Constraints: smallest change in the Discord router / bridge / session store;
reuse the idle-expiry park (retain conversation, park worktree, close asks,
drop rows) and the AGENT-3.a per-session queue rather than a second lifecycle;
every existing gate (channel allowlist and deny lists, actor gate, mute and
rate limit, roles, SAFE-12/13) still runs first; no new env var, config key,
slash command, table or schema bump; buttons and `/session start` unchanged;
specs only through SpecSync; #232 / #233 untouched; v1 off-chain. Out: the
WATCH (GitHub) router — SESSION-3.b is a Discord @mention criterion.
