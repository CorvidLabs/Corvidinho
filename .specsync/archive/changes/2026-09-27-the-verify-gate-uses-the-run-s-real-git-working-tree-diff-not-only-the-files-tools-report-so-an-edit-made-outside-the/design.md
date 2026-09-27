---
change: the-verify-gate-uses-the-run-s-real-git-working-tree-diff-not-only-the-files-tools-report-so-an-edit-made-outside-the
artifact: design
---

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
