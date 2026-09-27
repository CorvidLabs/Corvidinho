---
module: agent
change: task-run-offers-allowlisted-dangerous-tools-to-the-model-a-dangerous-plugin-enters-the-catalog-only-when-corvidinho
---

# Delta — agent (task run offers allowlisted dangerous tools; non-git gate fails closed after unreported edits)

## Modified

### REQUIREMENT REQ-agent-009

The system SHALL accept capability tier `read|tool|code` via `--tier` or `CORVIDINHO_LLM_TIER` (default `tool`) so read-shaped work gets no tools and tool/code tiers filter plugins by `minTier` (AGENT-5). The default tool catalog SHALL omit dangerous plugins the run's allowlist does not name (REQ-agent-501); runtime SAFE-1 SHALL still apply when dangerous tools are included. The effective tier (`--tier` over `CORVIDINHO_LLM_TIER`) SHALL also select the model the run calls (REQ-agent-079), so read-shaped work can stay on a cheaper model than tool and code work.

Acceptance Criteria
- read → no tools in chat request.
- tool/code → buildOpenAiTools filters by minTier; dangerous omitted by default.
- A read run sends the read model and a code run the code model; the `--tier` / `createTaskExecute` `tier` override, not `CORVIDINHO_LLM_TIER`, picks it.
- With an empty allowlist the catalog holds no dangerous plugin; an allowlisted dangerous plugin whose `minTier` is above the run's tier (e.g. `files-delete` at tool tier) is still left out (REQ-agent-501).

### REQUIREMENT REQ-agent-128

The LLM tool loop SHALL only dispatch tool calls whose name is in the catalog
offered for the current run (capability tier and danger filtered, AGENT-5).
Any other registered plugin name requested by the model SHALL be answered with
a refused tool result and SHALL NOT be executed, regardless of interactive
mode or allowlist (SAFE-1).

Acceptance Criteria
- A registered dangerous plugin not in the offered catalog is refused, not run, even interactive and allowlisted.
- Offered tools still run through `runPlugin` with SAFE-1 gating unchanged.
- An unlisted `danger-ping` in an interactive run (which `runPlugin` alone would run) is refused as not offered; an allowlisted `shell-exec` at code tier in an interactive run is refused as not offered and its command never runs (REQ-agent-501).

### REQUIREMENT REQ-agent-112

When a task run's catalog may include dangerous tools (`includeDangerous`),
`createTaskExecute` SHALL load the project's Fledge plugins (cwd = task cwd,
env = run env) before building the tool catalog, so Fledge commands can be
offered and called as tools under the usual tier filter, catalog-only
dispatch and SAFE-1 allowlist (FLEDGE-4). The default catalog (dangerous
omitted) SHALL NOT spawn fledge. `buildOpenAiTools` SHALL build each tool with
the exported `toolDefForEntry`, which is also what the schema-cost view
measures (FLEDGE-5); the tool definitions sent are unchanged. The catalog
may also include a Fledge command when the run's allowlist names one
(`fledge-<command>`, REQ-agent-501): `createTaskExecute` SHALL then load the
project's Fledge plugins the same way, and a run whose allowlist names no
`fledge-*` command (and without `includeDangerous`) SHALL NOT spawn fledge
(PLUGIN-3).

Acceptance Criteria
- includeDangerous + code tier + allowlist: the first request offers `fledge-hello`; the model's call runs the fake fledge and the ToolResult succeeds with the plugin output.
- Default catalog: no `fledge-*` tool is offered and none is registered.
- Existing tool-loop tests pass unchanged.
- Allowlist `["fledge-hello"]` at code tier without includeDangerous: the first request offers `fledge-hello` and the model's call runs the fake fledge successfully.
- An allowlist naming only `github-pr-review`: fledge is never spawned, no `fledge-*` tool is offered or registered.

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
behaviour before this requirement), except that a run that called a tool
whose file edits no result reports SHALL verify anyway (REQ-agent-502). When the start snapshot was read but a
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
- A non-git cwd whose run called no Fledge command, shell or runner (e.g. only an allowlisted `github-pr-review`) still skips verify; one that called an allowlisted Fledge command runs verify (REQ-agent-502).
- A tracker whose diff cannot be read makes verify run and emits the "could not read the git working-tree diff" `Text` event.
- A tracker whose diff lists 30000 paths adds 1000 of them to `filesChanged` after the tool-reported ones, the note counts all 30000, and the NDJSON `result` line read in 64 KiB chunks still parses with the "Verification failed" summary.
- With the content budget spent, an already-dirty file left alone is not reported and an edit to it is (stat compare).
- With the gate off no snapshot is taken.
- End to end: the tool loop runs the real code-tier `shell-exec` with `printf broken > app.ts` in a temp git repo; its payload has no `filesChanged`, yet `runTask` runs verify once and ends `failed` with `filesChanged: ["app.ts"]`.

