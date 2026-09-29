---
change: discord-post-message-gates-on-the-bridge-s-channel-set-allowlist-file-and-corvidinho-discord-allow-channels-union
artifact: testing
---

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

Plus `bunx tsc --noEmit`, full `bun test`, `specsync check --require-coverage
100`, `hi check`, `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-009` | `tests/discord.post.plugin.test.ts` › "discord-post-message channel gate matches the bridge" › "a channel allowlisted only through DISCORD_CHANNEL_IDS posts (dry run)" | Only `DISCORD_CHANNEL_IDS=111`: dry-run post to `111` ok (exit 0); `222` refused (exit 3, not allowlisted). Fails on base. |
| `REQ-plugins-009` | `tests/discord.post.plugin.test.ts` › "discord-post-message channel gate matches the bridge" › "a deny on the same channel still refuses with exit 3" | `DISCORD_CHANNEL_IDS=111` + `CORVIDINHO_DISCORD_DENY_CHANNELS=111`: refused, exit 3, "is denied". |
| `REQ-plugins-009` | `tests/discord.post.plugin.test.ts` › "discord-post-message dangerous plugin" | Listed dangerous; SAFE-1 deny (exit 2); empty channel allowlist refused (exit 3). |
| `REQ-discord-004` | `tests/discord.post.plugin.test.ts` › "discord-post-message channel gate matches the bridge" | The post gate uses the bridge's union (`mergeChannelIds`), deny first. |
