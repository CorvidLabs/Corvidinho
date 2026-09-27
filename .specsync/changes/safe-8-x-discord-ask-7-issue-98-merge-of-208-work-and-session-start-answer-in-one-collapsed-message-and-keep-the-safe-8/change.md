---
id: safe-8-x-discord-ask-7-issue-98-merge-of-208-work-and-session-start-answer-in-one-collapsed-message-and-keep-the-safe-8
state: implementing
type: bug_fix
base_commit: f9dc47ff912aa4682d102d73aa8e62018717c63f
---

# SAFE-8 x DISCORD-ASK-7 (issue #98, merge of #208): /work and /session start answer in one collapsed message and keep the SAFE-8 owner notice a fresh channel post; an ask run never shows Done, and claims go back when nothing carried the notice

## Intent

SAFE-8 x DISCORD-ASK-7 (issue #98, merge of #208): /work and /session start answer in one collapsed message and keep the SAFE-8 owner notice a fresh channel post; an ask run never shows Done, and claims go back when nothing carried the notice

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- When the thinking message can be edited, /work and /session start answer in one message (DISCORD-ASK-7: the thinking message becomes the answer and the deferred reply is deleted) that carries the ask content: a clarify ask addresses the requester (allowed mentions limited to them), a stuck or spend-cap stop shows the ask, never ✅ Done, and /work records it blocked (stuck stays failed). The owner ping for a stuck or spend-cap ask (once per cap episode) and the pending SAFE-8 80% warning go out as a fresh channel post with allowed mentions limited to the owner; when that post cannot be sent the notice is appended to the answer that went out (the collapsed message edited again, or the fallback reply); without an edit the fallback status shows the ask status, not Done. When nothing carried the notice (answer and owner post both failed, e.g. an expired interaction token) the claimed warning and cap ping are handed back to the next bridge post and the answer's error is still raised. #208 slash tests pass unchanged; fixture tests only.

## No-spec Rationale

Not applicable
