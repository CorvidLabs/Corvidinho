---
change: in-a-specsync-repo-it-opens-and-works-a-specsync-change-for-its-edits-and-on-corvidinho-it-approves-and-archives-its
artifact: docs
---

# Docs

- `docs/discord.md`: the live-source paragraph says an uncovered SpecSync
  path fails the verify before the lane (REQ-agent-518) and that on
  Corvidinho the run approves and archives its own change and runs the lane
  again, elsewhere it says a human does (REQ-agent-519); the /work gate
  table gets the SpecSync coverage row (REQ-discord-518).
- `docs/DISCORD-GO-LIVE.md`: a row for `specsync-change-approve` /
  `-finalize` (dangerous, minTier 2, never offered to the model, Corvidinho
  only); the not-dangerous-but-mutating paragraph names
  `specsync-change-new` / `-answer` (team `/work` too) and the read-only
  `specsync-change-status`; the /work PR step names the SpecSync coverage
  condition.
- Specs: `agent.spec.md` (files, Public API, two invariant paragraphs, two
  scenarios, error rows), `plugins.spec.md` (Public API, roles paragraph,
  change-tool paragraphs, error rows), `discord.spec.md` (`sdd-uncovered`,
  error row), each module's `testing.md`.
- No CHANGELOG / STATUS / package.json edit (the release PR writes them).
