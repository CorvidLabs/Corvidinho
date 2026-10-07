---
change: admin-3-c-part-1-as-owner-i-can-change-the-deny-lists-and-the-github-repo-allow-lists-with-admin-deny-and-admin-github
artifact: tasks
---

# Tasks

- [x] Generalize the allowlist writer to every list key the loader reads (aliases, guards, live splice, validation).
- [x] `/admin deny add|remove` and `/admin github add|remove` with owner re-check, validation, env-only and lockout refusals, SAFE-5 rows.
- [x] `/admin config show` lists the deny lists and the GitHub repo allow lists; `[github].users` read-only.
- [x] Slash body: `deny` and `github` groups, ROLE option.
- [x] `github watch` re-reads the allowlist every poll (skip on load failure, nothing when empty, denied ids cleared on change).
- [x] `tests/discord.admin-lists.test.ts` + `tests/watch.allowlist-reload.test.ts` (fail on base, pass on branch); `tests/discord.admin-slash.test.ts` body updated.
- [x] Docs, spec prose, testing evidence and deltas (REQ-discord-043 modified, REQ-watch-043 added).
- [x] `specsync change approve --actor corvid-agent`, `specsync change check --commit`, `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
