---
change: the-verify-gate-uses-the-run-s-real-git-working-tree-diff-not-only-the-files-tools-report-so-an-edit-made-outside-the
artifact: docs
---

# Docs

- `specs/agent/agent.spec.md`: `src/agent/workspace-diff.ts` in `files:`,
  Public API paragraph (`startWorkspaceDiff`, caps, the test seam), an
  Invariants paragraph, and four Error Cases rows.
- `specs/agent/testing.md`: "Real-diff verify gate (REQ-agent-085)".
- Deltas: agent (Added REQ-agent-085; Modified REQ-agent-002, REQ-agent-008),
  discord (Modified REQ-discord-085), watch (Modified REQ-watch-006,
  REQ-watch-085): "empty filesChanged skips verify" becomes "an empty real
  diff with no tool-reported files skips verify".
- `docs/discord.md` live-source paragraph and the header comments of
  `src/discord/agent-client.ts` / `src/watch/agent-client.ts` say the same.
- No README, CHANGELOG, STATUS or package version change; no operator doc
  change (no flag or env var).
