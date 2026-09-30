---
module: discord
change: a-cli-task-run-in-a-git-repo-works-in-its-own-worktree-by-default-here-runs-it-in-my-checkout-session-worktree-1-a
---

# Delta: discord (the Discord spawn client passes --here — SESSION-WORKTREE-1.a)

## Modified

### REQUIREMENT REQ-discord-014

Discord/WATCH spawn agent clients SHALL build subprocess argv with
`buildCorvidinhoArgv` so `.ts` entrypoints always run under `bun`. When
`task run` stdout is present (ndjson result frame or legacy `--json`), the
Discord chat reply SHALL surface a parsed summary (state / verified /
attempts + summary) rather than dumping raw JSON. Spawns SHALL pass `--here` right after `task run`, so the run works in the
talk's worktree (the cwd given) and never makes a worktree of its own
(REQ-cli-122). Spawns SHALL NOT pass
`--no-verify` (the flag is removed and refused, REQ-cli-085) —
prove-before-done (AGENT-4 / FLEDGE-2 / AGENT-14) always applies; a run whose
real git diff is empty and that claimed no change ends with "no changes,
nothing to verify" and no lane (REQ-agent-003 / REQ-agent-085), so plain
chat stays fast. Fixture tests SHALL cover argv shape and summary parsing
without a live Discord token.

Acceptance Criteria
- `.ts` bin → `["bun", "--no-env-file", bin, "task", "run", ...]`; non-`.ts` → `[bin, ...]`.
- Spawn argv for Discord chat is `task run --here --task <prompt> --output ndjson` with **no** `--no-verify`.
- Valid result/json stdout → Discord body includes state and summary text.
- Unparseable stdout falls back to truncated stdout/stderr.
- No ProcessManager; allowlists unchanged; secrets out of repo.

### REQUIREMENT REQ-discord-073

The Discord spawn agent client SHALL run
`task run --here --task <prompt> --output ndjson` (`--here`, REQ-cli-122), read stdout line by
line while the child runs, and forward each frame's live state, current tool,
and token counts to `onStatus` so the thinking embed shows what the agent is
doing (AGENT-8 / DISCORD-3). The reply summary SHALL come from the stream's
`result` frame; when no result frame parses, the client SHALL fall back to
`summarizeTaskRunOutput` over the non-frame stdout, stderr and exit code.
Frame-shaped lines that do not match the bridge's protocol (or are malformed)
SHALL never become reply text; when the binary streamed another protocol and
no result frame parsed, the reply SHALL be a protocol-mismatch notice naming
both versions.
Token counts SHALL be the provider-reported running total when a `usage`
frame arrived, else the existing rough estimate from the summary length.
Because the bridge now depends on the stream, `CORVIDINHO_PROTOCOL_VERSION`
SHALL be `2` and DISCORD-10 lockstep SHALL refuse a binary reporting another
version.

Acceptance Criteria
- Fake-bin fixture printing ndjson drives `onStatus` with planning / tool / token updates in order.
- Summary equals `summarizeTaskResult` of the result frame; garbage lines and stderr do not break parsing.
- Missing result frame falls back to `summarizeTaskRunOutput`.
- A protocol-3 frame's tool output never reaches the reply; the reply is the protocol-mismatch notice.
- Spawn argv ends with `--output ndjson` (no `--json`) and has no `--no-verify`.
- `checkProtocolVersion` treats a protocol-1 binary as a mismatch; `--protocol-version` prints 2.
- Spawn argv is exactly `task run --here --task <prompt> --output ndjson` (REQ-cli-122).
