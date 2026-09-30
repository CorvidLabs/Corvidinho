---
module: agent
change: it-asks-me-on-an-approve-card-before-touching-prod-or-deploys-or-making-a-channel-post-anything-else-it-just-does-and
---

# Delta: agent (one AUTONOMY-11 sentence in the tool loop's instructions)

## Added

### REQUIREMENT REQ-agent-097

Anything else inside its guardrails, it just does and tells me (AUTONOMY-11,
captured on main from Leif's 2026-09-28 interview).
`ASK_AGENT_SYSTEM_INSTRUCTIONS` (`src/agent/ask.ts`, in every tool-loop
system prompt) SHALL carry one sentence: anything inside its guardrails it
just does and then says what it did, because only prod or deploy contact and
channel posts need the owner's OK and the tool itself waits for it on the
Approve card (REQ-plugins-097) — so it never calls `ask-human` for
permission first and never repeats a call the owner denied. A must-ask
call's refusal (deny, lapse, worker, no owner) reaches the model as that
tool's result like any refusal; the loop is otherwise unchanged. While a call
waits, the live status SHALL say so: `progressFromFrame`
(`src/agent/events-ndjson.ts`) SHALL map a `Text` frame that starts with the
gate's wait line (`[operator] AUTONOMY-<n>: waiting for the owner's OK on an
Approve card`, `MUST_ASK_WAIT_TEXT_RE`) to the message `MUST_ASK_WAIT_STATUS`
("waiting for the owner's OK on an Approve card"), which the Discord thinking
status shows; every other `Text` frame SHALL still change nothing shown.

Acceptance Criteria
- `ASK_AGENT_SYSTEM_INSTRUCTIONS` contains the "Must-ask (AUTONOMY-9..11)" sentence and the tool loop's system message holds it.
- In one round a `files-write` runs with no card while a `discord-post-message` waits for the card; the owner's no reaches the model as `refused (AUTONOMY-10) … the owner denied it`.
- `progressFromFrame` shows the gate's wait line as "waiting for the owner's OK on an Approve card" and any other `Text` frame as nothing.
