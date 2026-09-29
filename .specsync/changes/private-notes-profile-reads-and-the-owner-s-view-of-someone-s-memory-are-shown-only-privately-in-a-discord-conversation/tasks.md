---
change: private-notes-profile-reads-and-the-owner-s-view-of-someone-s-memory-are-shown-only-privately-in-a-discord-conversation
artifact: tasks
---

# Tasks

- [x] Capture MEMORY-7.a (hi/memory.md) with `hi` from Leif's 2026-09-28 interview, round 12 (one commit); `hi check` green.
- [x] Re-verify the gap on main (20a0f58): private notes, the owner's `--person` view and `memory-profile` go back to the model as the tool result; `memory-profile` works in a GitHub thread.
- [x] `PluginHandlerResult.privateText`; memory plugins: private reads privately in a conversation (placeholder `data` / `message`), refused in schedules and on GitHub, local CLI unchanged; descriptions.
- [x] Tool loop: `onPrivateReply`, never in a model request / tool message / event; `TaskResult.privateReplies`; prompt rule; `task run` carries it.
- [x] `src/discord/private-reply.ts`; agent client validation; bridge chat, button pick and Answer form paths; `SlashContext.sendDm`; `/session start` and `/work`.
- [x] Tests: `tests/memory.private-view.test.ts` (16); `tests/memory.profiles.test.ts` and `tests/memory.recall-github.test.ts` updated; fail on main (15 of 16 new, 5 updated), pass on the branch (51 of 51).
- [x] Docs: `docs/discord.md`, `docs/DISCORD-GO-LIVE.md`, `docs/WATCH.md`; spec prose and `files:`, `specs/*/testing.md`; deltas Added REQ-plugins-710 / REQ-agent-710 / REQ-cli-710 / REQ-discord-710.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
