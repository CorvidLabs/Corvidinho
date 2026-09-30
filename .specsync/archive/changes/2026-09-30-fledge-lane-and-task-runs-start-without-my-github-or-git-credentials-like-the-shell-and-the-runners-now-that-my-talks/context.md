---
change: fledge-lane-and-task-runs-start-without-my-github-or-git-credentials-like-the-shell-and-the-runners-now-that-my-talks
artifact: context
---

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
