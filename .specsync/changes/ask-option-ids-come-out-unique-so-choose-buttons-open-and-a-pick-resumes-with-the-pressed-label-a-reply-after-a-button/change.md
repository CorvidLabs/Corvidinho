---
id: ask-option-ids-come-out-unique-so-choose-buttons-open-and-a-pick-resumes-with-the-pressed-label-a-reply-after-a-button
state: implementing
type: bug_fix
base_commit: 0f2e2c2774635d1dcbdff599cba92dbecf8eebd9
---

# Ask option ids come out unique so Choose buttons open and a pick resumes with the pressed label; a reply after a button ask expired clears it instead of restating a dead Choose button (DISCORD-ASK-1/3/5)

## Intent

Ask option ids come out unique so Choose buttons open and a pick resumes with the pressed label; a reply after a button ask expired clears it instead of restating a dead Choose button (DISCORD-ASK-1/3/5)

## Affected Canonical Specs

- `agent`
- `discord`

## Acceptance Criteria

- normalizeAskOptions returns unique option ids: an explicit id, an id cut to 32 chars, or a position fallback that repeats an earlier option's id takes the first unused position number (1, 2, ...), and a dropped empty option holds no id; options whose ids are already unique (every stored ask, and every ask made before this change that had distinct ids) normalize byte-identically, so stored asks and open buttons keep working; an ask-human call whose options repeat one id opens a Choose ephemeral with distinct pick custom_ids, and pressing the second button resumes the requester's session with the second label; in onMessage a continue that is not a cancel, on a session whose pendingAsk is a button ask past its expiresAt, clears that ask with clearPendingAsk before the thin-ack gate, so a thin reply restates the newest open ask that has not expired or, with none, runs the agent (never a restated stub with a dead Choose button), a substantive reply runs the agent as before and leaves no expired pending ask, and cancel still clears every open ask with the short ack and no agent run; late presses on a gone ask (onComponent) are unchanged here; no new env var, config key, slash command, table, column or schema version

## No-spec Rationale

Not applicable
