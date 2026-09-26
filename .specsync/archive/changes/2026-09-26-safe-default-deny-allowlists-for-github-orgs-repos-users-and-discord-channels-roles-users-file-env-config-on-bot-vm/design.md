---
change: safe-default-deny-allowlists-for-github-orgs-repos-users-and-discord-channels-roles-users-file-env-config-on-bot-vm
artifact: design
---

# Design

- Lean Bun/TS `src/allowlist/{types,load,github,discord,index}.ts`
- File: TOML or JSON; path from `CORVIDINHO_ALLOWLIST_FILE` else `~/.config/corvidinho/allowlist.{toml,json}`
- Env overlays merge over file (lists union for allow/deny where set)
- Default-deny: no allow entries for that surface ⇒ refuse (not Merlin empty→BASIC)
- Deny lists always win; GH org allow matches `owner/*` style; repo patterns `owner/repo` or `owner/*`
- Discord stub: `checkChannel` / `checkRole` / `checkUser` for HEAR
- Wallets: document deferral only
