# Lesson bundle — the-verify-gate-uses-the-run-s-real-git-working-tree-diff-not-only-the-files-tools-report-so-an-edit-made-outside-the

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: The verify gate uses the run's real git working-tree diff, not only the files tools report, so an edit made outside the file tools is verified before done (AGENT-4, #85)
- **Kind**: BugFix
- **Specs**: agent, discord, watch
- **Paths**: src/agent/workspace-diff.ts, src/agent/loop.ts, src/agent/types.ts, src/agent/index.ts, src/discord/agent-client.ts, src/watch/agent-client.ts, tests/agent.loop.test.ts, tests/agent.tool-loop.test.ts, docs/discord.md
- **Acceptance**: With the verify gate on, runTask snapshots the run's git project before the first attempt (HEAD, git status with untracked files, content fingerprints of dirty paths) and after each attempt adds every path that differs from that snapshot to filesChanged, so an edit no tool reported (code-tier shell-exec, a delegate worker, a commit made through a shell, a new untracked file, a deleted file, a further edit to a file already dirty, a first commit on an unborn HEAD) runs the verify lane and the run ends done only on a pass or fails plainly; dirt present before the run and left untouched, gitignored paths, and a non-git cwd keep today's behaviour (tool-reported files only; empty ⇒ verifySkipped=true); a cwd below the repo root reads only its subtree and reports cwd-relative paths; a diff git cannot read after a good snapshot fails closed (verify runs); --no-verify / verify_before_complete=false take no snapshot; git runs read-only (runGit: argv, hooks off, optional locks off, fsmonitor off); no new flags, env vars, config keys or slash commands; no schema or package version change; regression tests fail on main and pass on the branch

## Evidence

- Verification commit: `310a98b20dbf0942c7c44e95062374941cff2902`
- Base commit: `fc0ed8da6e47dc1db452ee51044cde096db4e8bc`
- Verified by: `specsync check --spec agent --spec discord --spec watch`

## From the change's context.md

# Context

HI: AGENT-4 (hi/agent.md) — "It does not tell me the job is done until the
project's verify lane has passed, or it tells me plainly that verification
failed." Issue #85.

The "tells me plainly" half was met on main (fc0ed8d): exhausted retries and a
provider error after a failed verify both say so (REQ-agent-242). The gate
itself was not: `runTask` decided "verify or skip" from
`verifyBeforeComplete && filesChanged.length > 0`, and `filesChanged` held
only what tools reported through `filesChangedFromToolData`. Only
files-write, files-edit, files-delete and git-commit report it. The code-tier
`shell-exec` returns `{command, cwd, exitCode, output}`, so an edit made
through it (or by a delegate worker, or a commit run through a shell) left the
gate blind.

Reproduced on main in a temp git repo: an execute step that rewrote
`app.ts` outside the file tools and returned `filesChanged: []` gave
`{state: "done", verified: false, verifySkipped: true, filesChanged: []}`
with zero verify calls while `git status` showed ` M app.ts`. Discord and
WATCH spawns never pass `--no-verify`, so those runs could report done on
code the verify lane never saw.

Constraints: no new flags, env vars, config keys or slash commands; no SQLite
schema or package version change; `--no-verify` / `verify_before_complete
= false` stay as they are (removing them is draft AGENT-14, not captured);
AGENT-15's test-count checks are out of scope.

## From the change's design.md

# Design

- **New `src/agent/workspace-diff.ts`.** `startWorkspaceDiff(cwd)`
  realpaths the cwd, finds the project root with `findProjectRoot` and
  returns null without `.git` there. Git runs through `runGit(root, ["-c",
  "core.fsmonitor=false", …])` with an 8 MiB stdout cap; a truncated,
  timed-out or failed listing is "unreadable". A cwd below the root adds the
  pathspec `-- <cwd-relative-to-root>` and maps paths back to the cwd.
  Snapshot = HEAD (sha / null unborn) + `status --porcelain=v1 -z
  --untracked-files=all --no-renames` entries keyed by path to
  `XY` + fingerprint kind + fingerprint. Fingerprint (in process, never
  throws): SHA-256 of a regular file up to 4 MiB plus mode and size, read
  through `open(O_NOFOLLOW|O_NONBLOCK)` + `fstat` so a path swapped for a
  link or fifo after `lstat` is never read; stat identity (ino, mtime,
  ctime) above the size cap, once the 64 MiB content budget of the start
  snapshot is spent, or when unreadable; `link:<target>` for a symlink
  (never followed); `other:<mode>` for a directory (nested repo /
  submodule) or fifo, never read; `missing`. `changed()` lists status
  again and returns the sorted union of: `diff --name-only -z --no-renames
  <startHead|emptyTree> <nowHead|emptyTree>` when HEAD moved, paths that are
  newly dirty (no fingerprint needed), start-dirty paths whose `XY` or
  fingerprint (same kind as at the start) differs, and start-dirty paths
  that are now clean. Any unreadable step returns null.
- **`runTask` (src/agent/loop.ts).** With the gate on it starts the tracker
  once after Planning (`opts.workspaceDiff ?? startWorkspaceDiff`; a throw
  counts as null). After an attempt that ended without an ask, a provider
  error or an abort, it calls `changed()`: null ⇒ `diffUnreadable`, a
  Text note, and `wantVerify` is true (fail closed); otherwise paths not
  already in `filesChanged` (compared after resolving against the cwd) are
  appended (at most `WORKSPACE_DIFF_MAX_FILES` = 1000 per run, so the NDJSON
  `result` line stays under the 1 MiB parser cap) and one Text note names up
  to five and counts them all. `wantVerify =
  verifyBeforeComplete && (filesChanged.length > 0 || diffUnreadable)`.
  Everything after (verify, retries with feedback, stuck ask, cancel) is
  unchanged, and the union across attempts (REQ-agent-242) keeps real-diff
  paths too.
