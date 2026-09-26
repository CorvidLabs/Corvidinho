---
change: live-ndjson-event-stream-for-bridges-issue-73-agent-8-cli-7-discord-3-discord-10-task-run-output-ndjson-emits-one
artifact: tasks
---

# Tasks

- [x] Deltas REQ-agent-073 / REQ-cli-073 / REQ-discord-073 / REQ-watch-073 + approve
- [x] src/agent/events-ndjson.ts (frames, redaction, writer, parser, stream reader, progress)
- [x] AgentTokenUsage + onUsage running totals in execute
- [x] task run --output text|json|ndjson in src/cli.ts (--json unchanged)
- [x] summarizeTaskResult split in task-summary
- [x] Discord + WATCH spawn clients consume ndjson and drive onStatus
- [x] CORVIDINHO_PROTOCOL_VERSION 1 -> 2 + protocol tests updated
- [x] Fixture tests (serializer, redaction, parser, fake-bin spawn, --json unchanged, usage)
- [x] Spec files lists + docs/discord.md note
- [x] tsc / bun test / specsync check / change check / audit / fledge verify green
