---
change: files-edit-single-occurrence-replace-writes-new-literally-so-dollar-replacement-patterns-cannot-corrupt-the-file
artifact: plan
---

# Plan

1. Regression test in `tests/files.plugins.test.ts`: single-occurrence and `--replace-all` edits with `$$`, `$'`, `$&`, `` $` ``, `$1`, `$<n>` in `--new`; confirm the single-occurrence case fails on main.
2. Switch the single-occurrence replace to a function replacer in `plugins/files/commands.ts`.
3. Added REQ-plugins-237 (files-edit writes `--new` literally in both modes).
