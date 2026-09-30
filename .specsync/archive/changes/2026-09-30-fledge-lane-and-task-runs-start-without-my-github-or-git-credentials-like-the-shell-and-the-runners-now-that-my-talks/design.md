---
change: fledge-lane-and-task-runs-start-without-my-github-or-git-credentials-like-the-shell-and-the-runners-now-that-my-talks
artifact: design
---

# Design

Reuse `withoutGitCredentials` (plugins/runners/commands.ts), the one env
builder SAFE-21.a already uses for `shell-exec` and the runners, over the
verify-lane scrub. It applies to all four Fledge core builtins (the two reads
too) and to operator `corvidinho plugins run fledge-*` calls, matching
`shell-exec` and the runners, which are credential-free for operators as
well. Discovered Fledge plugin commands (`fledge-<command>`, `fledgeChildEnv`)
are unchanged: they are not offered under SAFE-3.a and stay per-command
allowlisted. The verify gate's own lane run (`defaultVerifyRunner`) is
unchanged (AGENT-14/15 scope).
