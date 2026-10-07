---
module: cli
change: session-5-a-each-configured-model-has-its-own-context-window-at-about-80-of-the-whole-prompt-a-model-writes-the-summary
---

# Delta: cli (task run --task-stdin carries the task and its replayed conversation — SESSION-5.a)

## Added

### REQUIREMENT REQ-cli-473

No process-argument ceiling SHALL cap a conversation run's prompt below the
model's window (SESSION-5.a; #72). `task run --task-stdin` (read only from
`task run`'s own args before `--`, `parseTaskStdin`, never from `--task`
text) SHALL read one JSON object `{ task, conversation? }` from stdin
(`readTaskStdin`, at most `TASK_STDIN_MAX_BYTES` 16 MiB, a sanity bound, not
a budget) and run `task` as the task text, handing `conversation` to
`createTaskExecute` (REQ-agent-473). `--task` together with `--task-stdin`,
or a payload that is not JSON, has no task text or a malformed conversation,
SHALL be refused before anything runs (exit 1). The run's `CondenseReport`
SHALL ride `TaskResult.conversation` (`--json` and the NDJSON `result`
frame; additive, protocol unchanged). The Discord and WATCH spawn clients
SHALL use `--task-stdin` (the payload on stdin) for a run that replays a
conversation and `--task` otherwise, and SHALL read the report back checked
against the replay they sent (`condenseReportFromUnknown`). No env var or
config key is added.

Acceptance Criteria
- A conversation over 128 KiB reaches the model whole through `--task-stdin` when the window holds it, and no summary call is made (`tests/agent.condense.test.ts`).
- At 80% of `ollama:fake-model=5000` the CLI run makes one summary call and its NDJSON result carries `conversation` (`by: "model"`, window 5000) with the task and latest instruction word for word in the answer call.
- `--task` with `--task-stdin`, and a non-JSON payload, exit non-zero with no model call.
- The Discord and WATCH clients pass `--task-stdin` (no `--task`, no task text in argv) and the task and conversation as JSON on stdin; a report folding the task, the latest instruction or a turn outside the replay keeps only the valid indexes, its summary scrubbed; with no conversation they pass `--task <prompt>` and read no report.
