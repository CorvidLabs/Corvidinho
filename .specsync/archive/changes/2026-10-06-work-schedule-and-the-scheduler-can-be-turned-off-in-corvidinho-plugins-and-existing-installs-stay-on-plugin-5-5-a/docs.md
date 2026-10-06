---
change: work-schedule-and-the-scheduler-can-be-turned-off-in-corvidinho-plugins-and-existing-installs-stay-on-plugin-5-5-a
artifact: docs
---

# Docs

- `docs/discord.md`: the slash gate order names the extras switch between
  mute/rate and minPermission; a "Turning `/work` and `/schedule` off"
  paragraph (what is refused, the `/work` talk messages and presses, runs in
  flight, the scheduler's other jobs, `config-unreadable`, no /admin knob).
- `docs/DISCORD-GO-LIVE.md`: new "E.11 Turning `/work` and `/schedule` off
  (PLUGIN-5, PLUGIN-5.a)" — the table and its spellings, where to put it (the
  allowlist file is the update-proof place), no restart, what each off does,
  re-enable fires each overdue schedule once, unreadable settings,
  independence from `[corvidinho.autonomous]`.
- `docs/BOX-UPDATE.md`: the updater's `git checkout --force` throws away
  local `fledge.toml` edits; keep an off in the allowlist file.
- `docs/DAEMON.md`: configuration row, the two-ticker note, the
  `daemon.started` `schedules` field and the `schedules.off` /
  `schedules.on` events.
- `fledge.toml` and `allowlist.example.toml`: a commented
  `[corvidinho.plugins]` block.
- Specs: `agent.spec.md` (Public API, invariant), `discord.spec.md` (files,
  Public API, invariant), `cli.spec.md` (invariant, error case) and each
  module's `testing.md`.
- `tests/docs.operator-facts.test.ts`: the gate-order check follows the new
  order in `slash-dispatch.ts` and `docs/discord.md`.
- No CHANGELOG / STATUS / package.json edit (the release PR writes them).
