# Lesson bundle — security-gate-tests-fail-when-the-gate-is-removed-safe-2-refuses-every-specs-path-github-deny-users-and-deny-orgs-win

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Security gate tests fail when the gate is removed: SAFE-2 refuses every specs/ path, GitHub deny_users and deny_orgs win in WATCH and git-push, a community session is refused a private repo through the real visibility lookup, and the live DISCORD-8 requester check is exercised
- **Kind**: Feature
- **Specs**: plugins, watch, discord
- **Paths**: tests/files.plugins.test.ts, tests/git.plugins.test.ts, tests/watch.router.test.ts, tests/github.public.community.test.ts, tests/discord.requester-perms.test.ts, specs/plugins/testing.md, specs/watch/testing.md, specs/discord/testing.md
- **Acceptance**: files-write/edit/delete of specs/<m>/requirements.md, specs/<m>/context.md and a new specs/notes.md are refused with SAFE-2 (exit 2) and git-commit refuses staging the deletion of specs/x/requirements.md, and these tests fail with the specs/ component rule removed; a WATCH event from a deny_users user or a deny_orgs org is refused with no session and git-push to a deny_orgs org exits 3 with nothing pushed, and these tests fail with either deny loop disabled; a community session with no injected visibility lookup is refused a private repo (no pulls call), refused an unconfirmed one (404 or no token) and allowed a public one through the Octokit lookup over a stubbed fetch, and the private test fails when the lookup always answers public; verifyRequesterCanSend with no injected checker refuses (403) a requester without View Channel + Send Messages, allows one with both, needs Attach Files for a file post, and discord-post-message in a bridge run posts nothing on a live denial, and these tests fail with the permissionsFor checks disabled; product code is unchanged

## Evidence

- Verification commit: `685c71c8f70db72cb0e4f992ecb86712c31eba8b`
- Base commit: `0f2e2c2774635d1dcbdff599cba92dbecf8eebd9`
- Verified by: `specsync check --spec discord --spec plugins --spec watch`

## From the change's context.md

# Context

