# Lesson bundle — discord-post-message-gates-on-the-bridge-s-channel-set-allowlist-file-and-corvidinho-discord-allow-channels-union

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord-post-message gates on the bridge's channel set (allowlist file and CORVIDINHO_DISCORD_ALLOW_CHANNELS union DISCORD_CHANNEL_IDS), so a channel allowlisted only through DISCORD_CHANNEL_IDS can be posted to; deny lists still win
- **Kind**: BugFix
- **Specs**: plugins, discord
- **Paths**: plugins/discord/index.ts, tests/discord.post.plugin.test.ts, plugins/discord/send-file.ts, tests/discord.send-file.test.ts, docs/discord.md, specs/plugins/testing.md, specs/discord/testing.md
- **Acceptance**: discord-post-message gates its --channel on the same channel set as the bridge and daemon (mergeChannelIds: allowlist file [discord].channels + CORVIDINHO_DISCORD_ALLOW_CHANNELS union DISCORD_CHANNEL_IDS), so with no allowlist file, CORVIDINHO_DISCORD_ALLOW_CHANNELS unset and DISCORD_CHANNEL_IDS=111 a dry-run post to 111 succeeds (exit 0) and a post to a channel in no list is still refused (exit 3, not allowlisted); CORVIDINHO_DISCORD_DENY_CHANNELS=111 on top still refuses the post to 111 with exit 3 (deny wins); a malformed allowlist file still refuses (fail closed); the DISCORD_CHANNEL_IDS-only regression test fails on the base and passes after; discord-send-file gates the conversation channel the bridge set (a thread through its parent) on the same union, so a channel listed only in DISCORD_CHANNEL_IDS attaches, a channel in no list is refused and a deny still wins; its DISCORD_CHANNEL_IDS-only test fails on the base and passes after

## Evidence

- Verification commit: `685c71c8f70db72cb0e4f992ecb86712c31eba8b`
- Base commit: `310861f81c5fb0314447109b959b8f37fb323578`
- Verified by: `specsync check --spec discord --spec plugins`

## From the change's context.md

# Context

Found by the 2026-09-28 QA audit (finding
`post-message-ignores-discord-channel-ids`, kind e2e-break) and confirmed as
Wave 0 W12 bug-sweep work in Leif's 2026-09-28 interview. No new hi criteria:
this restores already captured behaviour — ALLOW-3 / DISCORD-5 channel
allowlists, REQ-discord-004 (the channel allowlist is `DISCORD_CHANNEL_IDS`
union the file / env channels) and REQ-plugins-009 (the post target MUST pass
the Discord channel allowlist).

- `plugins/discord/index.ts` gated on `tryLoadAllowlist()` +
  `checkChannel(channelId, loaded.config)` only. `loadAllowlist` reads
  channels from the file and `CORVIDINHO_DISCORD_ALLOW_CHANNELS`, never
  `DISCORD_CHANNEL_IDS`.
- The bridge (`loadBridgeConfig`, `src/discord/config.ts`) and the daemon
  (`daemonGate`, `src/daemon/daemon.ts`) gate on `mergeChannelIds(allowlist,
  env)`, which adds `DISCORD_CHANNEL_IDS`. README, docs/DISCORD-GO-LIVE.md,
  `.env.example` and `--help` present `DISCORD_CHANNEL_IDS` as the channel
  allowlist.
- Bridge-spawned runs inherit `process.env`, so they carry
  `DISCORD_CHANNEL_IDS`, but the plugin ignored it.

Repro on base `310861f` (HOME an empty dir, no allowlist file):
`DISCORD_TOKEN=x DISCORD_CHANNEL_IDS=111111111111111111
CORVIDINHO_DISCORD_DRY_RUN=1 bun src/cli.ts plugins run discord-post-message
-- --channel 111111111111111111 hi` printed `not authorized: Discord channel
allowlist empty` and exited 3; the same with
`CORVIDINHO_DISCORD_ALLOW_CHANNELS` exited 0.

Same gap, fixed here too (found in review): `discord-send-file`
(`plugins/discord/send-file.ts`, DISCORD-17, REQ-discord-476) gated the
conversation channel with `checkChannel(parent || channelId, loaded.config)`,
so in a deployment whose channels come only from `DISCORD_CHANNEL_IDS` every
attach was refused with "allowlist empty" although the bridge talks in that
channel. The other channel gates (bridge ingress and slash, `/schedule` create,
scheduler ticks from the bridge and the daemon, `doctor`) already use
`mergeChannelIds`.

## From the change's design.md

# Design

- In `discordPostMessage.handler`, after `tryLoadAllowlist` succeeds, gate on
  `checkChannel(channelId, { ...loaded.config.discord, channels:
  mergeChannelIds(loaded.config, process.env) })` — the same shape as
  `daemonGate` and the bridge's `cfgAllow`.
