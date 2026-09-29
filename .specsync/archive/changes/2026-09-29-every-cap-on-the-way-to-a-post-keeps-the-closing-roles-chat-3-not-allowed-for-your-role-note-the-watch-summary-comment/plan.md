---
change: every-cap-on-the-way-to-a-post-keeps-the-closing-roles-chat-3-not-allowed-for-your-role-note-the-watch-summary-comment
artifact: plan
---

# Plan

1. One regression test per surface (WATCH comment, schedule row + post,
   `/work`, `/session start`, SAFE-8 append) in the surface's existing test
   file; confirm each fails on `origin/main`.
2. `clipPostSummary` / `POST_SUMMARY_MAX` and note-keeping `appendPostLine` in
   `ask-ping.ts`; use them in the scheduler and slash handlers;
   `clipKeepingRoleNote` in `buildSummaryBody`.
3. Spec Public API / Invariants / testing; deltas Added REQ-discord-734 and
   REQ-watch-734; docs.
4. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`; draft PR (review/finalize later).
