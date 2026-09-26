---
change: files-edit-single-occurrence-replace-writes-new-literally-so-dollar-replacement-patterns-cannot-corrupt-the-file
artifact: tasks
---

# Tasks

- [x] Regression test fails before the fix (`$$` collapsed to `$`; `$'`, `$&` and `` $` `` expanded).
- [x] Single-occurrence files-edit uses a function replacer so `--new` is literal.
- [x] Regression test passes after the fix; `--replace-all` behavior unchanged.
- [x] Delta: Added REQ-plugins-237.
