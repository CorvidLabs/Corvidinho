---
change: on-github-people-match-only-by-their-numeric-user-id-a-renamed-or-re-registered-login-never-counts-as-the-owner-or-a
artifact: testing
---

# Testing

Fixture tests only: temp allowlist files, in-memory SQLite, the slash
dispatcher with an injected GitHub lookup, `startWatchPoller` with the live
Octokit search client over a stubbed `fetch`, the real CLI for doctor with a
clean env; no token, no network.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-367` | `tests/identity.github-numeric-id.test.ts` | A login alone, or the owner's / a declared person's login with another numeric id, resolves nobody in `resolvePerson` and `memorySubjectForGithub`; the declared id resolves under any login. `[owner] github_id` from TOML (quoted / bare) and JSON (string / number), an invalid one — `0` / `000` included — ignored with a value-free issue (a people entry with `github_ids = ["0"]` is skipped whole); loaded from the file it joins the owner's person; an env-only owner login is not the owner on GitHub. A login-only entry loads with no issue, matches on Discord, not GitHub, and matches once `github_ids` is added. `/admin people link github:` writes the looked-up id to `github_ids` (login kept), `started` / `ok` rows, deferred reply, live at once, a second link no change; a failed / missing / mismatched lookup writes nothing and audits `error`; a refused request and `github_id:` links make no lookup. `createGithubUserLookup` over a stubbed fetch: 200 → id + canonical login with the token as auth; 404 → no user; 500 → status only, token never in the error; no id → refused. |
| `REQ-discord-367` / `REQ-discord-036` / `REQ-discord-042` | `tests/identity.people.test.ts`, `tests/identity.owner.test.ts`, `tests/discord.admin-people.test.ts` | Resolver by Discord id / `<@id>` / numeric id, never a login; the built-in owner by `[owner] github_id` only, the declared owner's person gets the `[owner]` id; `isOwnerGithub` by numeric id only; `/admin people` link / unlink with a fake lookup (unlinking a login says its id still matches); the owner's person matched by its linked id, not the `[owner]` login. |
| `REQ-discord-067` / `REQ-plugins-067` | `tests/memory.rank.test.ts`, `tests/memory.recall-github.test.ts` | `memorySubjectForGithub` by id only; the undeclared-under-`[people]` owner by `[owner] github_id`; through the memory plugins a renamed login with the declared id is the person, the `[owner]` login alone recalls nothing, a login with another id or no id saves nothing. |
| `REQ-watch-367` / `REQ-watch-036` / `REQ-watch-067` / `REQ-watch-071` | `tests/watch.github-numeric-id.test.ts` | Live `createOctokitSearchClient` over a stubbed transport: `user.id` → `senderId` on issue and comment events, none when the payload has no id. On those events: renamed login + declared id → that person; the owner's login with no / another id → `declared_person: none`, no `role: owner`, no owner or person memory, flagged by `watchInjectionVerdict`; the owner's id → owner, exempt; with only the owner configured, the owner's login with no / another id still gets `declared_person: none` and any other undeclared login no block. Through `startWatchPoller` with the live client: an injection from the re-registered owner login is refused before any run (one comment @mentioning the owner); an ordinary one runs undeclared without the owner's memory; the owner's id runs with `role: owner` and the owner's memory. |
| `REQ-watch-036` / `REQ-agent-071` | `tests/identity.recognise.test.ts`, `tests/safe.injection.test.ts` | The identity block by numeric id (a login with no id is `declared_person: none`; the owner by `[owner] github_id`); `startWatchPoller` recognises a person added by `github_ids`; the SAFE-13 verdict exempts the owner's id and flags the owner's login with no or another id. |
| `REQ-cli-367` | `tests/cli.doctor-truth.test.ts` | Real CLI, clean env: `[owner]` login without `github_id` and a login-only person → one `[warn] people-github: ada, the owner: …` line, person ids only (no Discord id, GitHub id or login), doctor passes; with ids everywhere no line. |

Fail on base: with the base sources swapped in (`git checkout origin/main --
src plugins` at 20a0f58, `src/identity/github-user.ts` removed, branch tests
kept, then restored byte-for-byte): `tests/identity.github-numeric-id.test.ts`
fails 8 of 9 and `tests/watch.github-numeric-id.test.ts` 2 of 3 (the live
mapping case and "a refused request makes no lookup" hold on both); across the
eight updated files 15 cases fail (identity.people 3, identity.owner 1,
memory.rank 2, admin-people 3, safe.injection 1, identity.recognise 2,
memory.recall-github 2, doctor 1). All pass on the branch.

Review follow-up (owner-only block for the owner's login; zero is not an id):
with the sources of the PR's first head (37da03c) swapped in, the two touched
cases fail (the owner-only `declared_person: none` assertions in
`tests/watch.github-numeric-id.test.ts`, the `github_id = "0"` assertions in
`tests/identity.github-numeric-id.test.ts`); they pass after.

Full suite: `bun test` green; `bunx tsc --noEmit` clean; `specsync check
--require-coverage 100` 100%; `hi check` green; `fledge lanes run verify
--non-interactive` completed.
