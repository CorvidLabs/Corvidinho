---
change: forget-from-github-and-from-admin-approved-on-the-card-a-declared-person-matched-by-github-numeric-id-who-comments
artifact: plan
---

# Plan

1. Capture MEMORY-ACL-6.a by hand under MEMORY-ACL-6 (`hi` cannot parse the
   MEMORY-ACL prefix); `hi check`; one commit.
2. `src/memory/forget.ts`: `ForgetRequester` encode / parse, GitHub origin,
   `ForgetRequest.requester`, `unnotifiedGithub`, `forgetTargets` (no
   non-Discord asker as a Discord id; GitHub logins + ids);
   `src/store/conversation.ts`: `githubIdParticipant`, `deleteForPerson`
   by ids; `src/memory/scope.ts`: `memorySubjectForPerson`.
3. `src/discord/forget-card.ts`: asker line per kind; GitHub asks left to the
   poller; admin asks marked told; audit actor per kind.
4. `/admin people forget`: handler, slash body, `SlashContext.requestForget`
   / `deliverForgetCards`, bridge wiring.
5. `src/watch/forget-me.ts` + poller wiring (forget asks before dedupe,
   outcome pass per cycle, `github-id` participant);
   `memory-forget-me` GitHub refusal names the comment path.
6. Tests `tests/watch.forget-me.test.ts`, `tests/discord.admin-forget.test.ts`,
   `tests/discord.admin-slash.test.ts` (subcommand list); prove fail on main.
7. Docs and spec prose; deltas; `specsync check --require-coverage 100`,
   `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify
   --non-interactive`.
