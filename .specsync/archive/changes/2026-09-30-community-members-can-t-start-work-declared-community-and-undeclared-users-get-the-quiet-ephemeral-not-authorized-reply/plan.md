---
change: community-members-can-t-start-work-declared-community-and-undeclared-users-get-the-quiet-ephemeral-not-authorized-reply
artifact: plan
---

# Plan

1. Capture IDENTITY-11.a with `hi` (own commit); `hi check`.
2. Re-check the gap on main 20a0f58: a community `/work` creates a session,
   worktree, branch, task and run.
3. Gate in `src/discord/command-handlers/work.ts` before
   `createWithWorktree`.
4. Tests: `tests/roles.community-no-work.test.ts` (fail on base, pass on
   branch); `tests/fixtures/team-people.ts`; update the tests that drove
   `/work` as an undeclared non-owner (declare them team, or run as owner).
5. Docs: `docs/discord.md` (slash table, Roles, deny text, source map),
   `docs/DISCORD-GO-LIVE.md` (E.1 roles, E.6), `allowlist.example.toml`.
6. Spec prose / `files:` / testing notes; delta Modified REQ-discord-065 and
   REQ-discord-088.
7. `specsync change approve`, `specsync change check --commit`,
   `specsync change audit`, `specsync check --require-coverage 100`,
   `hi check`, `bunx tsc --noEmit`, `bun test`,
   `fledge lanes run verify --non-interactive`.
