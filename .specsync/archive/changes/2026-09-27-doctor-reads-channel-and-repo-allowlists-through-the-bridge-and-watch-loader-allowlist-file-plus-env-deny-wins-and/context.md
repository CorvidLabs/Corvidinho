---
change: doctor-reads-channel-and-repo-allowlists-through-the-bridge-and-watch-loader-allowlist-file-plus-env-deny-wins-and
artifact: context
---

# Context

The CLI end-to-end check on `origin/main` (v0.0.24, re-verified on
`9973a27`, v0.0.26) found two false doctor results:

- **Defect 7.** With the channel and repo allowlists only in the allowlist
  file (`CORVIDINHO_ALLOWLIST_FILE` with `[discord] channels` and
  `[github] repos`), doctor printed `[missing] discord: token present but
  channel allowlist empty` and `[missing] github-watch: set
  CORVIDINHO_GITHUB_ALLOW_REPOS / ORGS` and exited 1, while `discord bridge`
  and `github watch` start with that file. The `discord` / `github-watch`
  checks in `src/cli.ts` only looked at env vars. The `allowlist-file` line
  (#203, REQ-cli-042) already parsed the file but its lists were not used.
  `docs/DISCORD-GO-LIVE.md` documented the false result as known behaviour.
- **Defect 8.** Doctor did not check the LLM key (`task run` silently uses
  the demo stub and reports `state=done`) or the data dir (a bad
  `CORVIDINHO_DATA_DIR` crashes the bridge and memory plugins while doctor is
  silent).

HI: CLI-4 (`hi/cli.md`): "`init` and `doctor` tell me what is missing
(keys, Fledge, SpecSync, project files) in plain language instead of failing
later mid-task." ALLOW-3 / ALLOW-4 (`hi/allow.md`): Discord listens only in
allowlisted channels; "Allowlists load from config on the bot VM (config file
and/or env)". ALLOW-1 / ALLOW-2 for GitHub repos / orgs. MEMORY-1
(`hi/memory.md`) for the local SQLite data dir. Secrets stay out of logs
(AGENTS.md, SAFE-6).

Constraints: no new env var, command, flag or config key; no
`package.json` / CHANGELOG edit; the `init` half of CLI-4 is out of scope
(no `init` command exists).
