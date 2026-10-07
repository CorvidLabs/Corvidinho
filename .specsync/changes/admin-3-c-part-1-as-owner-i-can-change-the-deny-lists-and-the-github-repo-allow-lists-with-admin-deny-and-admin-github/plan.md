---
change: admin-3-c-part-1-as-owner-i-can-change-the-deny-lists-and-the-github-repo-allow-lists-with-admin-deny-and-admin-github
artifact: plan
---

# Plan

1. Generalize `src/discord/admin-allowlist.ts` from `[discord].users|channels`
   to the ten list keys the loader reads (`ADMIN_LISTS`), writing the spelling
   the loader reads for aliases; TOML guard unchanged, JSON guard compares
   every non-target key; live list spliced in place; input validated
   (`normalizeAdminListId`, `GITHUB_LOGIN_RE` exported from
   `src/identity/people.ts`).
2. `src/discord/command-handlers/admin.ts`: `/admin deny add|remove` and
   `/admin github add|remove` on the existing plan → audit → commit path
   (`applyListChange`), with exactly-one-option parsing, deny-wins and lockout
   pre-checks, env-only refusal, SAFE-5 actions `admin-deny-*` /
   `admin-github-*`; `config show` lists every list's entries.
3. `src/discord/slash-commands.ts`: the `deny` and `github` groups (`OPT_ROLE`
   = 8).
4. `src/watch/config.ts` `reloadWatchAllowlist` + `src/watch/poller.ts`: re-read
   every cycle, skip on load failure, poll nothing when empty, fresh denied-id
   store on a change.
5. Tests that fail on the base, docs (discord.md, WATCH.md, DISCORD-GO-LIVE.md,
   README, allowlist.example.toml), spec prose and deltas.
