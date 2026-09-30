---
module: watch
change: verification-can-t-be-skipped-and-the-real-diff-since-the-talk-started-decides-what-changed-agent-14-agent-15-agent-15
---

# Delta: watch (WATCH runs share the one verify gate, with no skip — AGENT-14, AGENT-15)

## Modified

### REQUIREMENT REQ-watch-006

WATCH `createSpawnAgentClient` SHALL spawn via `buildCorvidinhoArgv` so a
`.ts` corvidinho bin is always invoked with `bun` (never posix_spawn alone).
Spawns SHALL NOT pass `--no-verify` (the flag is removed and refused,
REQ-cli-085) — prove-before-done (AGENT-4 / FLEDGE-2 / AGENT-14) always
applies to ingress runs; a run whose real diff is empty and that claimed no
change ends with "no changes, nothing to verify" inside the agent loop
(REQ-agent-003 / REQ-agent-085). Fixture tests SHALL cover argv shape.

Acceptance Criteria
- `.ts` → bun-prefixed argv; binary path unchanged when not `.ts`.
- Spawn argv is `task run --task <prompt> --output ndjson` with **no** `--no-verify`.
- No ProcessManager; allowlists unchanged.

### REQUIREMENT REQ-watch-073

The WATCH spawn agent client SHALL run
`task run --task <prompt> --output ndjson`, read stdout line by
line, forward live state / current tool / token totals to an optional
`onStatus` callback (AGENT-8), and take the summary from the stream's `result`
frame, falling back to `summarizeTaskRunOutput` when no result frame parses.
No new GitHub-visible surface is added.

Acceptance Criteria
- Fake-bin fixture printing ndjson drives the WATCH `onStatus` and returns the result-frame summary.
- Missing result frame falls back to `summarizeTaskRunOutput`.
- Spawn argv ends with `--output ndjson` (no `--json`) and has no `--no-verify`.

### REQUIREMENT REQ-watch-085

WATCH `createSpawnAgentClient` SHALL always hold ingress runs to the
prove-before-done gate (AGENT-4 / FLEDGE-2 / AGENT-14): spawn argv MUST NOT
include `--no-verify` (the flag is removed and refused, REQ-cli-085), and no
project `fledge.toml` key turns the gate off (REQ-agent-003). WATCH runs
reach the same gate as chat, schedules and `/work`. Same as Discord: the real
git diff decides what changed (AGENT-15), so a run that changed the git
working tree, or claimed a change git does not show, is verified before done
(REQ-agent-085), and a run whose real diff is empty and that claimed nothing
ends with "no changes, nothing to verify" (REQ-agent-003). Package
**0.0.13**. Fixture tests without live tokens.

Acceptance Criteria
- WATCH spawn argv never includes `--no-verify`.
- Package `0.0.13`; docs/WATCH.md updated.
- Fixture tests + SpecSync + fledge verify green.
- A run that changed the git working tree without a tool reporting it is verified before done; a run with an empty real diff and no tool claim ends with the "no changes, nothing to verify" note (REQ-agent-003 / REQ-agent-085).
