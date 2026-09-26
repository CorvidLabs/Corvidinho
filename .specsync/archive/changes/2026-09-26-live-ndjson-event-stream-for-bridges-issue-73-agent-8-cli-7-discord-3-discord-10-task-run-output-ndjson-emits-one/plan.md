---
change: live-ndjson-event-stream-for-bridges-issue-73-agent-8-cli-7-discord-3-discord-10-task-run-output-ndjson-emits-one
artifact: plan
---

# Plan

1. Deltas for agent (REQ-agent-073), cli (REQ-cli-073), discord
   (REQ-discord-073), watch (REQ-watch-073); approve the definition.
2. `src/agent/events-ndjson.ts` + `AgentTokenUsage` type + agent index exports;
   add the file to `specs/agent/agent.spec.md` `files:`.
3. Usage capture in `src/agent/execute.ts` (`onUsage`).
4. `--output` flag + ndjson writer in `src/cli.ts`; help text.
5. `summarizeTaskResult` split in `src/agent/task-summary.ts`.
6. Discord + WATCH spawn clients on the stream; protocol bump 1 -> 2 with the
   constant owned by events-ndjson and re-exported by protocol-version.
7. Fixture tests; tsc, bun test, specsync check, commit, change check, audit,
   fledge verify; merge origin/main (PR #128 behavior kept); open the PR.
