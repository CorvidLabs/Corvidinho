---
change: on-github-people-match-only-by-their-numeric-user-id-a-renamed-or-re-registered-login-never-counts-as-the-owner-or-a
artifact: plan
---

# Plan

1. Capture IDENTITY-7.a with `hi` (first commit); `hi check`.
2. `src/identity/owner.ts`: `[owner] github_id`, `OwnerRecord.githubId`,
   `normalizeGithubId`, `isOwnerGithub` by id.
3. `src/identity/people.ts`: resolver by numeric id only; owner id joins the
   owner's person; `peopleWithoutGithubId`.
4. WATCH: `router.ts` (identity block, SAFE-13 exemption, header),
   `memory-inject.ts`; `src/memory/scope.ts` (`memorySubjectForGithub`);
   `plugins/memory/commands.ts` doc.
5. `/admin people link github:` lookup: `src/identity/github-user.ts`,
   `command-handlers/admin.ts`, `SlashContext.lookupGithubUser`, option
   descriptions in `slash-commands.ts`; list footer wording.
6. Doctor: `peopleGithubDoctorCheck` (`src/doctor.ts`) wired in `src/cli.ts`.
7. Tests: new `tests/identity.github-numeric-id.test.ts`,
   `tests/watch.github-numeric-id.test.ts` (live Octokit mapping), doctor
   cases; update the login-based cases in the existing identity, admin,
   memory and SAFE-13 tests; prove fail on base, pass on branch.
8. Docs: `allowlist.example.toml`, `docs/discord.md`, `docs/WATCH.md`,
   `docs/DISCORD-GO-LIVE.md`, `.env.example`; spec prose, `files:`,
   testing; deltas.
9. `specsync change approve` / `check --commit` / `audit`, `specsync check
   --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`,
   `fledge lanes run verify --non-interactive`.
