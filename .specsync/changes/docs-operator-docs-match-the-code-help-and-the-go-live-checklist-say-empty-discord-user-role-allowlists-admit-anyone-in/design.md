---
change: docs-operator-docs-match-the-code-help-and-the-go-live-checklist-say-empty-discord-user-role-allowlists-admit-anyone-in
artifact: design
---

# Design

Text-only fixes plus doc-facts tests; no behaviour, config key, env var,
schema or protocol change.

- `src/cli.ts` `printHelp()`: the `CORVIDINHO_DISCORD_ALLOW_CHANNELS / _ROLES /
  _USERS` row splits into a channel row ("empty = refuse start") and a users /
  roles row ("both empty = anyone in an allowlisted channel; once either is
  set, only those users, role holders and the owner"). The section header
  drops its blanket "empty = deny-all" for "default-deny", which the
  users/roles row would otherwise contradict.
- `src/discord/config.ts` `goLiveChecklist()` item 3 says the same.
- `docs/DAEMON.md`: Logs rows for `daemon.start_failed` and `spend.warning`;
  the Configuration allowlist row says what empty channel and user/role lists
  do for schedules instead of "Empty means deny-all".
- `tests/docs.operator-facts.test.ts`: the "no doc says empty user/role
  lists are deny-all" check also scans `goLiveChecklist()` and the spawned
  `--help` output and refuses a `_USERS` / `_ROLES` row saying empty =
  refuse / deny-all; a positive check pins the new wording; the
  daemon check lists every event literal in `src/daemon/daemon.ts` (known
  prefixes plus any event passed to `log()` / `fail()`) and requires a Logs
  row for each; a DAEMON.md check pins the allowlist row against
  `gateActor`.
