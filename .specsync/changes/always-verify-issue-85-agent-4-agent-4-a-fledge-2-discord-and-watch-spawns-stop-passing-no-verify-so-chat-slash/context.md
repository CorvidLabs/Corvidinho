---
change: always-verify-issue-85-agent-4-agent-4-a-fledge-2-discord-and-watch-spawns-stop-passing-no-verify-so-chat-slash
artifact: context
---

# Context

Issue #85 (Leif, G5: "Verify: always"). The Discord bridge (mention, `/session
start`, `/work`, schedule ticks) and WATCH spawned `task run --no-verify`, so any
change that started from chat or GitHub was never gated by the project verify
lane. That breaks two captured criteria:

- **AGENT-4** — it does not tell me the job is done until the project's verify
  lane has passed, or it tells me plainly that verification failed.
- **FLEDGE-2** — when the agent finishes a change, it runs the project's verify
  lane through Fledge.
- **AGENT-4.a** (retry with the failure output) already holds in `runTask`; it
  now applies to bridge runs too.

A second gap: the gate fired only on tool-reported `filesChanged`. `shell-exec`
(#83) edits files without reporting them, so such a run said done without the
lane even with the gate on.

Out of scope (issue drafts, **not** acceptance criteria — left for HI capture):
AGENT-14 (no way at all to skip verification: removing the operator
`--no-verify` flag and `verify_before_complete=false`) and AGENT-15 (git diff
replaces tool claims as the source of truth for what changed; a test count
above 0 from the lane output; deleted-test detection).

Chat-only runs: FLEDGE-2 ties the lane to "when the agent finishes a change",
and AGENT-4 is about not claiming a job done without the lane. A run that
changed nothing in the worktree (checked against the real worktree, not the
tool's word) has no change for the lane to judge, so it skips the lane and says
so plainly ("No files changed — nothing to verify."). That keeps plain chat fast
without a skip flag.

Coordination: #139 (NDJSON) merged first and rewrote the same spawn argv; this
change only drops the `--no-verify` element. #143 (`--task` value is always task
text) matters here: until it merges, a chat message that is literally
`--no-verify` could still be parsed as the flag.
