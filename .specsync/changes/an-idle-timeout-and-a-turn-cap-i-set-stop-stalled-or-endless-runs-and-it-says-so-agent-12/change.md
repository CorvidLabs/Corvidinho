---
id: an-idle-timeout-and-a-turn-cap-i-set-stop-stalled-or-endless-runs-and-it-says-so-agent-12
state: verifying
type: feature
base_commit: aeb2de3407acd0990897121ac68caf1553be0118
---

# An idle timeout and a turn cap I set stop stalled or endless runs, and it says so (AGENT-12)

## Intent

An idle timeout and a turn cap I set stop stalled or endless runs, and it says so (AGENT-12)

## Affected Canonical Specs

- `agent`
- `cli`
- `discord`
- `watch`
- `plugins`

## Acceptance Criteria

- AGENT-12 (captured on main from Leif's 2026-09-28 interview, round 2) holds on every surface: CORVIDINHO_MAX_TURNS (optional, a positive whole number, default 8 = today's maxToolRounds) caps model/tool rounds per execute attempt so AGENT-4.a verify retries are kept, the capped attempt ends with its best prose so far (AGENT-9) and TaskResult.stopReason is turn-cap only when the final attempt hit it; CORVIDINHO_IDLE_TIMEOUT_MS (optional, default 600000) is a per-run watchdog reset by every run event (what the CLI prints or streams), tool process output (spawnCapped) and verify-lane output, held while a model call is in flight, while a delegate or council worker runs (workers inherit both limits) and while the run waits on an Approve card (#316/#319/#334 waits through ApprovalStore.waitForDecision); with no output for that long the run's abort signal kills tool and verify-lane process trees (reused proc-group kill) and the run ends failed (not cancelled, exit 1) with stopReason idle-timeout, a one-line result error 'Stopped: no output for 10 minutes (idle timeout).' (the field DISCORD-3.b reads) that also leads its summary; Discord shows only stopped=turn-cap / stopped=idle-timeout in the footer and thinking plumbing (formatTaskPlumbing), never in the channel body (AGENT-9, DISCORD-3.a); WATCH comments and the CLI's human output get a plain turn-cap note; an ignored setting is said in one operator line; both are documented in --help and .env.example with today's behaviour as default; tests/agent.limits.test.ts fails on the base sources and passes on the branch

## No-spec Rationale

Not applicable
