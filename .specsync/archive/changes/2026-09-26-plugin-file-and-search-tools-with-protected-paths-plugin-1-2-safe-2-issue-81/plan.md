---
change: plugin-file-and-search-tools-with-protected-paths-plugin-1-2-safe-2-issue-81
artifact: plan
---

# Plan

1. Add `plugins/files/` (path clamp, protected-path guard, read/write/edit/glob/list/delete)
2. Add `plugins/search/` (`search-grep` via system grep, path-clamped)
3. Wire loaders in `src/plugins/builtins.ts`
4. Specs delta REQ-plugins-081..084; tests happy + SAFE-2 deny
5. STATUS ROADMAP cut-order done → next M3 plugins; CHANGELOG; eager 0.0.6 after merge
6. SpecSync approve/check/review/finalize; `gh pr create`; squash-merge when green; tag/release; close #81
