---
change: plugin-argv-keeps-tokens-that-start-with-files-write-content-files-edit-strings-shell-exec-command-flags-search-grep
artifact: plan
---

# Plan

1. Regression test `tests/plugins.argv-dashes.test.ts` (fails on main).
2. Shared `parseArgv` in `plugins/files/argv.ts`; switch files-* and search-grep.
3. files-write empty-over-non-empty guard with `--allow-empty`.
4. shell-exec leading-options parser.
5. Delta REQ-plugins-243, spec files list, SpecSync check, verify lane.
