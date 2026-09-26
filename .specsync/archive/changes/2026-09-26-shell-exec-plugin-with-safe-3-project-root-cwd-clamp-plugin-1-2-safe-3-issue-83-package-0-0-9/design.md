---
change: shell-exec-plugin-with-safe-3-project-root-cwd-clamp-plugin-1-2-safe-3-issue-83-package-0-0-9
artifact: design
---

# Design

- Always clamp to `ctx.cwd` (Corvidinho plugin cwd is already project/worktree);
  always set `CORVIDINHO_PROJECT_ROOT` in child env (parallel to Merlin env).
- Conservative lexer only (`; & | newline ()`); no claim to defeat `eval $(…)`.
- Exit 2 on SAFE-3 refuse (distinct from command non-zero exit).
- `dangerous: true` + minTier 2 so non-interactive dogfood needs allowlist.
