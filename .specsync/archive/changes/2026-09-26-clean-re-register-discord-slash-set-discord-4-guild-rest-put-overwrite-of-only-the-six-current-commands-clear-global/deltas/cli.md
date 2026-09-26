---
module: cli
change: clean-re-register-discord-slash-set-discord-4-guild-rest-put-overwrite-of-only-the-six-current-commands-clear-global
---

# Delta — cli (discord register-commands)

## Modified

### REQUIREMENT REQ-cli-008

The CLI SHALL expose `discord bridge` to start the HEAR bridge,
`discord register-commands` to full-overwrite Discord application commands
(REQ-discord-016), and `--protocol-version` printing the wire protocol integer.
Doctor SHALL note Discord token and allowlist go-live requirements without
printing secret values. Help SHALL document `DISCORD_GUILD_ID` preference for
fast guild-scoped registration.

Acceptance Criteria
- `corvidinho --protocol-version` prints `1` and exits 0.
- `corvidinho discord bridge` without token exits non-zero with clean explanation.
- `corvidinho discord register-commands` without token exits non-zero naming token env.
- Help documents `discord bridge`, `discord register-commands`, and Discord env/allowlist vars including `DISCORD_GUILD_ID`.
