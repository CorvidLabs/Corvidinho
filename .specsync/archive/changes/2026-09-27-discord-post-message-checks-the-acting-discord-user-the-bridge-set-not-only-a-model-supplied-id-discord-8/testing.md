---
change: discord-post-message-checks-the-acting-discord-user-the-bridge-set-not-only-a-model-supplied-id-discord-8
artifact: testing
---

# Testing

With `main`'s `plugins/discord/index.ts` swapped in,
`bun test tests/discord.requester-perms.test.ts` gives 15 pass and 6 fail: the
acting-user deny, allow, mismatched requesting id, strict-mode, throwing-check
and live-login-refused tests fail (on `main` the acting user is never checked,
a mismatched id is checked instead, strict refuses, and the post goes out).
Review added one test (a second requester id beside the acting user's): with
`main`'s source 15 pass / 7 fail, with the pre-review branch source 21 pass /
1 fail (only the first value was compared, so the second id was ignored and the
post went out). With the branch: 22 pass, 0 fail.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-012` (acting user checked) | `tests/discord.requester-perms.test.ts` | acting env set, no `--requesting-user-id`: a denying checker is called once with the acting id, the result is exit 3 "cannot send" naming the acting id, and the `fetch` spy saw no post; an allowing checker → one POST to `/channels/999/messages`, checked for the acting id. |
| `REQ-discord-012` (mismatched requesting id) | `tests/discord.requester-perms.test.ts` | acting env set, `--requesting-user-id OTHER`, `--requesting-user-id=OTHER`, `--requester OTHER`, and a second id beside the acting user's (`--requesting-user-id ACTOR --requester OTHER`, the reverse, the flag repeated, the `=` form then the space form) → exit 3 "different Discord user … Nothing was posted"; checker never called; no post. The acting id passed as the flag → the one check for the acting user, one post. |
| `REQ-discord-012` (strict mode) | `tests/discord.requester-perms.test.ts` | acting env set + `CORVIDINHO_DISCORD_REQUIRE_REQUESTER_CHECK=1`, no flag → checked for the acting user and posted; acting env unset + strict, no flag → "requesting_user_id is required". |
| `REQ-discord-012` (fail closed, SAFE-6) | `tests/discord.requester-perms.test.ts` | acting env set, checker throws `Used disallowed intents (login with <token>)` plus a stack line → exit 3 "could not check that the acting Discord user can post", names Server Members Intent, no token value, no stack line, no post; real discord.js `Client.prototype.login` stubbed to throw → exit 3 with the reason, no post. |
| `REQ-discord-012` (allowlist first) | `tests/discord.requester-perms.test.ts` | acting env set, channel not allowlisted, mismatched flag → exit 3 allowlist refusal (not the mismatch), checker not called, no post; the existing flag-path allowlist test still passes. |
| `REQ-discord-012` (acting env empty/unset unchanged) | `tests/discord.requester-perms.test.ts` | acting env `""`: no flag posts without a check; unset: the flag checks the named user; unset + a throwing checker still rejects; the four existing plugin tests pass unchanged. |

## Automated coverage

- `bun test tests/discord.requester-perms.test.ts tests/docs.operator-facts.test.ts tests/discord.presence.test.ts`
- `bun test`, `bunx tsc --noEmit`, `specsync check --require-coverage 100`, `fledge lanes run verify --non-interactive`
