---
change: safe-3-shell-exec-cd-clamp-checks-the-scripts-a-command-runs-in-a-shell-sourced-handed-to-a-shell-as-a-file-here-doc-or
artifact: tasks
---

# Tasks

- [x] Regression tests for scripts, stdin forms, self-written scripts, `trap`, `alias`, `sh -c -`, `-co pipefail` (unit + end to end, no spawn); new cases fail on `main`.
- [x] Tokenizer keeps redirection kinds and here-doc bodies; `fragParts` replaces `stripRedirections`.
- [x] Writes pre-pass, script lookup from every in-root cwd, script reading and checking with caps, final written-script pass.
- [x] `trap` actions checked like `eval`; alias definitions refuse; `shellArgs` reads `-`, option clusters and `-s`.
- [x] Delta modifies REQ-plugins-087; spec invariant (with residual list), scenario, error rows and files list updated.
- [x] specsync check, tsc, bun test, fledge verify green; differential script harness and fuzz against dash / bash clean.
