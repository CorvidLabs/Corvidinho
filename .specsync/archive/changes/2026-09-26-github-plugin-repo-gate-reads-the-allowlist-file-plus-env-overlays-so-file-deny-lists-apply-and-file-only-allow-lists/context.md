---
change: github-plugin-repo-gate-reads-the-allowlist-file-plus-env-overlays-so-file-deny-lists-apply-and-file-only-allow-lists
artifact: context
---

# Context

Bug hunt finding watch-github-1 (high). The GitHub plugin repo gate
(`checkRepoGateForActingRole` in src/plugins/githubPublic.ts, used by every
handler in plugins/github/commands.ts and plugins/github/review.ts) and the
/work PR pre-check (`checkRepoGate` default in src/work/pr.ts) built their
allowlist with `configFromEnvOnly(process.env)`, so the allowlist file
(`CORVIDINHO_ALLOWLIST_FILE` or ~/.config/corvidinho/allowlist.toml, ALLOW-4)
was never read. WATCH ingress loads file + env, so an operator following
docs/WATCH.md with `CORVIDINHO_GITHUB_ALLOW_ORGS` in env and `deny_repos` /
`deny_orgs` in the file saw WATCH refuse those repos, while a WATCH-spawned or
CLI agent (steerable by issue text) could still run github-issue-create,
github-issue-comment, github-pr-create or github-pr-review against them.
The reverse also broke: with a file-only allow list every GitHub plugin and
the /work PR step refused (default-deny). Violates GITHUB-6 (hi/github.md)
and ALLOW-4 (hi/allow.md). The `checkRepoGateAsync` promised in the
githubDeny.ts comment did not exist. git-push already loaded file + env.