## Added

### REQUIREMENT REQ-agent-501

Allowlisted dangerous tools in the task-run catalog (CLI-3 / SAFE-1,
GITHUB-1/3, ROLES-CHAT-4, PLUGIN-3). `buildOpenAiTools` SHALL take an optional
`allowlist` and SHALL offer a dangerous plugin only when that allowlist names
it (exact name) or `includeDangerous` is set (a test seam no product caller
sets). `createTaskExecute` SHALL pass the run's effective allowlist (its
`allowlist` option, else `CORVIDINHO_ALLOWLIST`, which `task run` passes), so
for every `task run` (local CLI, Discord, `/session start`, `/work`,
schedules, WATCH, delegate workers) a dangerous plugin enters the model's
catalog only when the operator allowlisted it; an unlisted dangerous plugin
stays out and a call to it is refused as not offered (REQ-agent-128).
`shell-exec`, `node-exec`, `python-exec` and `cargo-exec`
(`SAFE3_PENDING_TOOLS`) SHALL NOT be offered from the allowlist, even when
named, until the SAFE-3 decision on the shell and runners is taken; they
still run through `corvidinho plugins run`. The tier filter (`minTier`), the
ROLES-CHAT-2 role filter (a non-ADMIN role session gets no dangerous or
mutating tool, whatever the allowlist), the SAFE-9 autonomous filter,
catalog-only dispatch and the SAFE-1 / SAFE-4 / SAFE-5 / GITHUB-6 runtime
gates in `runPlugin` and the handlers SHALL be unchanged. With an empty
allowlist the catalog SHALL be exactly as before. No env var, config key,
flag, slash command or schema is added.

Acceptance Criteria
- At tool tier, an allowlist naming `github-issue-create`, `github-issue-comment`, `github-pr-create`, `github-pr-review`, `memory-forget` and `memory-override` offers all six; `danger-ping`, `web-fetch` and `discord-post-message` (dangerous, not named) are not offered; with no allowlist no dangerous plugin is offered.
- Every dangerous tool offered at tool or code tier is one the allowlist names.
- `files-delete` allowlisted is offered at code tier and not at tool tier.
- An allowlist naming `shell-exec`, `node-exec`, `python-exec`, `cargo-exec` and `files-delete` at code tier offers `files-delete` and none of the four.
- `actingIsAdmin: false` with every dangerous plugin allowlisted offers no dangerous or mutating tool.
- `task run` path (`createTaskExecute` without an `allowlist` option, non-interactive, GitHub dry run): with `CORVIDINHO_ALLOWLIST=github-pr-review` the model is offered `github-pr-review`, its call succeeds as a dry run, and its call to the unlisted `github-issue-create` is refused as not offered.
- An ADMIN role session (owner) with that allowlist is offered and runs `github-pr-review`; a non-ADMIN role session with the same allowlist is not offered it and no call succeeds.

### REQUIREMENT REQ-agent-502

Non-git verify gate after unreported edits (AGENT-4). A tool whose file edits
no tool result reports (`editsFilesUnreported`: a Fledge command, whose
`origin` starts with `fledge:`, and the `SAFE3_PENDING_TOOLS` shell and
runners) that the tool loop dispatched from the offered catalog SHALL be named
in the attempt's `ExecuteResult.unreportedEditTools` (absent when none ran).
`runTask` SHALL union these names across attempts and, when the verify gate is
on, no git snapshot is available (the cwd is not in a git work tree, or the
start snapshot could not be read), no file was reported and a name was
recorded, SHALL run the verify lane anyway (fail closed) and emit one `Text`
event per such attempt starting `Verify gate: no git working tree to diff`
that names the tools; the run then ends `done` only when verify passes, and
otherwise retries and fails plainly. A run in a git work tree keeps the real
diff (REQ-agent-085); a non-git run that called only tools that report their
files or change no project files (GitHub, memory, Discord) still skips verify;
`--no-verify` is unchanged. No env var, config key, flag, slash command or
schema is added.

Acceptance Criteria
- Non-git project, allowlisted `fledge-hello` that writes `app.ts` and reports no files: verify runs once in the project dir, the run ends `failed` with `verified=false` and `filesChanged: []`, and the `Text` note names `fledge-hello`.
- The same with `includeDangerous` (every dangerous tool offered) also runs verify and fails.
- Non-git project whose only tool call was an allowlisted `github-pr-review` (dry run, success): verify is skipped and the run ends `done`.
- The verify gate off: the Fledge run ends `done` with verify skipped.
- The execute result of an attempt that ran `fledge-hello` has `unreportedEditTools: ["fledge-hello"]`.
