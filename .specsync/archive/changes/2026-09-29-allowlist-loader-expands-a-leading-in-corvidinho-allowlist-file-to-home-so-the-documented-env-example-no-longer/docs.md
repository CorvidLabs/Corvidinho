---
change: allowlist-loader-expands-a-leading-in-corvidinho-allowlist-file-to-home-so-the-documented-env-example-no-longer
artifact: docs
---

# Docs

- `.env.example`: under the documented `CORVIDINHO_ALLOWLIST_FILE=~/.config/corvidinho/allowlist.toml`
  line, a comment says a leading `~` or `~/` is the bot's HOME (not `~user`)
  and any other path is used as written — true for this code.
- `specs/plugins/plugins.spec.md`: Public API describes `resolveAllowlistPath`
  and its `~` handling; `tests/allowlist.tilde-path.test.ts` joins the files list.
- README, `docs/DISCORD-GO-LIVE.md`, `docs/discord.md`, `docs/DAEMON.md` and
  STATUS show absolute paths or the default path; none says `~` is not
  expanded, so nothing else is made false. No CHANGELOG / STATUS edit
  (bug-fix slice).
