# Lesson bundle — github-plugin-repo-gate-reads-the-allowlist-file-plus-env-overlays-so-file-deny-lists-apply-and-file-only-allow-lists

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: GitHub plugin repo gate reads the allowlist file plus env overlays so file deny lists apply and file-only allow lists work (GITHUB-6, ALLOW-4)
- **Kind**: BugFix
- **Specs**: plugins, discord
- **Paths**: src/plugins/githubDeny.ts, src/plugins/githubPublic.ts, src/work/pr.ts, tests/github.gate-allowlist-file.test.ts, tests/work.pr.test.ts, specs/plugins
- **Acceptance**: With deny_repos/deny_orgs only in the allowlist file and the allow list only in env, every GitHub plugin (issue/PR create, comment, review, reads) and the /work PR step refuse the denied repo or org with exit 3 / repo-denied; with an allow list only in the file, allowed repos pass and unlisted repos are still refused

## Evidence

- Verification commit: `71b9d25f22c534606c264b274f02af9772ac0736`
- Base commit: `ea2c970cab0297f0e75f7b0e78e2598222cd687f`
- Verified by: `specsync check --spec discord --spec plugins`

## From the change's context.md

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

## From the change's design.md

# Design

Resolve the gate's allowlist through the same ALLOW-4 loader WATCH uses:

- `checkRepoGateForActingRole`: when no `cfg` is injected, use
  `await loadAllowlist({ env })` (file + env overlays) instead of
  `configFromEnvOnly(env)`. All GitHub plugin handlers (commands.ts,
  review.ts) already call it, so deny lists from the file now win for both the
  ADMIN/CLI allowlist path and the community public path (ROLES-CHAT-8).
- `githubDeny.ts`: add the promised `checkRepoGateAsync(repo, env)` =
  `checkRepoGate(repo, await loadAllowlist({ env }))`; fix the stale comment.
  The sync `checkRepoGate` keeps its signature (git-push passes a loaded cfg;
  tests pass env maps).
- `src/work/pr.ts`: default gate is `checkRepoGateAsync`; the injectable
  `repoGate` dep may return a promise and is awaited.

The file is re-read per gate call (no cache) so an admin allowlist edit
applies to the next call, like git-push and roles.ts. No new env var, config
key, slash command or plugin. Untrusted issue/PR text is not parsed; only the
explicit `--repo` is gated.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-253` | `tests/github.gate-allowlist-file.test.ts` | file-only `deny_repos` / `deny_orgs` with env-only `ALLOW_ORGS`: gate refuses `corvidlabs/secret` and `evilorg/x`, allows `corvidlabs/ok`; github-issue-create, github-issue-comment, github-pr-create and github-pr-review exit 3 for both targets, github-pr-diff exits 3; a community role session is still refused; a file-only allow list lets github-issue-create through (dry run) and refuses an unlisted repo; CLI `plugins run` with ~/.config/corvidinho/allowlist.toml exits 3 for the denied repo/org and 0 for the allowed one. 5 of 5 failed before the fix, 5 of 5 pass after. |
| `REQ-discord-253` | `tests/work.pr.test.ts` | default /work gate: file deny + env allow gives `repo-denied`, no plugin call, nothing pushed; file-only allow opens the draft PR (dry run). Failed before the fix, passes after. |
| `REQ-plugins-004` | `tests/github.deny.test.ts`, `tests/github.write.plugin.test.ts`, `tests/github.public.community.test.ts` | missing `--repo`, empty allow list, env deny and allow-match cases unchanged. |
| `REQ-discord-088` | `tests/work.pr.test.ts` | injected gate refusal, GITHUB-5, AGENT-4 and dry-run PR cases unchanged. |

## Where these lessons go

- `specs/plugins/context.md`
- `specs/discord/context.md`
