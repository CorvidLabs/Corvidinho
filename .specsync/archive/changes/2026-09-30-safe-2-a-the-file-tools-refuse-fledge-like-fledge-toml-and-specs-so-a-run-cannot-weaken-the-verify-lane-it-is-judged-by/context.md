---
change: safe-2-a-the-file-tools-refuse-fledge-like-fledge-toml-and-specs-so-a-run-cannot-weaken-the-verify-lane-it-is-judged-by
artifact: context
---

# Context

SAFE-2 ("The agent cannot delete or overwrite protected project infra (env
files, git metadata, fledge.toml, specs, keystores) through its file tools")
is enforced by `isProtectedPath` in `plugins/files/protectedPaths.ts`, the one
list every writing file tool consults (`files-write`, `files-edit`,
`files-delete`; `git-commit` for staged deletions; `discord-send-file` refuses
the same set on read-out).

The verify gate runs the project's `verify` lane with `fledge lanes run
verify`. Fledge reads that lane from `fledge.toml` **or** from a
`.fledge/lanes/*.toml` import (doctor's `verify-lane` check reads both,
REQ-cli-430). `fledge.toml` was protected; `.fledge/` was not. On `main`
(5aaf7f0) `files-write .fledge/lanes/verify.toml "[lanes.verify] steps=[]"`
and `files-delete .fledge/lanes/verify.toml` both succeed, so a run (an
owner or team `/work` run, or a delegate worker, all of which get the file
tools in their worktree) could rewrite or drop the checks it is then judged
by.

Leif's 2026-09-28 interview, round 12 (2026-09-29, recorded in
`/home/user/coord/interview-2026-09-28.md`): "protect .fledge/ like
fledge.toml and specs/ so a run can't weaken the verify lane" and capture
**SAFE-2.a** "Its file tools also can't change .fledge/, so a run can't
weaken the checks it is verified by." Captured with `hi` in this PR
(`hi/safe.md`, under SAFE-2).
