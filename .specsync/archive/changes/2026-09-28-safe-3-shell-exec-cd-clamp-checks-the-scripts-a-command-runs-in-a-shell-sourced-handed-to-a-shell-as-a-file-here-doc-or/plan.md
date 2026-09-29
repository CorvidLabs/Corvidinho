---
change: safe-3-shell-exec-cd-clamp-checks-the-scripts-a-command-runs-in-a-shell-sourced-handed-to-a-shell-as-a-file-here-doc-or
artifact: plan
---

# Plan

1. Add `tests/shell.clamp-scripts.test.ts` (temp project with safe and escaping
   scripts): sourced / shell-run / run-by-path / startup-file scripts, stdin
   forms, unreadable and self-written scripts, `trap` / `alias`, in-root allow
   cases, and a `runPlugin` end-to-end block (exit 2, SAFE-3, no spawn; in-root
   scripts run). Add `sh -c -` / `-co pipefail` cases to the quoting test and
   move `bash scripts/build.sh` to the new file (it now reads a real file).
   Confirm the new cases fail on `main`.
2. Tokenizer: redirection kinds and here-doc bodies. Analysis: `Ctx`, writes
   pre-pass, `scriptRefs` / `checkScript`, `trap`, `alias`, `shellArgs`.
3. Delta modifies REQ-plugins-087; plugins spec invariant (with the residual
   list), scenario, error rows and files list.
4. `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test`,
   `fledge lanes run verify --non-interactive`; differential script harness
   and the #226 fuzz against dash, `bash --posix` and bash.
