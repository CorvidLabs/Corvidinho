---
module: cli
change: an-idle-timeout-and-a-turn-cap-i-set-stop-stalled-or-endless-runs-and-it-says-so-agent-12
---

# Delta: cli (task run reads the turn cap and idle timeout I set and says when one stopped the run — AGENT-12)

## Added

### REQUIREMENT REQ-cli-125

`corvidinho task run` SHALL apply the run limits I set (AGENT-12), on every
surface, since the Discord bridge, `github watch`, the daemon, schedules and
delegate / council workers all run it as a child with the parent's env:

- `CORVIDINHO_MAX_TURNS` (optional): model/tool rounds per execute attempt,
  read by `createTaskExecute` (REQ-agent-312); default 8.
- `CORVIDINHO_IDLE_TIMEOUT_MS` (optional): passed to `runTask` as
  `idleTimeoutMs` (REQ-agent-244); default 600000 (10 minutes).
- A set value that is not a positive whole number SHALL be ignored (the
  default applies) and said once as a `Text` event before the run —
  `[operator] AGENT-12: <KEY> is not a positive whole number, so the default
  <N> is used.` — never echoing the value.
- Every event the CLI prints or streams SHALL count as the run's activity
  (`noteIdleActivity` in the event handler).
- `--json` / ndjson results SHALL carry `stopReason` (`turn-cap` /
  `idle-timeout`) and, for an idle timeout, `error` (additive fields; the
  protocol version is unchanged). An idle-timed-out run SHALL exit 1 (failed,
  not cancelled). In text mode a run with `stopReason: "turn-cap"` SHALL
  print `TURN_CAP_NOTE` (`Stopped: it reached the turn cap before it
  finished, so this is its best answer so far.`) on the line after its
  summary; an idle-timed-out run's summary already starts with its line.
- `--help` SHALL list both keys with their defaults, and `.env.example`
  SHALL document both (commented out at their defaults).

Acceptance Criteria
- `task run --here --task …` with `CORVIDINHO_MAX_TURNS=2` and a fake model that always calls `files-list` sends 2 model requests, exits 0 and prints `still listing` then `TURN_CAP_NOTE`, with `[operator] Stopped after 2 tool rounds` on stderr; with `--output ndjson` the `result` frame is `state: "done"`, `stopReason: "turn-cap"`, `summary: "still listing"`.
- `CORVIDINHO_MAX_TURNS=lots` and `CORVIDINHO_IDLE_TIMEOUT_MS=off` each give their `[operator] AGENT-12: …` line on stderr (default 8 / 600000) and the value is not printed.
- `CORVIDINHO_IDLE_TIMEOUT_MS=4000` with a fake verify lane that hangs silently: exit 1, `result` frame `failed`, `cancelled: false`, `stopReason: "idle-timeout"`, `error` and summary head `Stopped: no output for 4 seconds (idle timeout).`, the fake `fledge` and its lane task gone.
- `--help` names `CORVIDINHO_MAX_TURNS` and `CORVIDINHO_IDLE_TIMEOUT_MS`; `.env.example` has `# CORVIDINHO_MAX_TURNS=8` and `# CORVIDINHO_IDLE_TIMEOUT_MS=600000`.
- Fixture: `tests/agent.limits.test.ts`.
