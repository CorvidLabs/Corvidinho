---
id: discord-keeps-an-open-choose-button-ask-when-a-later-chat-run-asks-again-pending-asks-are-keyed-by-askid-not-one-per
state: archived
type: bug_fix
base_commit: 1c7b6ced470e0ed87e4c854f2663111713af3fa7
---

# Discord keeps an open Choose button ask when a later chat run asks again: pending asks are keyed by askId, not one per session (SESSION-MULTI-3)

## Intent

Discord keeps an open Choose button ask when a later chat run asks again: pending asks are keyed by askId, not one per session (SESSION-MULTI-3)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- While a user's Choose button ask is open, a later chat message whose run asks again (buttons or free text) stores the new ask as the session's pendingAsk without replacing the earlier button ask: the earlier Choose/pick buttons still open the ephemeral choices and resume the session with that ask's question and label until pressed or expired (SESSION-MULTI-3 / DISCORD-ASK-3/5); a press is matched by askId across every open ask of the session; a pick, a late press (ASK_CHOICE_EXPIRED) or a free-text answer clears only that ask and the newest remaining open ask becomes pendingAsk (thin reply restates it); an explicit cancel still clears the session's open asks; an earlier free-text ask is still replaced by a new ask; open asks persist in discord_sessions.pending_ask (one object as today when one ask is open, a JSON array when several are) and survive a store reopen; no schema version bump, no new flags, env vars, config keys or slash commands; regression tests fail on main and pass on the branch

## No-spec Rationale

Not applicable
