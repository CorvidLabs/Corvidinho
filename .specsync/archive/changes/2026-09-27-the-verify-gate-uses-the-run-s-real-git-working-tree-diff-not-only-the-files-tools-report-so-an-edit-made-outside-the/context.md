---
change: the-verify-gate-uses-the-run-s-real-git-working-tree-diff-not-only-the-files-tools-report-so-an-edit-made-outside-the
artifact: context
---

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
