# Lesson bundle — box-updater-pidfile-mode-counts-the-bridge-ready-only-on-its-discord-login-line-discord-logged-in-as-not-the-pre-login

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Box updater pidfile mode counts the bridge ready only on its Discord login line ([discord] logged in as), not the pre-login protocol version OK line, so a bridge that dies on login rolls back
- **Kind**: BugFix
- **Specs**: cli
- **Paths**: scripts/lib/update-helpers.sh, scripts/corvidinho-update.sh, tests/update-helpers.test.ts, docs/BOX-UPDATE.md, docs/UPDATE.md
- **Acceptance**: In pidfile mode the updater counts the bridge ready only when the bridge log shows the line the gateway prints on ClientReady ([discord] logged in as <tag>); the pre-login [discord] protocol version N OK line alone is not ready. A bridge that prints protocol OK and then exits (for example DiscordAPIError on login) makes the update roll back and exit 1; a bridge that never logs in within CORVIDINHO_READY_TIMEOUT rolls back with a timeout log line; a bridge that prints the login line passes with exit 0 and no rollback. systemd mode still checks systemctl is-active. docs/BOX-UPDATE.md and docs/UPDATE.md name the login line as the ready signal.

## Evidence

- Verification commit: `28b13a8d1e9d2772e80343a998090ef616ab7b50`
- Base commit: `0e6e8d26b983a31b5518bc7013f75d5513fd94ba`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

A long-running end-to-end check of `origin/main` (defect D5) found that the box updater
`scripts/corvidinho-update.sh` declared a pidfile-mode bridge ready before it had logged in to
Discord. `log_indicates_ready` (`scripts/lib/update-helpers.sh`) accepted either
`[discord] logged in` or `protocol version N OK`. The bridge prints the protocol line from the
pre-login handshake (`src/discord/protocol-version.ts`, called at `src/discord/bridge.ts` ~411),
long before `client.login` (`src/discord/gateway.ts` ~446). With a bad token the real bridge logs
`[discord] protocol version 2 OK`, then an unhandled `DiscordAPIError` 403 and exits 1; the
updater still logged "ready signal observed" and "OK updated …", exited 0 and never rolled back.

Re-verified on `0e6e8d2` (current main): the helper still accepts the protocol line, and a fake
bridge that prints it then exits 1 makes the update exit 0.

The bridge already prints a distinct line only after a successful login:
`[discord] logged in as <tag>`, from the `Events.ClientReady` handler in `src/discord/gateway.ts`.
No bridge change is needed; the updater now requires that line.

Constraints: systemd mode keeps `systemctl is-active` (it never read the log). The timeout
(`CORVIDINHO_READY_TIMEOUT`, default 60) and rollback behaviour are unchanged; only the log lines
now name the line being waited for. Out of scope (separate defects in the same report): pidfile
pid identity check (D6), avoidable restart on doctor failure (D7), rollback `bun install` with the
env file loaded (D8).

## From the change's design.md

# Design

- `scripts/lib/update-helpers.sh`: new `BRIDGE_READY_LINE='[discord] logged in as'`, the exact
  prefix the gateway prints on ClientReady. `log_indicates_ready` returns 0 only when the log holds
  that prefix followed by a space (a bot tag follows). The `protocol version N OK` branch is removed.
  The match is a bash substring test instead of `printf | grep -q`, so the updater's
  `set -o pipefail` cannot turn an early-exiting `grep -q` on a long log into a false "not ready".
- `scripts/corvidinho-update.sh`: `wait_for_ready` is unchanged apart from its log lines, which now
  name the awaited line and the timeout. The existing paths stay: pid gone → "bridge exited before
  ready" → rollback; no login line by the deadline → "ready timeout" → rollback (exit 1, no Discord
  post). Unit mode still restarts and checks `systemctl is-active`.
- Contract between the two files is pinned by a test that finds the login line inside the
  `Events.ClientReady` handler in `src/discord/gateway.ts` and feeds it to the helper.
- Where PID 1 does not reap orphans (some containers), an exited bridge stays a zombie and
  `kill -0` still succeeds, so the exit is caught by the timeout rather than at once; the
  outcome (rollback, exit 1) is the same. Not changed here.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-347` | `tests/update-helpers.test.ts` (log_indicates_ready rejects protocol OK alone) | `[discord] protocol version 1 OK` is not ready. Fails on main (accepted). |
| `REQ-cli-347` | `tests/update-helpers.test.ts` (rejects protocol OK followed by a login failure) | protocol line + `DiscordAPIError[403]` is not ready. Fails on main. |
| `REQ-cli-347` | `tests/update-helpers.test.ts` (accepts protocol OK followed by the login line) | protocol line + `[discord] logged in as Corvidinho#1234` is ready. Guard. |
| `REQ-cli-347` | `tests/update-helpers.test.ts` (ready line is the one the gateway prints on ClientReady) | `src/discord/gateway.ts` prints `[discord] logged in as ${ready.user.tag}` once, inside the `Events.ClientReady` handler, and the helper accepts it. Guard for the contract. |
| `REQ-cli-347` | `tests/update-helpers.test.ts` (bridge prints protocol OK then exits 1 on login → rolls back) | fake box with origin ahead: exit 1, no "ready signal observed"/"OK updated", "ROLLBACK: bridge restart/health failed", HEAD back at the previous SHA, bridge started twice (forward + rollback). Fails on main (exit 0). |
| `REQ-cli-347` | `tests/update-helpers.test.ts` (bridge never logs in → rolls back after CORVIDINHO_READY_TIMEOUT) | `CORVIDINHO_READY_TIMEOUT=2`: "waiting up to 2s for [discord] logged in as", "ready timeout", rollback, HEAD restored. Fails on main (exit 0). |
| `REQ-cli-347` | `tests/update-helpers.test.ts` (bridge that prints the login line passes) | protocol line, then the login line 0.3 s later: exit 0, "ready signal observed", "OK updated", no rollback, HEAD moved. Guard. |
| `REQ-cli-347` | `tests/update-helpers.test.ts` (systemd mode keeps its systemctl is-active check) | unit mode runs `systemctl is-active --quiet <unit>` and starts no `discord bridge`; an inactive unit rolls back (exit 1, HEAD restored). Guard. |
| `REQ-cli-347` | `tests/update-helpers.test.ts` (existing REQ-cli-347 restart-mode/env/pkill tests) | unchanged; still pass with the fake bridge now printing the protocol line before the login line. |

## Before / after

- Before (origin/main 0e6e8d2 script + helper, new tests): 40 pass, 4 fail (the two helper rejections and the two fake-box rollback tests).
- After: 44 pass, 0 fail.

Tests use temp dirs, a local bare origin, fake `bun`/`systemctl` on PATH and a clean env; they never start a real bridge or touch Discord.

## Where these lessons go

- `specs/cli/context.md`
