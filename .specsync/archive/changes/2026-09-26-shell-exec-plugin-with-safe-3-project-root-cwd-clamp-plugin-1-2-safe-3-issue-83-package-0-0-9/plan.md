---
change: shell-exec-plugin-with-safe-3-project-root-cwd-clamp-plugin-1-2-safe-3-issue-83-package-0-0-9
artifact: plan
---

# Plan

1. Add `plugins/shell/{clamp,commands,index}.ts` — Merlin lexical clamp + `shell-exec`.
2. Wire `loadShellPlugins` in `src/plugins/builtins.ts`.
3. Spec deltas: REQ-plugins-086..088 + REQ-cli-015; update plugins.spec.md files list.
4. Tests: `tests/shell.plugins.test.ts` + smoke list includes `shell-exec`.
5. Bump package `0.0.9`; CHANGELOG + STATUS; WATCH HI draft under docs/hi-drafts.
6. `specsync change check` + `fledge lanes run verify --non-interactive`.
