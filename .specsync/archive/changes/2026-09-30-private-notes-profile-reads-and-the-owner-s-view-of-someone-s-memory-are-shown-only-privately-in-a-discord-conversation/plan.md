---
change: private-notes-profile-reads-and-the-owner-s-view-of-someone-s-memory-are-shown-only-privately-in-a-discord-conversation
artifact: plan
---

# Plan

1. Worktree on main (20a0f58); capture MEMORY-7.a with `hi` (one commit);
   `hi check`.
2. `src/plugins/types.ts`: `PluginHandlerResult.privateText`.
3. `plugins/memory/commands.ts`: `privateReadSurface`, `sentPrivately`,
   `privateListing`; private notes / `--person` view / `memory-profile`
   privately in a conversation, refused in a schedule and on GitHub;
   descriptions.
4. `src/agent/execute.ts` / `types.ts`: `onPrivateReply` through the loop;
   `TaskResult.privateReplies`; prompt rule. `src/cli.ts`: carry it on the
   result.
5. `src/discord/private-reply.ts` (validate, deliver by DM, channel note);
   agent client; `AgentSpawnResult`; bridge chat and component paths;
   `SlashContext.sendDm`; `/session start` and `/work`.
6. Tests `tests/memory.private-view.test.ts` (main APIs statically only);
   update `tests/memory.profiles.test.ts` and
   `tests/memory.recall-github.test.ts`; prove fail on main, pass on the
   branch.
7. Docs (`docs/discord.md`, `docs/DISCORD-GO-LIVE.md`, `docs/WATCH.md`);
   spec prose and `files:`; `specs/*/testing.md`; deltas.
8. `specsync change approve`, `change check --commit`, `change audit`,
   `specsync check --require-coverage 100`, `hi check`, `bunx tsc
   --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
