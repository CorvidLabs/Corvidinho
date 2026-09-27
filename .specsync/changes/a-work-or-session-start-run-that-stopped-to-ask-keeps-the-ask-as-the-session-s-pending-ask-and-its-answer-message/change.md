---
id: a-work-or-session-start-run-that-stopped-to-ask-keeps-the-ask-as-the-session-s-pending-ask-and-its-answer-message
state: implementing
type: bug_fix
base_commit: dc65cf70d4a46d59c35f80acd91822df3eddf3f1
---

# A /work or /session start run that stopped to ask keeps the ask as the session's pending ask and its answer message continues the session, so a thin reply restates the question, cancel clears it and a substantive reply resumes with the question as context (AUTONOMY-1/5/6, REQ-discord-044); a spend-cap stop is never pending

## Intent

A /work or /session start run that stopped to ask keeps the ask as the session's pending ask and its answer message continues the session, so a thin reply restates the question, cancel clears it and a substantive reply resumes with the question as context (AUTONOMY-1/5/6, REQ-discord-044); a spend-cap stop is never pending

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- A /work or /session start run whose agent stopped with a clarify or stuck ask stores that ask as the session's pending ask (free text, like the answer shows it) and /work records the task blocked, not completed (stuck stays failed). The slash answer message (the thinking message edited into the answer) is tracked so a plain reply to it continues the session. A thin reply (ok, k, ...) to it restates the question and does not run the agent; cancel clears the pending ask with the short ack and does not run the agent; a substantive reply resumes the same session with the prior question as context and clears the pending ask. A SAFE-8 spend-cap stop is never stored as pending: a later ok runs the agent with no cap text. A finished run stores no pending ask and its answer still continues the session. Without an editable thinking message the pending ask is still stored, so an @mention ok restates it. Fixture tests only; no new slash command, env var or schema change.

## No-spec Rationale

Not applicable
