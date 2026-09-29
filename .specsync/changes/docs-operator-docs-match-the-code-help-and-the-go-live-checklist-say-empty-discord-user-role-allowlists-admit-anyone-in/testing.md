---
change: docs-operator-docs-match-the-code-help-and-the-go-live-checklist-say-empty-discord-user-role-allowlists-admit-anyone-in
artifact: testing
---

# Testing

Regression checks in `tests/docs.operator-facts.test.ts` (fixtures only: the
test reads the docs, calls `goLiveChecklist()`, `resolveAllowlistPath` and
`defaultAllowlistPaths`, reads `src/daemon/daemon.ts`, and spawns
`bun src/cli.ts --help`; no token, network or live Discord).

- Before the change (base `310861f` versions of `src/cli.ts`,
  `src/discord/config.ts`, `.env.example` and `docs/DAEMON.md` swapped in):
  24 pass, 6 fail. With only the base `src/discord/config.ts` (or only the
  base `src/cli.ts`): 28 pass, 2 fail (the two user/role checks).
- After the change: 30 pass, 0 fail; `bunx tsc --noEmit` clean; full
  `bun test` and `fledge lanes run verify --non-interactive` green.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-005` | `tests/docs.operator-facts.test.ts` › "no doc says empty user/role lists are deny-all" | Spawned `--help` has no "empty = deny-all when ..." phrase and no `DISCORD_ALLOW_..._USERS` / `_ROLES` row saying empty = refuse or deny-all (the base row "... / _ROLES / _USERS   HEAR allowlists; empty = refuse (deny-all)" fails). |
| `REQ-cli-005` | `tests/docs.operator-facts.test.ts` › "--help and the go-live checklist say what empty user/role lists do (REQ-discord-043)" | `--help` says "both empty = anyone in an allowlisted channel; once either is set, only those users, role holders and the owner" and "CORVIDINHO_DISCORD_ALLOW_CHANNELS HEAR channel allowlist; empty = refuse start". |
| `REQ-cli-005` | `tests/docs.operator-facts.test.ts` › "allowlist file path (.env.example)" | Code: `resolveAllowlistPath` keeps `~/...` as given; unset reads `<home>/.config/corvidinho/allowlist.toml` then `.json`. Docs: no operator doc sets `CORVIDINHO_ALLOWLIST_FILE=~...`; the `.env.example` example is absolute and the comment says "~ is not expanded" and "Unset already reads ~/.config/corvidinho/allowlist.toml|json". |
| `REQ-cli-108` | `tests/docs.operator-facts.test.ts` › "docs/DAEMON.md log events" | Every `daemon.* / tick.* / run.* / spend.*` literal in `src/daemon/daemon.ts` plus `tick` has a Logs row (base misses `daemon.start_failed`, `spend.warning`); the `daemon.start_failed` row says "Start refused (exit 1)" and "`message` gives the reason", matching `fail()`; the `spend.warning` row is `(warn)` and names `spentMicroUsd`, `capMicroUsd`, `percent` as the code logs them. |
| `REQ-discord-005` | `tests/docs.operator-facts.test.ts` › "no doc says empty user/role lists are deny-all" and "--help and the go-live checklist say what empty user/role lists do (REQ-discord-043)" | `goLiveChecklist()` no longer says "empty = deny-all when those gates apply" and says both empty = anyone in an allowlisted channel, once either is set only those users, role holders and the owner; the fact comes from `resolvePermissionLevel` (both empty ⇒ STANDARD, one listed user ⇒ BLOCKED for others). |
