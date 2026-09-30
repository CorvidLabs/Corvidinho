---
change: shell-exec-refuses-foot-guns-and-says-why-sed-i-or-edits-downloads-piped-into-a-shell-deletes-outside-the-worktree
artifact: plan
---

# Plan

1. Capture SAFE-21.a with `hi` (its own commit); `hi check`.
2. Regression tests `tests/shell.footguns.test.ts` (new) and additions to
   `tests/shell.clamp-bypass.test.ts` and `tests/runners.plugins.test.ts`;
   confirm they fail on the base.
3. `clamp.ts`: redirection operators and pipes in the tokenizer; strict /
   lenient walk with a visitor (`forEachSimpleCommand`); getopt-style
   `env` / `sudo` / `doas` wrappers with chdir and opaque options;
   `commandChain`; `physicalPath` / `landsOutside` in `isCdEscape`; `ln`
   targets.
4. `footguns.ts`: the four families, reasons and "instead" text.
5. `commands.ts`: SAFE-21 then SAFE-3, runners' env, `spawnCapped`, scrub.
6. `runners/commands.ts`: `withoutGitCredentials` in `runnerChildEnv`.
7. Adjust the two fixtures that used `>` to write (`tee` instead).
8. Specs (plugins prose, residuals, error cases, scenarios, files, testing;
   agent testing), deltas REQ-plugins-494 / 495 (Added), REQ-plugins-087 /
   313 and REQ-agent-085 (Modified); `docs/DISCORD-GO-LIVE.md` rows.
9. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
