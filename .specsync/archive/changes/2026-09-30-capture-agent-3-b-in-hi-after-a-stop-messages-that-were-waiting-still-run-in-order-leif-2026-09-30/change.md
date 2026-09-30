---
id: capture-agent-3-b-in-hi-after-a-stop-messages-that-were-waiting-still-run-in-order-leif-2026-09-30
state: archived
type: documentation
base_commit: 1820fb4aa936182a4b7ca504e68ce8ada24851b1
---

# Capture AGENT-3.b in hi: after a stop, messages that were waiting still run, in order (Leif 2026-09-30)

## Intent

Capture AGENT-3.b in hi: after a stop, messages that were waiting still run, in order (Leif 2026-09-30)

## Affected Canonical Specs

- None

## Acceptance Criteria

- hi/agent.md holds AGENT-3.b under AGENT-3 with the exact wording Leif confirmed on 2026-09-30 (round 13 of the 2026-09-28 interview record: 'Stop and the queue: waiting messages still run in order after a stop'): 'After I stop a run, messages that were waiting still run, in order.' It was captured with the hi CLI (hi AGENT-3.b "..."), which also moved the INTENT.md index to 25 AGENT criteria; hi check passes; AGENT-3 and AGENT-3.a are unchanged; no invented criteria; no code, canonical spec or test change here.

## No-spec Rationale

Captures one Leif-confirmed criterion (AGENT-3.b) into hi/agent.md with the hi CLI (which also updates the INTENT.md index); no canonical spec, code or test change in this change. The build of AGENT-3.a/3.b and its REQ-discord-301/302 deltas are the sibling change a-message-sent-while-a-run-is-going-waits-for-it-and-stop-or-cancel-stops-the-run-waiting-messages-still-run-after.
