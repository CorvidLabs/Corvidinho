---
change: task-run-task-always-takes-the-next-argv-item-as-task-text-so-untrusted-discord-github-text-that-looks-like-a-flag-tier
artifact: design
---

# Design

- `--task` consumes the next argv item unconditionally (when present).
- `--task=TEXT` matches across newlines (`/s`), so multi-line text is kept.
- `parseGlobalFlags` is exported for unit tests; behavior of other flags is
  unchanged. A trailing `--task` with no value leaves task text unset.
