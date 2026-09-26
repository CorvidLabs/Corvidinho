---
change: files-edit-single-occurrence-replace-writes-new-literally-so-dollar-replacement-patterns-cannot-corrupt-the-file
artifact: docs
---

# Docs

An inline comment in `plugins/files/commands.ts` explains why `--new` goes through a function replacer. The `files-edit` description already says "Exact string replace"; behavior now matches it. No user-facing docs change.
