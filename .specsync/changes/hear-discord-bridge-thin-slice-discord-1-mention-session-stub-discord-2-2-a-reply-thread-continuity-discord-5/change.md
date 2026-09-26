---
id: hear-discord-bridge-thin-slice-discord-1-mention-session-stub-discord-2-2-a-reply-thread-continuity-discord-5
state: implementing
type: feature
base_commit: 8609cc16f73198c35f4a17c4d8a775900561ff77
---

# HEAR Discord bridge thin slice: DISCORD-1 mention→session stub, DISCORD-2/2.a reply/thread continuity, DISCORD-5 allowlisted channels only; gateway→message-router→session stub; no ProcessManager; token clean-exit; discord-post dangerous; spawn --no-verify

## Intent

HEAR Discord bridge thin slice: DISCORD-1 mention→session stub, DISCORD-2/2.a reply/thread continuity, DISCORD-5 allowlisted channels only; gateway→message-router→session stub; no ProcessManager; token clean-exit; discord-post dangerous; spawn --no-verify

## Affected Canonical Specs

- `discord`
- `cli`
- `plugins`

## Acceptance Criteria

- In allowlisted channel, @mention starts session stub (DISCORD-1); reply/thread continues same session id (DISCORD-2/2.a); non-allowlisted channel refused quietly/short not-authorized (DISCORD-5); missing token → clean doctor-style exit (no crash); empty channel allowlist → fail start; discord-post-message marked dangerous; chat spawn uses --no-verify; fixture/unit tests green without live token; STATUS/README go-live checklist (token + non-empty Discord allowlists); SpecSync + fledge verify green

## No-spec Rationale

Not applicable
