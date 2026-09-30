---
change: safe-2-a-the-file-tools-refuse-fledge-like-fledge-toml-and-specs-so-a-run-cannot-weaken-the-verify-lane-it-is-judged-by
artifact: plan
---

# Plan

1. Capture SAFE-2.a with `hi` (own commit); `hi check`.
2. Add the `.fledge` component rule to `isProtectedPath`; name `.fledge` in
   the SAFE-2 refusal text.
3. Tests: files-write / edit / delete (every spelling, links, dangling link,
   planted `.fledge`), reads still allowed; git-commit deletion staging;
   send-file refusal. Prove each fails on main's source, then restore.
4. Docs / spec prose that list the SAFE-2 set (`docs/discord.md`,
   `plugins.spec.md`), spec testing evidence, deltas (REQ-plugins-083,
   REQ-discord-476 Modified).
5. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
