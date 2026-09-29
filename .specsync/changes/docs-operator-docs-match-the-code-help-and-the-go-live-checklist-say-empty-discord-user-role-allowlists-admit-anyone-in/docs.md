---
change: docs-operator-docs-match-the-code-help-and-the-go-live-checklist-say-empty-discord-user-role-allowlists-admit-anyone-in
artifact: docs
---

# Docs

- `.env.example` — `CORVIDINHO_ALLOWLIST_FILE` example is absolute
  (`/home/corvid/.config/corvidinho/allowlist.toml`); a comment says `~` is
  not expanded (systemd `EnvironmentFile`, Bun `.env`) and that unset
  already reads `~/.config/corvidinho/allowlist.toml|json`.
- `docs/DAEMON.md` — Logs table rows for `daemon.start_failed` (start refused,
  exit 1, `message` gives the reason, lock released) and `spend.warning`
  (warn; `spentMicroUsd`, `capMicroUsd`, `percent`, `message`).
- `--help` and the go-live checklist are operator text printed by code
  (`src/cli.ts`, `src/discord/config.ts`); README, STATUS.md,
  DISCORD-GO-LIVE.md and docs/discord.md already describe empty user/role
  lists correctly and need no change.
- `specs/cli/testing.md` and `specs/discord/testing.md` name the new checks.
