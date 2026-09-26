# Lesson bundle — hear-discord-bridge-thin-slice-discord-1-mention-session-stub-discord-2-2-a-reply-thread-continuity-discord-5

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: HEAR Discord bridge thin slice: DISCORD-1 mention→session stub, DISCORD-2/2.a reply/thread continuity, DISCORD-5 allowlisted channels only; gateway→message-router→session stub; no ProcessManager; token clean-exit; discord-post dangerous; spawn --no-verify
- **Kind**: Feature
- **Specs**: discord, cli, plugins
- **Paths**: src/discord, src/cli.ts, src/plugins, plugins, tests, STATUS.md, README.md, package.json, fledge.toml, .specsync/config.toml, .specsync/registry.toml, AGENTS.md, specs/discord
- **Acceptance**: In allowlisted channel, @mention starts session stub (DISCORD-1); reply/thread continues same session id (DISCORD-2/2.a); non-allowlisted channel refused quietly/short not-authorized (DISCORD-5); missing token → clean doctor-style exit (no crash); empty channel allowlist → fail start; discord-post-message marked dangerous; chat spawn uses --no-verify; fixture/unit tests green without live token; STATUS/README go-live checklist (token + non-empty Discord allowlists); SpecSync + fledge verify green

## Evidence

- Verification commit: `42d0210a0226528058c9bdd5ff00f3fa2b8a8474`
- Base commit: `8609cc16f73198c35f4a17c4d8a775900561ff77`
- Verified by: `specsync check --spec cli --spec discord --spec plugins`

## From the change's context.md

# Context

Issue #5 HEAR thin slice: DISCORD-1, 2/2.a, 5 first (soft later #10–14 out of scope).

Foundation already on main: plugin host + GH reads (#15), default-deny allowlists (#18) with Discord stub API, prove-before-done (#17) with `--no-verify` for bridges, SpecSync agent wiring (#22), STATUS ROADMAP (#21).

Steal (consult only): corvid-agent bridge → gateway → message-router → thread-session-manager + db maps + `isMonitoredChannel`; Merlin bridges/discord Bun spawn + protocol-version + `discord-post-message` dangerous. **Empty lists = deny-all (NOT Merlin BASIC).** Session **stub only** — do not port ProcessManager.

Blocked on live Discord secrets until CoS/Leif provide; ship fixture/unit tests + go-live checklist without blocking merge on missing token.

## From the change's design.md

# Design

Lean path only: **gateway → message-router → session stub**.

```
src/discord/
  types.ts          inbound message + session stub types
  config.ts         token + allowlist load; fail if channels empty
  protocol.ts       CORVIDINHO_PROTOCOL_VERSION + handshake
  permissions.ts    isMonitoredChannel via allowlist checkChannel
  session-store.ts  in-memory mentionMsgId→session, threadId→session
  message-router.ts mention / reply / thread routing
  agent-client.ts   spawn corvidinho task run --no-verify (injectable)
  gateway.ts        discord.js Client when live; injectable for tests
  bridge.ts         startBridge orchestrator + clean missing-token exit
  index.ts          public exports
```

- No ProcessManager, no voice, no slash (soft later), no Angular/AlgoChat/iced.
- Channel gate first; user/role optional when provided (empty lists deny).
- `discord-post-message` dangerous plugin: allowlist channel check + refuse without token (stub post path OK).
- Tests inject fake inbound messages; no live Discord required.

## From the change's testing.md

# Testing

## Local gates

- `bun test` (router mention/reply/thread, empty deny, missing token clean exit, protocol, discord-post dangerous)
- `bunx tsc --noEmit`
- `bun src/cli.ts discord bridge` without token → clean non-zero exit
- `bun src/cli.ts --protocol-version` → `1`
- `specsync check`
- `specsync change audit`
- `fledge lanes run verify --non-interactive`

## CI

Bun smoke/test/typecheck + Spec Sync Action only (no Fledge Actions). Do not block merge on missing Discord token.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-001 | `tests/discord.router.test.ts` mention → start_session |
| REQ-discord-002 | `tests/discord.router.test.ts` reply + thread continue same id |
| REQ-discord-003 | `tests/discord.router.test.ts` non-allowlisted refuse/ignore; empty channels |
| REQ-discord-004 | `tests/discord.config.test.ts` empty_channels / DISCORD_CHANNEL_IDS merge |
| REQ-discord-005 | `tests/discord.bridge.cli.test.ts` bridge without token clean exit |
| REQ-discord-006 | `tests/discord.bridge.cli.test.ts` --protocol-version prints 1 |
| REQ-discord-007 | `tests/discord.post.plugin.test.ts` dangerous + SAFE-1 deny + channel gate |
| REQ-cli-008 | `tests/discord.bridge.cli.test.ts` protocol-version + missing token; help via cli smoke |
| REQ-plugins-009 | `tests/discord.post.plugin.test.ts` list dangerous + deny + dry-run allow |

## Where these lessons go

- `specs/discord/context.md`
- `specs/cli/context.md`
- `specs/plugins/context.md`
