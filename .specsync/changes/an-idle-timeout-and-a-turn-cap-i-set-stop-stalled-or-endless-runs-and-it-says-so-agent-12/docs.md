---
change: an-idle-timeout-and-a-turn-cap-i-set-stop-stalled-or-endless-runs-and-it-says-so-agent-12
artifact: docs
---

# Docs

- `README.md`: new "Turn cap and idle timeout (AGENT-12)" section.
- `docs/DISCORD-GO-LIVE.md`: new "E.10 Turn cap and idle timeout (AGENT-12)"
  operator section (both keys, defaults, what counts as idle, how each
  surface says so, no off value).
- `docs/discord.md`: the AGENT-9 paragraph is followed by the AGENT-12 one
  (`stopped=turn-cap` / `stopped=idle-timeout` in the footer, never the body;
  schedule posts have no footer).
- `docs/DAEMON.md`: the configuration table lists both keys and the
  scheduler's turn-cap log line (review).
- `docs/WATCH.md`: a "Turn cap and idle timeout (AGENT-12)" bullet (the plain
  turn-cap line; the idle-timeout comment).
- `.env.example` and `src/cli.ts` help: both keys with their defaults.
- Specs: `agent.spec.md` (files, Public API, invariants, scenario),
  `cli.spec.md`, `discord.spec.md`, `watch.spec.md`, `plugins.spec.md`,
  and each module's `testing.md`.
- No CHANGELOG / STATUS / package.json edit (the release PR writes them).
