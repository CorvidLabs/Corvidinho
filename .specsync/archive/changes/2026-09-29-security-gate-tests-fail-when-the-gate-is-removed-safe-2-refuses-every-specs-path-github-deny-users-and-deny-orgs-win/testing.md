---
change: security-gate-tests-fail-when-the-gate-is-removed-safe-2-refuses-every-specs-path-github-deny-users-and-deny-orgs-win
artifact: testing
---

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
