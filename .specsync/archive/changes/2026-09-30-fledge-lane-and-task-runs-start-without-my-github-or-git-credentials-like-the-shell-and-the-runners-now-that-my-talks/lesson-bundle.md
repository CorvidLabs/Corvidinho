# Lesson bundle — fledge-lane-and-task-runs-start-without-my-github-or-git-credentials-like-the-shell-and-the-runners-now-that-my-talks

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Fledge lane and task runs start without my GitHub or git credentials, like the shell and the runners, now that my talks may be offered them (SAFE-21.a, SAFE-3.a)
- **Kind**: BugFix
- **Specs**: plugins
- **Paths**: plugins/fledge/core.ts, tests/fledge.core.test.ts, specs/plugins/plugins.spec.md, specs/plugins/testing.md
- **Acceptance**: fledge-lanes-run and fledge-run (and the two Fledge core reads) start fledge with the env shell-exec and the language runners get (withoutGitCredentials over the verify-lane scrub): no GH_TOKEN, GITHUB_TOKEN, GIT_ASKPASS, SSH_AUTH_SOCK or inherited GH_CONFIG_DIR; GIT_CONFIG_GLOBAL=/dev/null, GIT_CONFIG_NOSYSTEM=1, GIT_TERMINAL_PROMPT=0, GIT_CONFIG_COUNT=3 with an empty credential.helper, a key-less GIT_SSH_COMMAND and an empty GH_CONFIG_DIR, so the owner's credential helper and gh login never reach a lane or task; FLEDGE_NON_INTERACTIVE=1, CORVIDINHO_PROJECT_ROOT and the verify-lane scrub are unchanged

## Evidence

- Verification commit: `6433d7781d811ce730df524db5d7ae221c3e2dd2`
- Base commit: `749cb55d58c8c3c119d4368359c398cab8677d9f`
- Verified by: `specsync check --spec plugins`

## From the change's context.md

# Context

Adversarial review of #324 (SAFE-3.a, Discord half). That change offers the
model `fledge-lanes-run` and `fledge-run` in the owner's own chat,
`/session start`, `/work` and ask answers, inside that talk's own worktree.
On main (507d97b) the Fledge core runs got only the verify lane's scrub
(`buildVerifyEnv`): `GITHUB_TOKEN` / `GH_TOKEN` dropped, but `GIT_ASKPASS`,
`SSH_AUTH_SOCK`, an inherited `GH_CONFIG_DIR`, the owner's `~/.gitconfig`
credential helper and gh's `hosts.yml` all reached fledge. #309 recorded that
as a residual while the runs were never offered to the model.

Once the model is offered them, a lane or task (including one it wrote into
the talk worktree's `fledge.toml` through a runner, which SAFE-2 does not
guard) could push, open a PR or merge with the owner's credentials, outside
the checked GitHub tools. Leif's 2026-09-30 answer (round 13, "Shell login
(SAFE-3.a/GITHUB-1/7/9)"): the shell and language runners start without the
owner's GitHub/git credentials; pushes, PRs and merges happen only through the
checked GitHub tools and their gates. SAFE-21.a names the shell and the
runners; this applies the same env to the Fledge core runs, the most
conservative reading for the tools SAFE-3.a newly offers. No new criterion.

## From the change's design.md

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

## From the change's testing.md

# Testing

- `tests/fledge.core.test.ts` › "lane and task runs start without GitHub or
  git credentials, like shell-exec and the runners (SAFE-21.a, SAFE-3.a)":
  a fake `fledge` records the env; with `GH_TOKEN`, `GIT_ASKPASS`,
  `SSH_AUTH_SOCK`, a `GH_CONFIG_DIR` holding `hosts.yml` and a
  `~/.gitconfig` credential helper, both `fledge-run` and `fledge-lanes-run`
  start fledge with none of them, `GIT_CONFIG_GLOBAL=/dev/null`,
  `GIT_CONFIG_NOSYSTEM=1`, `GIT_TERMINAL_PROMPT=0`, `GIT_CONFIG_COUNT=3`
  with an empty `credential.helper`, a key-less `GIT_SSH_COMMAND`, no
  `hosts.yml`, and the verify-lane scrub unchanged.
- Fail on base: with the base's `plugins/fledge/core.ts` the test fails
  (`askpass=set sshsock=set`, `hosts=yes`, `helpers=[owner-marker-helper,]`).
- The rest of `tests/fledge.*.test.ts` and `tests/runners.plugins.test.ts` pass.

## Where these lessons go

- `specs/plugins/context.md`
