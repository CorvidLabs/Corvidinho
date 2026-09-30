---
module: agent
change: shell-exec-refuses-foot-guns-and-says-why-sed-i-or-edits-downloads-piped-into-a-shell-deletes-outside-the-worktree
---

# Delta: agent (the real-diff shell edit fixture writes through tee, SAFE-21)

## Modified

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
- End to end: the tool loop runs the real code-tier `shell-exec` with `printf broken | tee app.ts >/dev/null` in a temp git repo (a `>` edit is refused by SAFE-21, REQ-plugins-494, so the shell's own write goes through `tee`); its payload has no `filesChanged`, yet `runTask` runs verify once and ends `failed` with `filesChanged: ["app.ts"]`.
