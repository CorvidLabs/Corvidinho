---
change: security-gate-tests-fail-when-the-gate-is-removed-safe-2-refuses-every-specs-path-github-deny-users-and-deny-orgs-win
artifact: design
---

# Design

Test-only. Each new test drives the product path that holds the gate, not a
parallel evaluator:

- SAFE-2 `specs/`: `files-write` / `files-edit` / `files-delete` through
  `runPlugin` in a temp project on `specs/agent/requirements.md`,
  `specs/agent/context.md` and a new `specs/notes.md`; `git-commit` of the
  deletion of `specs/x/requirements.md` and `specs/notes.md` in a temp repo.
  Plus direct `isProtectedPath` assertions.
- GitHub deny: `routeEvent` with `denyUsers` / `denyOrgs` that overlap the
  allow lists (so only the deny loop can refuse); `git-push` to the local bare
  `acme/widget` remote with `CORVIDINHO_GITHUB_ALLOW_REPOS=acme/widget` and
  `CORVIDINHO_GITHUB_DENY_ORGS=acme` (goes through `checkGithubRepo` →
  `isRepoAllowed`, not the community copy).
- ROLES-CHAT-8: no `visibilityLookup` is passed, so the gate builds the
  Octokit lookup; `globalThis.fetch` (Octokit's transport) is stubbed per test
  and restored after. `github-pr-list` runs through `runPlugin` to show a
  refused repo makes no pulls call.
- DISCORD-8: `setRequesterPermCheckerForTests(undefined)`, then
  `Client.prototype.login` is replaced (as in `tests/discord.presence.test.ts`)
  with a stub that sets `this.channels.fetch` to a fake guild channel and
  emits `ready`; the verdict comes from `verifyRequesterCanSend`'s own
  `permissionsFor(member).has(...)`. Login is restored in `finally`.

Each test was checked against a mutation of its gate (see testing.md).
No new module, env var, flag, config key, table or command.
