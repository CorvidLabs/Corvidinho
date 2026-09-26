---
change: live-ndjson-event-stream-for-bridges-issue-73-agent-8-cli-7-discord-3-discord-10-task-run-output-ndjson-emits-one
artifact: docs
---

# Docs

- `docs/discord.md` DISCORD-3 section: the thinking embed reflects live state /
  current tool / token counts from `task run --output ndjson`; the reply
  summary comes from the stream's `result` line.
- CLI help: `--output text|json|ndjson` on `task run`.
- Spec Public API notes for agent (frame schema), cli (flag), discord / watch
  (spawn argv + onStatus). STATUS.md / CHANGELOG.md are batched by the release
  PR and are not edited here.
- PR ops note: protocol 1 -> 2, so restart the Discord bridge and the
  corvidinho binary checkout together.
