---
change: safe-8-review-fixes-for-pr-160-issue-98-deliver-the-80-spend-warning-from-every-surface-via-a-bridge-outbox-re-arm
artifact: docs
---

# Docs

- No canonical spec text in this change (no-spec-change): the spec prose,
  `files:` entries for the new modules and REQ-agent-098 / REQ-discord-098 /
  REQ-cli-098 are updated through the amended SAFE-8 change's deltas.
- Module doc comments in `spend-alerts.ts`, `spend-outbox.ts` and
  `spend-post.ts` explain recording vs delivery, re-arming and the
  once-per-episode ping.
- No CHANGELOG / STATUS / package version edits (release PRs own those).
