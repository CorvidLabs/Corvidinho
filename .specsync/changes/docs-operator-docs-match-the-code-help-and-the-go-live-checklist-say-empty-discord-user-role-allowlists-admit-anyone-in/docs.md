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
  (warn; `spentMicroUsd`, `capMicroUsd`, `percent`, `message`). The
  Configuration row for the allowlists no longer says "Empty means
  deny-all": an empty channel list refuses every schedule that has a
  channel; users and roles both empty leave only the channel gate and the
  deny lists, so any creator's schedule runs (REQ-discord-020, as the
  page's intro already says).
- `--help` and the go-live checklist are operator text printed by code
  (`src/cli.ts`, `src/discord/config.ts`); README, STATUS.md,
  DISCORD-GO-LIVE.md and docs/discord.md already describe empty user/role
  lists correctly and need no change.
- `specs/cli/testing.md` and `specs/discord/testing.md` name the new checks.
