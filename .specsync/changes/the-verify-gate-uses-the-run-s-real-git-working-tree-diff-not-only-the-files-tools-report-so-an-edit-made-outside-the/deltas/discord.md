---
module: discord
change: the-verify-gate-uses-the-run-s-real-git-working-tree-diff-not-only-the-files-tools-report-so-an-edit-made-outside-the
---

# Delta — discord (verify skip wording follows the real diff)

## Modified

### REQUIREMENT REQ-discord-085

Discord `createSpawnAgentClient` SHALL always hold chat/schedule runs to the
prove-before-done gate (AGENT-4 / FLEDGE-2 / issue #85 captured slice): spawn
argv MUST NOT include `--no-verify`. An empty real diff with no
tool-reported files continues to skip verify inside the agent loop (honest
`verifySkipped`); when tools report file changes or the run's git working
tree changed (REQ-agent-085), `fledge lanes run verify` runs before done. Draft AGENT-14/15 are out
of scope. Package version SHALL bump to **0.0.13**. Fixture tests without live
Discord.

Acceptance Criteria
- Discord spawn argv never includes `--no-verify`.
- Package `0.0.13`; docs/STATUS/CHANGELOG updated.
- A run that changed the git working tree without a tool reporting it is verified before done; a run with an empty real diff and no tool-reported files still skips verify (REQ-agent-085).
- Fixture tests + SpecSync + fledge verify green.
