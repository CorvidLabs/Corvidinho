---
change: on-github-people-match-only-by-their-numeric-user-id-a-renamed-or-re-registered-login-never-counts-as-the-owner-or-a
artifact: research
---

# Research

- `resolvePerson` is the only resolver: Discord (`identity-inject.ts`,
  `permissions.ts`, `memory/scope.ts` by Discord id), WATCH
  (`formatWatchIdentityBlock`, `watchInjectionVerdict`) and GitHub memory
  (`memorySubjectForGithub` ← `enrichWatchPromptWithMemories` and
  `plugins/memory/commands.ts`). Dropping the login branch there covers every
  GitHub recognition path at once.
- Other login uses are not recognition and stay: the WATCH user allowlist
  (`[github] users`, ALLOW-1/2) gates by login; the owner @mention on SAFE-13 /
  summary comments uses `[owner] github_login`; audit actors are
  `github:<login>`; WATCH conversation participants and forget-me cleanup
  (`linkedGithubLogins`) use logins; the WATCH own-username skip compares the
  watch login.
- `senderId` comes from the API's `user.id` in `createOctokitSearchClient`
  (search items and comments) and `user_id` in the fixture client; only the
  fixture mapping had a test. The live Octokit v22 client uses
  `globalThis.fetch`, so a stubbed transport exercises the real mapping (as
  `tests/watch.comments-pagination.test.ts` does).
- `GET /users/{login}` (Octokit `users.getByUsername`) returns the numeric id
  and the canonical login; unauthenticated calls work within the anonymous
  rate limit, `GITHUB_TOKEN` / `GH_TOKEN` raise it.
- Slash replies after `deferReply` become `editReply` in the gateway adapter,
  so a deferred ephemeral reply keeps the 3 s interaction deadline safe while
  GitHub answers.
- `tests/discord.admin-people.test.ts` pins that only
  `command-handlers/admin.ts` imports `admin-people.ts`, so the lookup lives in
  its own module (`src/identity/github-user.ts`), not in the writer.
