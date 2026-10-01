---
change: a-failed-run-tells-the-owner-why-in-one-plain-line-and-everyone-else-that-it-didn-t-work-and-the-owner-has-been-told
artifact: docs
---

# Docs

- `docs/discord.md`: "A failed run says why (DISCORD-3.b)" under Session
  replies (owner line, generic line, owner DM and its dedup, the log line,
  where the reason comes from, scrub and cut, all surfaces); a source-map
  entry.
- `docs/DISCORD-GO-LIVE.md`: the no-provider runs no longer post
  `… failed (exit 1)`; a paragraph on failed runs on Discord.
- `docs/DAEMON.md`: the `failed (exit 1)` mentions now say what the run row
  and `run.finished` `error` read.
- Specs: `discord.spec.md` (files, Public API, Invariants, a scenario, error
  rows), `agent.spec.md` (Public API, Invariants, a scenario, error rows),
  and each module's `testing.md`.
- No CHANGELOG / STATUS / package.json edit (the release PR writes them).
