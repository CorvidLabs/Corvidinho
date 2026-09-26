---
change: safe-8-amended-issue-98-warn-at-80-of-the-daily-spend-cap-and-ask-at-100-instead-of-refusing-once-per-crossing-a-run
artifact: docs
---

# Docs

- `.env.example`: the `CORVIDINHO_DAILY_SPEND_CAP_USD` block now says it warns
  once at 80%, stops and asks the owner at 100% (and for an unpriced model),
  that `doctor` and Discord `/status` show spend vs the cap, and that the
  bridge or daemon must be restarted after changing it.
- `corvidinho --help`: the env line reads "warn at 80%, stop and ask at 100%
  (SAFE-8)".
- Specs: `specs/agent/agent.spec.md` (Public API, Invariants, Behavioral
  Examples), `specs/cli/cli.spec.md` (doctor / task run), and
  `specs/discord/discord.spec.md` (spend-cap ask, warning line, `/status`,
  `spend_alerts`) describe the amended behavior; REQ-agent-098,
  REQ-cli-098 and REQ-discord-098 are modified through this change's deltas.
- No CHANGELOG / STATUS / package version edits (release PRs own those).
