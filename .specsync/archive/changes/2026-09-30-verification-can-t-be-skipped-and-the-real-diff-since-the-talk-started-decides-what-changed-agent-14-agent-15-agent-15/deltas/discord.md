---
module: discord
change: verification-can-t-be-skipped-and-the-real-diff-since-the-talk-started-decides-what-changed-agent-14-agent-15-agent-15
---

# Delta: discord (chat, schedules and /work share the one verify gate; a new talk worktree starts verified; the talk base helper is shared — AGENT-14, AGENT-15.a)

## Modified

### REQUIREMENT REQ-discord-001

The system SHALL start a session stub with a stable session id when the bot is @mentioned in an allowlisted channel (DISCORD-1). The stub MAY spawn `corvidinho task run` (or echo), which always holds the run to the verify gate (AGENT-14, REQ-cli-085); it SHALL NOT port ProcessManager.

Acceptance Criteria
- `routeMessage` on mention in allowed channel returns `kind: "start_session"` with new session id.
- Session stub recorded in SessionStore; no ProcessManager.

### REQUIREMENT REQ-discord-014

Discord/WATCH spawn agent clients SHALL build subprocess argv with
`buildCorvidinhoArgv` so `.ts` entrypoints always run under `bun`. When
`task run` stdout is present (ndjson result frame or legacy `--json`), the
Discord chat reply SHALL surface a parsed summary (state / verified /
attempts + summary) rather than dumping raw JSON. Spawns SHALL NOT pass
`--no-verify` (the flag is removed and refused, REQ-cli-085) —
prove-before-done (AGENT-4 / FLEDGE-2 / AGENT-14) always applies; a run whose
real git diff is empty and that claimed no change ends with "no changes,
nothing to verify" and no lane (REQ-agent-003 / REQ-agent-085), so plain
chat stays fast. Fixture tests SHALL cover argv shape and summary parsing
without a live Discord token.

Acceptance Criteria
- `.ts` bin → `["bun", "--no-env-file", bin, "task", "run", ...]`; non-`.ts` → `[bin, ...]`.
- Spawn argv for Discord chat is `task run --task <prompt> --output ndjson` with **no** `--no-verify`.
- Valid result/json stdout → Discord body includes state and summary text.
- Unparseable stdout falls back to truncated stdout/stderr.
- No ProcessManager; allowlists unchanged; secrets out of repo.

### REQUIREMENT REQ-discord-073

The Discord spawn agent client SHALL run
`task run --task <prompt> --output ndjson`, read stdout line by
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

### REQUIREMENT REQ-discord-085

Discord `createSpawnAgentClient` SHALL always hold chat/schedule runs to the
prove-before-done gate (AGENT-4 / FLEDGE-2 / AGENT-14): spawn argv MUST NOT
include `--no-verify` (the flag is removed and refused, REQ-cli-085), and no
project `fledge.toml` key turns the gate off (REQ-agent-003). Chat, button
resumes, `/session`, `/work` and schedule runs all reach the one gate of
`task run`. A run whose real diff is empty and that claimed no change ends
with "no changes, nothing to verify" (honest `verifySkipped`); when the
run's git working tree changed (REQ-agent-085) or a tool claimed a change
git does not show, `fledge lanes run verify` runs before done.
`ensureTalkWorkspace` SHALL write the verified marker into a new talk
worktree's own git dir, so a new talk's first run starts from its own
snapshot; a later run in that worktree after one that did not end `done`
verifies every edit since the talk started (AGENT-15.a, REQ-agent-015).
The talk base (`resolveBase`: the remote's default branch, else `main`, and
HEAD's merge-base with it) lives in `src/worktree/base.ts`, shared by the
`/work` PR path (REQ-discord-088) and the verify gate. Package version SHALL
bump to **0.0.13**. Fixture tests without live Discord.

Acceptance Criteria
- Discord spawn argv never includes `--no-verify`.
- Package `0.0.13`; docs/STATUS/CHANGELOG updated.
- A run that changed the git working tree without a tool reporting it is verified before done; a run with an empty real diff and no tool claim ends with the "no changes, nothing to verify" note (REQ-agent-003 / REQ-agent-085).
- A talk worktree made by `ensureTalkWorkspace` holds the verified marker in its own git dir (`talkWorktreeGitDir`), and its first run that changes nothing has nothing to verify; after that run ends blocked with an edit, the next run there verifies the edit (REQ-agent-015).
- The `/work` PR tests still find the base and merge-base through the shared `resolveBase`.
- Fixture tests + SpecSync + fledge verify green.
