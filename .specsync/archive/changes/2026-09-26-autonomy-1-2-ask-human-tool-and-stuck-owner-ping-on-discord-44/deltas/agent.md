---
module: agent
change: autonomy-1-2-ask-human-tool-and-stuck-owner-ping-on-discord-44
---

# Delta: agent (ask the human, AUTONOMY-1/2)

## Added

### REQUIREMENT REQ-agent-044

The tool loop SHALL offer an agent-level `ask-human` tool (argument
`question`) on tool/code tiers alongside the plugin catalog, and its system
prompt SHALL tell the model to call it when the task cannot proceed without a
human choice instead of guessing, inventing acceptance criteria, or claiming
done (AUTONOMY-1). The call SHALL NOT be dispatched as a plugin: a non-empty
question SHALL end the execute attempt with `ask: {reason: "clarify",
question}` and summary `Needs your input: <question>`; an empty question
SHALL be refused back to the model as a failed tool result.

`runTask` SHALL return state `blocked` (never `done`, verify not run,
`verifySkipped: true`) with the same `ask` when execute returns one, and SHALL
emit `StateChanged blocked`. When verification still fails after every retry,
the result SHALL stay `failed` (AGENT-4) and SHALL carry `ask: {reason:
"stuck", question}` with the question appended to the summary (AUTONOMY-2).
`TaskResult.ask` rides the existing `--json` / NDJSON `result`; `blocked` is a
valid NDJSON StateChanged value. The change is additive and the wire protocol
stays 2.

Acceptance Criteria
- ask-human is in the provider tool list on tool/code tiers, once, and never on the read tier.
- Calling ask-human ends the run with state `blocked`, `ask.reason` `clarify`, and no plugin dispatch.
- An empty question is refused to the model and the loop continues.
- Questions are trimmed, control characters dropped, capped at 1500 chars.
- Verify exhaustion stays `failed` and carries a `stuck` ask.
- `task run` text prints the question; `--json` / ndjson carry `result.ask`; blocked exits 0.
