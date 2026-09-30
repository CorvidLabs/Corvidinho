---
change: verification-can-t-be-skipped-and-the-real-diff-since-the-talk-started-decides-what-changed-agent-14-agent-15-agent-15
artifact: requirements
---

# Requirements

- AGENT-14 (captured, `hi/agent.md`): "Verification can't be skipped, and
  chat, WATCH, scheduled and work runs share one gate."
- AGENT-15 (captured): "The real git diff decides what changed, and
  'verified' requires that tests ran and none were deleted." This change
  builds the first half; tests-ran / none-deleted is verify-gate-2.
- AGENT-15.a (captured in this PR with `hi`, Leif 2026-09-29 round 12):
  "After a restart or retry, 'verified' still covers every edit made since
  the talk started, including ones an earlier attempt left."
- Kept: AGENT-4 / AGENT-4.a, FLEDGE-2/3, REQ-agent-502 (non-git and
  unreadable-snapshot fail-closed rule), REQ-agent-242 (union across
  attempts), REQ-cli-143 / REQ-cli-186 (task text and plugin args are never
  flags).
- Added: REQ-agent-015 (carried baseline in a talk worktree).
- Modified: REQ-agent-002, REQ-agent-003 (no skip; nothing changed means
  nothing to verify), REQ-agent-085 (the real diff alone fills
  `filesChanged`; ghost claims still run the lane; always snapshot),
  REQ-agent-242, REQ-agent-502; REQ-cli-006, REQ-cli-007, REQ-cli-009,
  REQ-cli-085 (`--no-verify` refused, doctor warning), REQ-cli-073,
  REQ-cli-143, REQ-cli-505; REQ-discord-001, REQ-discord-014,
  REQ-discord-073, REQ-discord-085 (marker on a new talk worktree, shared
  `resolveBase`); REQ-watch-006, REQ-watch-073, REQ-watch-085.
- No new env var, config key, flag, slash command, table, schema version or
  NDJSON field. Removed surface: the `--no-verify` flag (now refused) and the
  `verify_before_complete` key (now ignored, with a doctor `[warn]`).
