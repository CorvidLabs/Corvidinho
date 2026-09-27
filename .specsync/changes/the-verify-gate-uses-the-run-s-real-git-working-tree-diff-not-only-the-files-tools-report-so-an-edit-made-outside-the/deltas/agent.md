---
module: agent
change: the-verify-gate-uses-the-run-s-real-git-working-tree-diff-not-only-the-files-tools-report-so-an-edit-made-outside-the
---

# Delta — agent (the verify gate uses the run's real git working-tree diff)

## Added

### REQUIREMENT REQ-agent-085

Real-diff verify gate (AGENT-4, issue #85). When the verify gate is on,
`runTask` SHALL snapshot the run's git project before the first attempt:
`HEAD`, `git status --porcelain=v1 -z --untracked-files=all --no-renames`
and a fingerprint of every dirty or untracked path (SHA-256 of the file up
to 4 MiB while a 64 MiB content budget lasts, stat identity past either, link
target for a symlink, never followed). Later diffs SHALL fingerprint again
only the paths dirty at the start (with the same kind); a path that became
dirty or untracked is a change by itself. The
project root is the nearest directory at or above the run cwd that holds
`.git` (as in REQ-agent-084); a cwd below the root SHALL read only its own
subtree and report paths relative to the cwd. After each attempt that ends
without an ask, a provider error or an abort, and before deciding whether to
verify, `runTask` SHALL add to `filesChanged` every path that differs from the
snapshot: paths changed between the start `HEAD` and the current `HEAD`
(including a first commit on an unborn `HEAD`), paths that became dirty or
untracked, paths already dirty whose status or fingerprint changed, and
dirty paths that became clean. These join the tool-reported files and the
union across attempts (REQ-agent-242), so an edit no tool reported
(code-tier `shell-exec`, a delegate worker, a commit made through a shell)
runs the verify lane and the run ends `done` only when it passes, or fails
plainly. Paths dirty before the run and left untouched, and gitignored paths,
SHALL NOT count. When the cwd is not inside a git work tree, or the start
snapshot cannot be read, the gate SHALL use tool-reported files only (the
behaviour before this requirement). When the start snapshot was read but a
later diff cannot be, the gate SHALL fail closed: verify runs and one `Text`
event says the diff could not be read. When the real diff adds paths no tool
reported, one `Text` event SHALL say how many and name up to five. At most
`WORKSPACE_DIFF_MAX_FILES` (1000) real-diff paths per run SHALL join
`filesChanged` (the note still gives the full count and how many were
listed), so the NDJSON `result` line stays under the parser's line cap and a
bridge still gets the summary; the gate is unaffected because `filesChanged`
is non-empty either way. An empty
real diff with no tool-reported files SHALL still skip verify with
`verifySkipped=true` (REQ-agent-003). `--no-verify` / `verify_before_complete
= false` SHALL take no snapshot. Git SHALL run read-only through `runGit`
(argv, no shell, hooks off, repo-locating env stripped, discovery clamped to
the root, optional locks off) with fsmonitor off, and fingerprints are hashed
in process: nothing is written to the index or object store. No flag,
environment variable, config key or slash command is added. `RunTaskOptions`
gains a `workspaceDiff` test seam (like `verifyRunner`), not a product
surface.

Acceptance Criteria
- In a temp git repo, an attempt that rewrites a tracked file outside the file tools and reports `filesChanged: []` runs verify; a failing lane ends `failed` (`verified=false`, `verifySkipped=false`, `filesChanged` names the file, no `done` state) and a passing lane ends `done` with `verified=true`.
- A new untracked file, a deleted tracked file, a same-size edit to a file already ` M` before the run, a commit made through a shell (clean tree, `HEAD` moved) and a first commit on an unborn `HEAD` each run verify and appear in `filesChanged`.
- A retry after a failed verify that edits only through a shell is verified again and gets the failure output as feedback (AGENT-4.a).
- A run whose cwd is a subdirectory of the repo counts an edit inside the cwd (reported relative to the cwd) and not one outside it.
- Dirt present before the run and left untouched, a change only under a gitignored path, and a non-git cwd each skip verify (`verifySkipped=true`) when no tool reported files.
- A tracker whose diff cannot be read makes verify run and emits the "could not read the git working-tree diff" `Text` event.
- A tracker whose diff lists 30000 paths adds 1000 of them to `filesChanged` after the tool-reported ones, the note counts all 30000, and the NDJSON `result` line read in 64 KiB chunks still parses with the "Verification failed" summary.
- With the content budget spent, an already-dirty file left alone is not reported and an edit to it is (stat compare).
- With the gate off no snapshot is taken.
- End to end: the tool loop runs the real code-tier `shell-exec` with `printf broken > app.ts` in a temp git repo; its payload has no `filesChanged`, yet `runTask` runs verify once and ends `failed` with `filesChanged: ["app.ts"]`.

## Modified

### REQUIREMENT REQ-agent-002

When `verify_before_complete` is enabled and the run changed files (reported by a tool, or in the run's real git working-tree diff per REQ-agent-085), completion SHALL run `fledge lanes run verify --non-interactive`. Pass → `verified=true`. Fail with retries remaining → re-enter executing with verifier output. Exhausted retries → terminal failure with `verified=false` (AGENT-4 / AGENT-4.a / FLEDGE-2). The default runner SHALL spawn fledge with the parent's env minus the delegate worker drop list (`DISCORD_*`, `GITHUB_TOKEN`, `GH_TOKEN`, `CORVIDINHO_AUDIT_HMAC_KEY` and every `CORVIDINHO_ACTING_*` key) and the LLM API keys (`CORVIDINHO_LLM_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`), keeping every other inherited key, so tests the agent wrote never see operator secrets (SAFE-6).

Acceptance Criteria
- Mock verify fail then pass within max_retries yields `verified=true` and a second execute call that receives feedback.
- Exhausted retries yield `verified=false` and failed state.
- Default runner invokes fledge with `lanes run verify --non-interactive`.
- An attempt whose execute result reports no files but that changed the git working tree (REQ-agent-085) runs verify: done with `verified=true` only on a pass, otherwise retried and then failed.
- A process with `DISCORD_TOKEN`, `DISCORD_BOT_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `CORVIDINHO_LLM_API_KEY`, `CORVIDINHO_AUDIT_HMAC_KEY` and `CORVIDINHO_ACTING_*` set runs the default runner: the fledge child's env has none of those keys or values and keeps the rest (PATH, HOME, `CORVIDINHO_DATA_DIR`, other keys).

### REQUIREMENT REQ-agent-008

The system SHALL run an interruptible OpenAI-compatible tool loop when an LLM API key is set and the capability tier is `tool` or `code`: it SHALL expose non-dangerous registered plugins as `tools`, SHALL dispatch `tool_calls` via `runPlugin` under SAFE-1 non-interactive deny unless allowlisted, SHALL emit `ToolCall` and `ToolResult` events, SHALL stop promptly on AbortSignal (AGENT-3), and SHALL collect the execute result's `filesChanged` only when a tool result reports them so prove-before-done stays honest (AGENT-4). Tool-reported `filesChanged` is a lower bound for the verify gate, not the whole of it: `runTask` also adds the run's real git working-tree diff (REQ-agent-085).

Acceptance Criteria
- Mock HTTP fixture: tool_call → plugin runs → final text summary.
- Dangerous plugin without allowlist → ToolResult success=false under non-interactive.
- Aborted signal mid-loop returns without claiming success completion of further rounds.
- The execute result's filesChanged is empty unless a tool payload includes filesChanged.
- A code-tier `shell-exec` edit (its payload has no filesChanged) still reaches the verify gate through the real diff: `runTask` runs verify and never ends done on a failed lane (REQ-agent-085).
