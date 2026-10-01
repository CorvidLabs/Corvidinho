---
change: before-a-pr-opens-a-second-model-reviews-the-diff-in-bounded-rounds-and-the-pr-lists-what-it-raised-and-what-changed
artifact: requirements
---

# Requirements

- GITHUB-9 (captured on main, `hi/github.md`, Leif 2026-09-28 interview
  round 3): "Before the PR, a second model reviews the diff in bounded rounds,
  and the PR lists what it raised and what changed."
- GITHUB-9.a (captured in this change with `hi GITHUB-9.a`, Leif 2026-09-30
  interview round 13): "The reviewer is the first other model I've
  configured that didn't write the change; there's no reviewer setting, and
  with no second model there's no PR and the reply says why."
- Kept: GITHUB-2/5/6 (PR from a worktree, dangerous + allowlisted, repo
  gate), AUTONOMY-9/10/11 (must-ask gate still first), SAFE-6 / SAFE-12
  (scrub, untrusted fence), SAFE-8 / AUTONOMY-8 (spend cap asks; a review
  call never routes around it), AGENT-11 / AGENT-13 (configured models,
  fallbacks), AGENT-16/17 (review holds are not failures), DISCORD-15.a /
  SAFE-16 (owner footer prices the reviewer or shows unknown).
- Added: REQ-plugins-092 (the github-pr-create review gate,
  `src/work/review.ts`), REQ-agent-092 (the tool loop's review context,
  spend stop, AGENT-16 exemption, reply note).
- Modified: REQ-plugins-117 (`review` passed through `runPlugin`;
  `delegate` passes the lead's authors and returns the worker's models),
  REQ-agent-117 (`CORVIDINHO_DELEGATE_AUTHORS`, worker models from the result
  frame), REQ-discord-088 (the /work PR line `not-reviewed`).
- New table `pr_review_rounds` (created on first use, no schema version
  bump, in `SCRUB_TARGETS`). No new slash command, config key or
  operator-set env var; no protocol bump.
