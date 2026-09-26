---
change: autonomy-1-2-ask-human-tool-and-stuck-owner-ping-on-discord-44
artifact: design
---

# Design

Agent side (`src/agent/ask.ts`, new):

- `ask-human` is an agent-level tool, not a plugin. `withAskTool` appends its
  OpenAI tool definition (`{question: string}`) to the plugin catalog on
  tool/code tiers (read tier still sends no tools) and drops any plugin that
  shares the name.
- The tool loop intercepts the call: a non-empty question ends the execute
  attempt with `ExecuteResult.ask = {reason: "clarify", question}` and summary
  `Needs your input: <question>`; an empty question is refused back to the
  model as a failed tool result and the loop continues.
- `runTask`: an execute result with `ask` emits `StateChanged blocked` and
  returns state `blocked` (verify not run, `verifySkipped: true`). Verify
  exhaustion keeps state `failed` (AGENT-4) and adds `ask = {reason: "stuck"}`
  with the question appended to the summary.
- `AgentState` gains `blocked` (NDJSON parser + status label "needs input").
  `TaskResult.ask` rides the existing `result` frame. Additive: protocol
  stays 2; an older bridge drops the unknown state frame and shows the
  summary, which carries the question.
- CLI needs no change: text prints the summary, `--json` / ndjson carry
  `result.ask`; blocked exits 0 (failed still exits 1).

Discord side (`src/discord/ask-ping.ts`, new):

- `formatAskReply` builds the post: headline + owner mention on the first
  line (a length cut never drops the ping), the question quoted, stuck
  context (<=400 chars), optional reply hint. Model text is SAFE-6 scrubbed and
  `@everyone` / `@here` are defanged. `mentionUserIds` is `[owner]` or `[]`.
- Spawn client validates `result.ask` with `askFromUnknown`.
- Bridge mention path: an ask replaces the summary / `failed (exit N)` body,
  the thinking embed ends "Needs your input" (or failed "Stuck"), and the
  reply passes `mentionUserIds`; the live gateway turns that into
  `allowedMentions {parse: [], users, repliedUser: true}`. No owner means no
  mention and a logged warning (IDENTITY-3).
- Scheduler: `SchedulerService` takes `owner`; a tick with an ask posts the
  question with the schedule line as prefix and the owner mention.
- Ping dedupe: `askPingKey` (hex SHA-256 of reason + SAFE-6 scrubbed
  question) is stored in `schedules.ask_ping_key` (schema v7, column-only
  write via `ScheduleStore.setAskPingKey`) after a pinged post. A repeat with
  the same key posts the question with no mention and no warning. A clean run
  (ok, no ask) and `setStatus` (pause/resume) clear it; a failed run keeps it.
  Persisting it in SQLite keeps the dedupe across bridge restarts and a
  bridge + daemon sharing one data dir.
- `/work` (merged from #166): `openWorkPr` stops with `needs-input` when the
  run's result frame says `blocked`, before any repository, plugin or verify
  call — a run that asked a human is not done, so it is not shipped.

Alternatives rejected: a DM to the owner (not captured; DISCORD-5), a new
slash command (not captured), a protocol bump (the change is additive).