- Deny lists are untouched and `checkChannel` reads them first, so a channel
  in `CORVIDINHO_DISCORD_DENY_CHANNELS` / `deny_channels` is still refused even
  when it is in `DISCORD_CHANNEL_IDS`.
- `discord-send-file` (`plugins/discord/send-file.ts`) had the same
  `checkChannel(…, loaded.config)` shape and gets the same merge on
  `parent || channelId`. It only ever attaches in the conversation channel the
  bridge set for the run, which the bridge accepted on this same union, so the
  merge adds no channel the bridge does not already talk in; before it, every
  attach in a `DISCORD_CHANNEL_IDS`-only deployment was refused ("allowlist
  empty"), against DISCORD-17 ("never says it can't send them").
- Reuse only: no new helper, env var, flag, config key, table or command.

## From the change's testing.md

# Testing

`tests/discord.post.plugin.test.ts`, new describe "discord-post-message
channel gate matches the bridge" (fixtures only: a missing temp allowlist file,
env set and restored per test, `CORVIDINHO_DISCORD_DRY_RUN=1`, fake token; no
live Discord or network):

- "a channel allowlisted only through DISCORD_CHANNEL_IDS posts (dry run)":
  `DISCORD_CHANNEL_IDS=111`, no file, `CORVIDINHO_DISCORD_ALLOW_CHANNELS`
  unset → post to `111` ok, exit 0, dry run; post to `222` refused, exit 3,
  "not allowlisted".
- "a deny on the same channel still refuses with exit 3":
  `DISCORD_CHANNEL_IDS=111` + `CORVIDINHO_DISCORD_DENY_CHANNELS=111` → exit 3,
  "is denied".

Base proof (base `plugins/discord/index.ts` from `310861f` swapped in, then
restored): the `DISCORD_CHANNEL_IDS`-only test fails (`not authorized: Discord
channel allowlist empty`), 5 pass / 1 fail; the deny test passes on the base
too (the base refuses every such post, so it guards that deny still wins after
the merge). With the fix: 6 pass / 0 fail. CLI repro (HOME an empty dir):
`plugins run discord-post-message -- --channel 111111111111111111 hi` with
only `DISCORD_CHANNEL_IDS` prints `dry-run post to 111111111111111111`, exit 0;
with the deny added, exit 3 `is denied`; another channel, exit 3 `is not
allowlisted`.

`tests/discord.send-file.test.ts`, "REQ-discord-004: a channel the bridge
listens in only through DISCORD_CHANNEL_IDS attaches; a deny still wins"
(fixtures: a missing temp allowlist file, `CORVIDINHO_DISCORD_ALLOW_CHANNELS`
unset, `DISCORD_CHANNEL_IDS` = the conversation channel, stubbed fetch and
requester checker): the channel attaches, a thread whose parent is only in
`DISCORD_CHANNEL_IDS` attaches, a channel in no list is refused (not
allowlisted), and `CORVIDINHO_DISCORD_DENY_CHANNELS` on the same channel
refuses (is denied); two uploads in all. Base proof (main's
`plugins/discord/send-file.ts` swapped in, then restored): it fails with `not
authorized: Discord channel allowlist empty`, 21 pass / 1 fail; with the fix
22 pass / 0 fail.

Plus `bunx tsc --noEmit`, full `bun test`, `specsync check --require-coverage
100`, `hi check`, `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-009` | `tests/discord.post.plugin.test.ts` › "discord-post-message channel gate matches the bridge" › "a channel allowlisted only through DISCORD_CHANNEL_IDS posts (dry run)" | Only `DISCORD_CHANNEL_IDS=111`: dry-run post to `111` ok (exit 0); `222` refused (exit 3, not allowlisted). Fails on base. |
| `REQ-plugins-009` | `tests/discord.post.plugin.test.ts` › "discord-post-message channel gate matches the bridge" › "a deny on the same channel still refuses with exit 3" | `DISCORD_CHANNEL_IDS=111` + `CORVIDINHO_DISCORD_DENY_CHANNELS=111`: refused, exit 3, "is denied". |
| `REQ-plugins-009` | `tests/discord.post.plugin.test.ts` › "discord-post-message dangerous plugin" | Listed dangerous; SAFE-1 deny (exit 2); empty channel allowlist refused (exit 3). |
| `REQ-discord-004` | `tests/discord.post.plugin.test.ts` › "discord-post-message channel gate matches the bridge" | The post gate uses the bridge's union (`mergeChannelIds`), deny first. |
| `REQ-discord-004` | `tests/discord.send-file.test.ts` › "discord-send-file plugin (REQ-discord-476, DISCORD-17)" › "REQ-discord-004: a channel the bridge listens in only through DISCORD_CHANNEL_IDS attaches; a deny still wins" | Channel and thread parent only in `DISCORD_CHANNEL_IDS` attach; a channel in no list refused (not allowlisted); a deny refuses (is denied). Fails on base. |

## Where these lessons go

- `specs/plugins/context.md`
- `specs/discord/context.md`
