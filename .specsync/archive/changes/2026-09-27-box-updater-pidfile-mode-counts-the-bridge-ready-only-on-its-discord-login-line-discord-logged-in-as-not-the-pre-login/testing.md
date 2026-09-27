---
change: box-updater-pidfile-mode-counts-the-bridge-ready-only-on-its-discord-login-line-discord-logged-in-as-not-the-pre-login
artifact: testing
---

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
