---
change: shell-exec-cd-pushd-clamp-skips-options-and-before-taking-the-target-so-cd-p-etc-cd-etc-and-cd-cannot-escape-the
artifact: docs
---

# Docs

Doc comments on `cdArgsOffending` and `UNPARSEABLE_WORD` in `plugins/shell/clamp.ts` explain option skipping, the OLDPWD / home cases and the fail-closed rule. The `shell-exec` description already says "SAFE-3 refuses cd/pushd outside the root"; behavior now matches it for option forms. No user-facing docs change.
