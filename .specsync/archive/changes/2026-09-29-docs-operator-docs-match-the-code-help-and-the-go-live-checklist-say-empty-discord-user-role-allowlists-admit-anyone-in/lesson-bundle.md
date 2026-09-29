# Lesson bundle — docs-operator-docs-match-the-code-help-and-the-go-live-checklist-say-empty-discord-user-role-allowlists-admit-anyone-in

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Docs: operator docs match the code - --help and the go-live checklist say empty Discord user/role allowlists admit anyone in an allowlisted channel (not deny-all), and docs/DAEMON.md lists daemon.start_failed and spend.warning
- **Kind**: Documentation
- **Specs**: cli, discord
- **Paths**: src/cli.ts, src/discord/config.ts, docs/DAEMON.md, tests/docs.operator-facts.test.ts, specs/cli/testing.md, specs/discord/testing.md
- **Acceptance**: corvidinho --help and the go-live checklist that doctor and discord bridge print say an empty channel list refuses start, users and roles both empty admit anyone in an allowlisted channel, and once either is set only those users, role holders and the owner (REQ-discord-043); neither says empty user/role lists are deny-all, and tests/docs.operator-facts.test.ts checks both surfaces alongside the operator docs. docs/DAEMON.md's Logs table has a row for every event src/daemon/daemon.ts logs, including daemon.start_failed (start refused, exit 1, message gives the reason) and spend.warning (warn, amounts and percent). The new checks fail on the base and pass on the branch.

## Evidence

- Verification commit: `53f2e5df126fb01632b641ba57f51997aea8660e`
- Base commit: `310861f81c5fb0314447109b959b8f37fb323578`
- Verified by: `specsync check --spec cli --spec discord`

## From the change's context.md

# Context

A docs + e2e audit of `origin/main` (246cb6c, re-checked on 310861f) found
three places where operator-facing text says something the code does not do
(verified findings `help-says-empty-user-role-deny-all`,
`env-example-tilde-allowlist-path`, `daemon-md-missing-start-failed-event`):

- `corvidinho --help` said the Discord channel / role / user allowlists are
  "empty = refuse (deny-all)", and the go-live checklist that `doctor` and
  `discord bridge` print said "empty = deny-all when those gates apply" for
  users/roles. The code (`resolvePermissionLevel`, REQ-discord-043) admits
  anyone in an allowlisted channel while users and roles are both empty; the
  first listed user or role narrows it to those users, role holders and the
  owner. `tests/docs.operator-facts.test.ts` already refused that wording in
  the markdown docs but never looked at the checklist or `--help`.
- `docs/DAEMON.md`'s Logs table had no row for `daemon.start_failed` (start
  refused, exit 1, e.g. a malformed allowlist file) or `spend.warning`.

The `env-example-tilde-allowlist-path` finding (`.env.example` suggested
`CORVIDINHO_ALLOWLIST_FILE=~/.config/...`) was fixed in code by #280:
`resolveAllowlistPath` now expands a leading `~` or `~/` to HOME
(REQ-plugins-006), so the documented example works and this change does not
touch `.env.example`.

Decisions come from Leif's 2026-09-28 interview (wave 0: docs + e2e audit, no
new criteria). No hi/ ids are captured by this change. #232/#233 scope is not
touched.

## From the change's design.md

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

## From the change's testing.md

# Testing

Regression checks in `tests/docs.operator-facts.test.ts` (fixtures only: the
test reads the docs, calls `goLiveChecklist()` and `gateActor`, reads
`src/daemon/daemon.ts`, and spawns `bun src/cli.ts --help`; no token,
network or live Discord).

- Before the change (base versions of `src/cli.ts`,
  `src/discord/config.ts` and `docs/DAEMON.md` swapped in): 23 pass, 6 fail.
  With only the base `src/discord/config.ts` (or only the base
  `src/cli.ts`): 27 pass, 2 fail (the two user/role checks). With only the
  base `docs/DAEMON.md`: 25 pass, 4 fail (the allowlist row and the three
  log-event checks).
- After the change: 29 pass, 0 fail; `bunx tsc --noEmit` clean; full
  `bun test` and `fledge lanes run verify --non-interactive` green.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-005` | `tests/docs.operator-facts.test.ts` › "no doc says empty user/role lists are deny-all" | Spawned `--help` has no "empty = deny-all when ..." phrase and no `DISCORD_ALLOW_..._USERS` / `_ROLES` row saying empty = refuse or deny-all (the base row "... / _ROLES / _USERS   HEAR allowlists; empty = refuse (deny-all)" fails). |
| `REQ-cli-005` | `tests/docs.operator-facts.test.ts` › "--help and the go-live checklist say what empty user/role lists do (REQ-discord-043)" | `--help` says "both empty = anyone in an allowlisted channel; once either is set, only those users, role holders and the owner" and "CORVIDINHO_DISCORD_ALLOW_CHANNELS HEAR channel allowlist; empty = refuse start". |
| `REQ-cli-108` | `tests/docs.operator-facts.test.ts` › "docs/DAEMON.md allowlist row says what empty user/role lists do for schedules (REQ-discord-020)" | Code: `gateActor` with no member roles passes any creator when users and roles are both empty and refuses an unlisted creator once a user or a role is listed. Docs: the DAEMON.md Configuration row no longer says "Empty means deny-all" and says an empty channel list refuses every schedule that has a channel and users and roles both empty leave only the channel gate and the deny lists (base row fails). |
| `REQ-cli-108` | `tests/docs.operator-facts.test.ts` › "docs/DAEMON.md log events" | Every `daemon.* / tick.* / run.* / spend.*` literal in `src/daemon/daemon.ts`, and every event passed to `log(level, "…")` or `fail("…")` whatever its prefix, has a Logs row (base misses `daemon.start_failed`, `spend.warning`); the `daemon.start_failed` row says "Start refused (exit 1)" and "`message` gives the reason", matching `fail()`; the `spend.warning` row is `(warn)` and names `spentMicroUsd`, `capMicroUsd`, `percent` as the code logs them. |
| `REQ-discord-005` | `tests/docs.operator-facts.test.ts` › "no doc says empty user/role lists are deny-all" and "--help and the go-live checklist say what empty user/role lists do (REQ-discord-043)" | `goLiveChecklist()` no longer says "empty = deny-all when those gates apply" and says both empty = anyone in an allowlisted channel, once either is set only those users, role holders and the owner; the fact comes from `resolvePermissionLevel` (both empty ⇒ STANDARD, one listed user ⇒ BLOCKED for others). |

## Where these lessons go

- `specs/cli/context.md`
- `specs/discord/context.md`
