---
change: community-members-can-t-start-work-declared-community-and-undeclared-users-get-the-quiet-ephemeral-not-authorized-reply
artifact: tasks
---

# Tasks

- [x] Capture IDENTITY-11.a with `hi` (first commit, `hi/identity.md` + the `INTENT.md` index `hi` regenerated); `hi check` green.
- [x] Re-verify the gap on main 20a0f58 (community `/work` defers publicly and creates a session, worktree, `talk/*` branch, work task and agent run).
- [x] `src/discord/command-handlers/work.ts`: `workAllowedFor` and the ephemeral `NOT_AUTHORIZED` gate after the SAFE-13 check, before `deferReply` / `createWithWorktree`; PR-step comment updated.
- [x] `tests/roles.community-no-work.test.ts` (9 tests; 8 fail on the base source, the owner / team "unchanged" case passes on both) and `tests/fixtures/team-people.ts`.
- [x] Existing tests that drove `/work` as an undeclared non-owner declare the invoker team (or run as owner): slash-ask7, slash-reply-continuity, spend, slash-choose-ask, session-thread, allowed-mentions, session-worktree, safe.injection, slash-pending-ask, identity.recognise, ask-answer-modal, collapsed-ping, slash, worktree.project-scope; community expectations in roles.team, work.pr and actor-gate now expect the refusal.
- [x] Docs: `docs/discord.md`, `docs/DISCORD-GO-LIVE.md`, `allowlist.example.toml`.
- [x] Spec prose and `files:` (`specs/discord/discord.spec.md`), `specs/discord/testing.md`; delta Modified REQ-discord-065 and REQ-discord-088.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
- [x] Review fixes: REQ-discord-065 (delta), spec prose and change notes no longer say everyone is refused with no owner (a declared team member still starts `/work` then) or that a muted / deny-listed caller gets `not authorized` through the dispatcher (the mute / actor gates answer first); tests for both; `specs/discord/testing.md` REQ-discord-734 slash-ask7 entry names the team requester; `docs/DISCORD-GO-LIVE.md` PR-step line says owner or team.
