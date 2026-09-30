---
change: when-it-repeats-a-failing-call-it-is-steered-to-change-approach-then-asks-a-stuck-github-run-pings-the-owner-on-discord
artifact: docs
---

# Docs

- `docs/discord.md`: "Questions and owner ping" lists a third case, stuck on
  a repeated call (AGENT-16: steer, then the stuck ask, no setting); "no DMs"
  now excepts a stuck WATCH run; new "Stuck GitHub runs (AGENT-16.a)"
  paragraph (DM contents, shared data dir, log lines, retry and give-up).
- `docs/WATCH.md`: "Stuck runs ping the owner on Discord (AGENT-16.a)".
- `docs/DISCORD-GO-LIVE.md`: the owner-ping bullet names the repeated
  failing call and the WATCH DM (shared data dir, owner accepts DMs).
- Specs: `agent.spec.md` (Purpose, Public API, Invariants, a scenario, error
  rows, files), `watch.spec.md` (Purpose, Public API, Invariants, example,
  error cases, files), `discord.spec.md` (Public API, Invariants, error rows,
  files), and each module's `testing.md`.
- No CHANGELOG / STATUS / package.json edit (the release PR writes them).