- **Types.** `WorkspaceDiffTracker`, `WorkspaceDiffStart` and the
  `RunTaskOptions.workspaceDiff` test seam (like `verifyRunner`).
- **Unchanged:** `TaskResult` shape, NDJSON protocol 2 (the notes are
  ordinary `Text` events), the verify argv and env, `--no-verify` and
  `verify_before_complete = false` (no snapshot then), the blocked / error
  / cancel paths, the execute step's own tool-reported `filesChanged`.
- **Chosen conservatively (pending Leif):** gitignored paths do not count;
  pre-run dirt left untouched does not count; a non-git cwd keeps today's
  behaviour; in a shared (non-worktree) checkout, edits another process makes
  during the run do count (extra verify, never a skipped one).

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-085` | `tests/agent.loop.test.ts` | "an edit made outside file tools (shell-exec) that reports no filesChanged is still verified": temp git repo, the attempt rewrites tracked `app.ts` and reports `[]`, failing lane → `failed`, `verifySkipped=false`, 2 verify calls (`maxRetries: 1`), `filesChanged: ["app.ts"]`, no `done`, Text note names `app.ts`. On main: `done`, 0 verify calls. |
| `REQ-agent-085`, `REQ-agent-002` | `tests/agent.loop.test.ts` | "the same unreported edit ends done verified=true only when verify passes". On main: `verified=false`, no verify. |
| `REQ-agent-085` | `tests/agent.loop.test.ts` | "a new untracked file and a deleted tracked file are detected" (`["app.ts", "src/new.ts"]`); "an edit to a file already dirty before the run is detected (status unchanged, content changed)"; "a commit made through a shell (HEAD moved, clean tree) is detected"; "the first commit on an unborn HEAD is detected". All fail on main. |
| `REQ-agent-085` (AGENT-4.a) | `tests/agent.loop.test.ts` | "a retry after a failed verify that edits via shell is verified again": 2 verify calls, attempt 2 gets the failure output, ends done verified. Fails on main. |
| `REQ-agent-085` | `tests/agent.loop.test.ts` | "an edit in the run's subdirectory of a repo is detected, relative to the cwd": `filesChanged: ["lib.ts"]`, the edit outside the cwd is not counted. Fails on main. |
| `REQ-agent-085` | `tests/agent.loop.test.ts` | "a diff git cannot read after a good snapshot fails closed: verify runs" (seam tracker returns null; Text note). Fails on main. |
| `REQ-agent-085` | `tests/agent.loop.test.ts` | "a huge real diff adds at most WORKSPACE_DIFF_MAX_FILES paths, so the streamed NDJSON result still says verification failed": seam tracker lists 30000 paths; `filesChanged` = 1 tool-reported + 1000, the note counts 30000, and the `result` line parsed in 64 KiB chunks keeps the "Verification failed" summary. Fails with the pre-review loop (30001 paths, line over the 1 MiB parser cap, result dropped). |
| `REQ-agent-085` | `tests/agent.loop.test.ts` | "an already-dirty file past the hash budget is compared by stat: untouched is quiet, edited is caught" (`startWorkspaceDiff(dir, { hashBudgetBytes: 0 })`). Guard. |
| `REQ-agent-085`, `REQ-agent-003` | `tests/agent.loop.test.ts` | Guards (pass on main and branch): "dirt present before the run and left untouched does not trigger verify", "a change only under a gitignored path does not trigger verify", "a non-git cwd falls back to tool-reported filesChanged", "with the gate off (--no-verify) no snapshot is taken and verify is skipped". |
| `REQ-agent-085`, `REQ-agent-008` | `tests/agent.tool-loop.test.ts` | "shell-exec `printf broken > app.ts` reports no filesChanged, yet verify runs and the run is never done": real `shell-exec` via the tool loop (code tier, allowlisted, mock provider) in a temp git repo; one verify call in the repo, `failed`, `filesChanged: ["app.ts"]`. On main: `done`, no verify. |
| `REQ-agent-242`, `REQ-agent-244`, `REQ-agent-002` | `tests/agent.loop.test.ts`, `tests/agent.ask.test.ts`, `tests/agent.tool-loop.test.ts` | Existing union, provider-error, abort, ask and retry tests still pass. |
| `REQ-discord-014` | `tests/spawn.argv.test.ts`, `tests/agent.ndjson-spawn.test.ts`, `tests/agent.loop.test.ts` | Spawn argv tests ("agent-client style argv for .ts (no --no-verify; AGENT-4 / #85)") still hold; the reworded skip clause is the agent loop's real-diff rule, proven by the REQ-agent-085 rows above (untouched pre-run dirt skips, an unreported edit verifies). |
| `REQ-discord-085`, `REQ-watch-085`, `REQ-watch-006` | `tests/discord.*`, `tests/watch.*` spawn argv tests | Spawn argv still has no `--no-verify`; the skip rule they cite is the agent loop's, proven above. |

Fail-on-main proof: with origin/main's `src/agent/loop.ts`, `types.ts` and
`index.ts` swapped in, the two files run 37 pass / 10 fail (the 10 listed
above); restored, 47 pass / 0 fail. Review pass: 49 pass / 0 fail with the
two tests above.

Full suite: `bun test`, `bunx tsc --noEmit`, `specsync check
--require-coverage 100` and `fledge lanes run verify --non-interactive`.

## Where these lessons go

- `specs/agent/context.md`
- `specs/discord/context.md`
- `specs/watch/context.md`
