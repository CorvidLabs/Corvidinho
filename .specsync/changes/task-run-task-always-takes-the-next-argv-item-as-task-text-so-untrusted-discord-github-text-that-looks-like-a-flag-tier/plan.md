---
change: task-run-task-always-takes-the-next-argv-item-as-task-text-so-untrusted-discord-github-text-that-looks-like-a-flag-tier
artifact: plan
---

# Plan

1. Make `--task` always consume the next argv item; `/s` on `--task=`.
2. Export `parseGlobalFlags`; add fixture tests.
3. Spec delta REQ-cli-015.
