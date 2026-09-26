---
change: task-run-task-always-takes-the-next-argv-item-as-task-text-so-untrusted-discord-github-text-that-looks-like-a-flag-tier
artifact: research
---

# Research

- Bridge argv (src/discord/agent-client.ts, src/watch/agent-client.ts):
  `task run --no-verify --task <prompt> --json` — the prompt is untrusted.
- Before the fix, `parseGlobalFlags(["task","run","--task","--tier=code"])`
  returned `tier: "code"` and no task text.
