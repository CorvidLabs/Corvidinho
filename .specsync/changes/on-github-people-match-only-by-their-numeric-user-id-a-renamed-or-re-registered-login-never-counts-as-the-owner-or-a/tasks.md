---
change: on-github-people-match-only-by-their-numeric-user-id-a-renamed-or-re-registered-login-never-counts-as-the-owner-or-a
artifact: tasks
---

# Tasks

- [x] Capture IDENTITY-7.a (hi/identity.md, under IDENTITY-7) with `hi` from Leif's 2026-09-28 interview (round 12); `hi check` green.
- [x] Re-verify the gap on main 20a0f58: `resolvePerson` accepts a login without a declared id; `[owner]` has no id; the WATCH block, memory scope and SAFE-13 exemption follow it.
- [x] `src/identity/owner.ts`: `[owner] github_id` (TOML / JSON), `OwnerRecord.githubId`, shared `normalizeGithubId`, `isOwnerGithub` by numeric id.
- [x] `src/identity/people.ts`: numeric-id-only resolver, owner id on the owner's person, `peopleWithoutGithubId`.
- [x] WATCH: `router.ts` (identity block, header, SAFE-13 exemption), `memory-inject.ts`; `src/memory/scope.ts`; `plugins/memory/commands.ts` doc.
- [x] `/admin people link github:` stores the looked-up id: `src/identity/github-user.ts`, `command-handlers/admin.ts` (plan, defer, lookup, re-plan; `error` row on failure; unlink note; list footer), `SlashContext.lookupGithubUser`, option descriptions.
- [x] Doctor `[warn] people-github`: `peopleGithubDoctorCheck` in `src/doctor.ts`, wired in `src/cli.ts`.
- [x] Tests: `tests/identity.github-numeric-id.test.ts` (9), `tests/watch.github-numeric-id.test.ts` (3, live Octokit mapping), `tests/cli.doctor-truth.test.ts` (2); login-based cases updated in `tests/identity.people.test.ts`, `tests/identity.owner.test.ts`, `tests/identity.recognise.test.ts`, `tests/discord.admin-people.test.ts`, `tests/memory.rank.test.ts`, `tests/memory.recall-github.test.ts`, `tests/safe.injection.test.ts`; fail on the base sources, pass on the branch.
- [x] Docs: `allowlist.example.toml`, `docs/discord.md`, `docs/WATCH.md`, `docs/DISCORD-GO-LIVE.md`, `.env.example`; spec prose and `files:` (discord, watch, plugins, cli), testing (discord, watch, plugins, cli, agent); deltas Added REQ-discord-367 / REQ-watch-367 / REQ-cli-367, Modified REQ-discord-036 / 042 / 067, REQ-watch-036 / 071 / 067, REQ-plugins-067, REQ-agent-071.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
