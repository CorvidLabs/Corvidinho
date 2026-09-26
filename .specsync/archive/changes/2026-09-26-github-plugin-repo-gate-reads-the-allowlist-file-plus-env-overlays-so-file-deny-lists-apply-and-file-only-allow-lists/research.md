---
change: github-plugin-repo-gate-reads-the-allowlist-file-plus-env-overlays-so-file-deny-lists-apply-and-file-only-allow-lists
artifact: research
---

# Research

- `plugins/github/commands.ts` `requireRepo` and `plugins/github/review.ts`
  `gateRepo` call `checkRepoGateForActingRole(repo)` with no `cfg`; it fell
  back to `configFromEnvOnly(env)` (src/allowlist/load.ts, `sourcePath: null`).
- `src/work/pr.ts` gate defaulted to `checkRepoGate(r)`, which also falls back
  to `configFromEnvOnly`. Production (/work in Discord) never injects
  `repoGate`.
- `loadAllowlist({ env })` is the ALLOW-4 loader used by WATCH
  (src/watch/config.ts), the daemon, roles.ts and git-push; it merges the file
  with env overlays and fails closed (unreadable file ⇒ empty ⇒ deny).
- Repro before the fix (temp HOME with the file deny lists, env
  `ALLOW_ORGS=corvidlabs,evilorg`, dry run): `plugins run github-issue-create
  -- --repo corvidlabs/secret` ⇒ ok:true exit 0; `github-issue-comment -- 1
  --repo evilorg/x` ⇒ ok:true exit 0; file-only `orgs = ["corvidlabs"]` ⇒
  "GitHub allowlist empty" exit 3.
