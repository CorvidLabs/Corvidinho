---
id: the-verify-gate-uses-the-run-s-real-git-working-tree-diff-not-only-the-files-tools-report-so-an-edit-made-outside-the
state: archived
type: bug_fix
base_commit: fc0ed8da6e47dc1db452ee51044cde096db4e8bc
---

# The verify gate uses the run's real git working-tree diff, not only the files tools report, so an edit made outside the file tools is verified before done (AGENT-4, #85)

## Intent

The verify gate uses the run's real git working-tree diff, not only the files tools report, so an edit made outside the file tools is verified before done (AGENT-4, #85)

## Affected Canonical Specs

- `agent`
- `discord`
- `watch`

## Acceptance Criteria

- With the verify gate on, runTask snapshots the run's git project before the first attempt (HEAD, git status with untracked files, content fingerprints of dirty paths) and after each attempt adds every path that differs from that snapshot to filesChanged, so an edit no tool reported (code-tier shell-exec, a delegate worker, a commit made through a shell, a new untracked file, a deleted file, a further edit to a file already dirty, a first commit on an unborn HEAD) runs the verify lane and the run ends done only on a pass or fails plainly; dirt present before the run and left untouched, gitignored paths, and a non-git cwd keep today's behaviour (tool-reported files only; empty ⇒ verifySkipped=true); a cwd below the repo root reads only its subtree and reports cwd-relative paths; a diff git cannot read after a good snapshot fails closed (verify runs); --no-verify / verify_before_complete=false take no snapshot; git runs read-only (runGit: argv, hooks off, optional locks off, fsmonitor off); no new flags, env vars, config keys or slash commands; no schema or package version change; regression tests fail on main and pass on the branch

## No-spec Rationale

Not applicable