A QA audit of `origin/main` (246cb6c; re-checked on 0f2e2c2, after #233) mutated each
security gate and ran the full suite. Four gates could be removed with the
whole suite still green (2085 pass, 0 fail), so nothing proved they held:

1. SAFE-2 `specs/` component rule (`plugins/files/protectedPaths.ts`,
   `if (lower === "specs") return true;`). Every `specs/` target in the tests
   ended in `.spec.md`, which the basename rule also covers, so
   `specs/<m>/requirements.md`, `context.md` and `tasks.md` had no test
   (REQ-plugins-083 / REQ-plugins-182).
2. GitHub `deny_orgs` / `deny_users` loops in `src/allowlist/github.ts`
   (`isRepoAllowed`, `isGithubUserAllowed`), the only deny checks on WATCH
   ingress, `git-push` and the sibling-project gate. Tests covered only
   `deny_repos`; the `evilorg` cases passed because evilorg was not allowed,
   or went through `checkRepoGateForActingRole`'s own copy of the org check
   (REQ-plugins-004 / 005, REQ-watch-003).
3. ROLES-CHAT-8 private-repo refusal through the real visibility lookup
   (`createOctokitVisibilityLookup` in `src/plugins/githubPublic.ts`). Every
   community test injected `visibilityLookup`, so a lookup that always
   answered "public" passed.
4. DISCORD-8 live requester check (`verifyRequesterCanSend`'s
   `permissionsFor(member).has([ViewChannel, SendMessages])`). The tests
   asserted `evaluateRequesterCanSend`, which no product code calls, and every
   post test injected a checker (REQ-discord-012).

Leif's 2026-09-28 interview (Wave 0: spec/test hardening, no new criteria):
add the missing assertions as tests, prove each one matters by breaking the
gate and seeing it fail, then restore; if a new test fails on main, the gate
is broken and gets fixed in the same PR. None failed on main, so product code
is unchanged. No hi criteria are captured (none are new).

## From the change's design.md

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

## From the change's testing.md

# Testing

New tests, all passing on `origin/main` 0f2e2c2 source (after #233) (no gate broken, so
no product fix):

- `tests/files.plugins.test.ts` › "SAFE-2: write/edit/delete refuse every path under specs/, not only *.spec.md (REQ-plugins-083)"
- `tests/git.plugins.test.ts` › "SAFE-2: the deletion of any file under specs/ is refused, not only *.spec.md (REQ-plugins-182)"; the git-push "default-deny and deny list refuse" test gains a `deny_orgs` case
- `tests/watch.router.test.ts` › "deny_users wins over an allowlisted user", "deny_orgs wins over an allowlisted repo"
- `tests/github.public.community.test.ts` › "checkRepoGateForActingRole with the real visibility lookup (ROLES-CHAT-8)" (3 tests)
- `tests/discord.requester-perms.test.ts` › "verifyRequesterCanSend live discord.js check (DISCORD-8, no injected checker)" (5 tests)

Mutation proof (each gate disabled alone, touched test files run, source
restored with `git checkout -- <file>`):

| Mutation | Result | Failing new tests |
|---|---|---|
| `protectedPaths.ts`: drop `if (lower === "specs") return true;` | 42 pass, 2 fail | files specs/ test; git-commit specs/ deletion test |
| `github.ts` `isRepoAllowed`: `deny_orgs` loop `if (false)` | 32 pass, 2 fail | router deny_orgs; git-push deny test |
| `github.ts` `isGithubUserAllowed`: `deny_users` loop `if (false)` | 33 pass, 1 fail | router deny_users |
| `githubPublic.ts`: lookup `return "public";` | 7 pass, 1 fail | private repo refused, no pulls call |
| `requester-perms.ts`: `false && !perms?.has([View, Send])` | 25 pass, 2 fail | live 403 test; post-message live denial |
| `requester-perms.ts`: `false && opts.attachFiles && …` | 26 pass, 1 fail | live Attach Files test |

No live Discord token, GitHub token or network: Octokit's `fetch` and the
discord.js gateway login are stubbed per test and restored.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-083` | `tests/files.plugins.test.ts` | `isProtectedPath` true for `specs/agent/requirements.md`, `specs/agent/context.md`, `specs/notes.md`, `./Specs/agent/tasks.md`; files-write of those and a new `specs/notes.md` → exit 2 SAFE-2, not created; files-edit / files-delete → exit 2 SAFE-2, content unchanged. Fails with the `specs` rule removed. |
| `REQ-plugins-182` | `tests/git.plugins.test.ts` | git-commit of the deletion of `specs/x/requirements.md` and `specs/notes.md` → exit 2 SAFE-2, path still in `ls-files`, nothing staged. Fails with the `specs` rule removed. |
| `REQ-plugins-004` | `tests/git.plugins.test.ts` | git-push with `ALLOW_REPOS=acme/widget` + `DENY_ORGS=acme` → exit 3, `org "acme" is denied`, remote ref absent. Fails with the `deny_orgs` loop off. |
| `REQ-plugins-005` (unchanged) | `tests/git.plugins.test.ts`, `tests/watch.router.test.ts` | Deny overrides win over allow lists that name the target (org, user). |
| `REQ-plugins-493` | `tests/github.public.community.test.ts` | Community session, no injected lookup, stubbed fetch: `private: true` → "private GitHub repos" from the gate and `github-pr-list` (exit 3), only `GET /repos/o/r` sent; 404 → "could not confirm"; no token → "could not confirm", no request; `private: false` → ok and the pulls request goes out. Private test fails when the lookup always answers public. |
| `REQ-watch-003` | `tests/watch.router.test.ts` | `denyUsers=[mallory]` with mallory allowlisted → refuse `user_not_allowlisted`, NOT_AUTHORIZED, no session; 0xLeif still starts one. `denyOrgs=[evilorg]` with `evilorg/x` allowlisted → refuse `repo_not_allowlisted`, no session. Each fails with its deny loop off. |
| `REQ-discord-012` | `tests/discord.requester-perms.test.ts` | No injected checker; gateway login stubbed to `ready` on a fake guild text channel: no View / only View / only Send → 403 "requester cannot send to this channel"; View+Send → ok; not in guild → 403; missing / voice channel → 404; `discord-post-message` (bridge run, acting user) posts nothing on a live denial and once when allowed. Fails with the View+Send `permissionsFor` check off. |
| `REQ-discord-476` (unchanged) | `tests/discord.requester-perms.test.ts` | Live check with `attachFiles`: View+Send without Attach Files → 403 `REQUESTER_CANNOT_ATTACH`; with it → ok. Fails with the Attach Files check off. |

## Where these lessons go

- `specs/plugins/context.md`
- `specs/watch/context.md`
- `specs/discord/context.md`
