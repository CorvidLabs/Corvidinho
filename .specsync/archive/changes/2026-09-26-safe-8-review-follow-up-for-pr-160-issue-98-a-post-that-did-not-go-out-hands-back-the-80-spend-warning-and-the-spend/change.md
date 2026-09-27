---
id: safe-8-review-follow-up-for-pr-160-issue-98-a-post-that-did-not-go-out-hands-back-the-80-spend-warning-and-the-spend
state: archived
type: bug_fix
base_commit: ab2b59186133982c009565f799ec0d32b121850a
---

# SAFE-8 review follow-up for PR #160 (issue #98): a post that did not go out hands back the 80% spend warning and the spend-cap owner ping on every bridge surface (a slash reply that fails, e.g. an expired interaction token, still posts the owner notice), a warning claimed while spend is back under 80% stays pending for the next post at 80% or more, and a spend-cap stop is never kept as the session pending ask

## Intent

SAFE-8 review follow-up for PR #160 (issue #98): a post that did not go out hands back the 80% spend warning and the spend-cap owner ping on every bridge surface (a slash reply that fails, e.g. an expired interaction token, still posts the owner notice), a warning claimed while spend is back under 80% stays pending for the next post at 80% or more, and a spend-cap stop is never kept as the session pending ask

## Affected Canonical Specs

- `agent`
- `discord`

## Acceptance Criteria

- A slash /work or /session start whose final reply fails (e.g. an expired interaction token) still posts the owner notice (spend-cap ping and pending 80% warning) as a fresh channel post and the reply error is still raised; when neither the notice post nor the reply went out, the claimed warning and the claimed cap-episode ping are handed back so the next bridge post carries them. A chat reply or schedule post that did not go out hands back both the warning and the cap ping, and a schedule keeps no ping key for a ping that was never posted. A warning claimed while 24 h spend is back under 80% of its cap stays pending (no delivery, no second warning row) and the first post that sees 80% or more delivers it once: 80% at T0, 72% later, 96% later delivers exactly one warning at 96%. A spend-cap stop is never stored as the session pending ask (a later ok runs the agent, a substantive reply carries no cap text into the prompt), and a spend-cap pending ask persisted by an earlier build loads as none; clarify and stuck pending asks are unchanged (AUTONOMY-5/6). Fixture tests only; each new test fails on the previous code.

## No-spec Rationale

Not applicable
