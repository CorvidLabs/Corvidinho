---
change: discord-chat-and-slash-paths-gate-the-actor-against-the-user-role-allowlist-and-deny-lists-not-the-channel-alone
artifact: testing
---

# Testing

`bun test tests/discord.actor-gate.test.ts`: on main (router/slash cases only, since `gateActor` does not exist there) 5 of 7 tests fail (`mallory => start_session`, `mallory reply => continue_session`, `/work` as mallory returns `{ok:true,handled:true}` and spawns). After the fix 10/10 pass. Full `bun test`, `bunx tsc --noEmit` and the fledge verify lane pass; the existing router, slash, owner, admin and rate/mute tests are unchanged.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-201` | `tests/discord.actor-gate.test.ts` | Deny-listed (`mallory`) and unlisted (`stranger`) members get a silent `refuse` on @mention, reply-to-bot and thread continuation, and no session is created. `/work`, `/session start` and `/status` return `user_not_allowlisted` with only an ephemeral zero-width ack, and nothing is spawned. A listed user, an allowed role and the unlisted owner still start and run. Empty user+role lists keep the channel-only path, while deny-listed users and roles are still refused. A denied role refuses even a listed user and the owner. |
