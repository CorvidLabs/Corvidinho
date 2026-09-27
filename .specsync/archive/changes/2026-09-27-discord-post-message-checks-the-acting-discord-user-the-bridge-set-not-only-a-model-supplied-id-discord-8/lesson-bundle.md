# Lesson bundle — discord-post-message-checks-the-acting-discord-user-the-bridge-set-not-only-a-model-supplied-id-discord-8

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord-post-message checks the acting Discord user the bridge set, not only a model-supplied id (DISCORD-8)
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: plugins/discord/index.ts, tests/discord.requester-perms.test.ts, docs/discord.md, docs/DISCORD-GO-LIVE.md, .env.example, specs/discord/requirements.md, specs/discord/discord.spec.md, specs/discord/testing.md
- **Acceptance**: In a run the bridge started (non-empty CORVIDINHO_ACTING_DISCORD_USER_ID), discord-post-message runs the DISCORD-8 requester check (ViewChannel + SendMessages via verifyRequesterCanSend) for the acting user even without --requesting-user-id, and refuses with nothing posted when that user lacks View or Send; a --requesting-user-id (or --requester) naming a different user is refused with nothing posted and is never checked in place of the acting user; strict mode is met by the acting user's check; a check that cannot run (Guild Members login refused because Server Members Intent is off, timeout, checker throws) refuses (fail closed) with one scrubbed reason line (SAFE-6) and nothing posted; the channel allowlist deny still wins first; with the acting env empty or unset (operator plugins run, local task run, WATCH) behaviour is unchanged (flag check when given, strict refuses a missing id, a throwing check still throws); fixture tests in tests/discord.requester-perms.test.ts fail on main and pass here; no new env var, flag, config key or command

## Evidence

- Verification commit: `2cb20409bfdac55d0c3c6aca89e75e1f14fa0895`
- Base commit: `606b993d7175c2f32759e3f02865492e5e884389`
- Verified by: `specsync check --spec cli --spec discord`

## From the change's context.md

# Context

DISCORD-8 (captured in `hi/discord.md`): "If the agent tries to post to
another channel on my behalf, the bridge checks that *I* could have posted
there, not only that the bot could."

On `main` (606b993), `discord-post-message` read the requester only from argv
(`--requesting-user-id` / `--requester`) and ran `verifyRequesterCanSend` only
when the model passed one. Since v0.0.32 an allowlisted dangerous tool is
offered to the model in the owner's runs (chat, `/session start`, `/work`;
`docs/DISCORD-GO-LIVE.md` E.3). In those runs the bridge already sets the
acting user in `CORVIDINHO_ACTING_DISCORD_USER_ID` (REQ-discord-021), but the
plugin never read it, so:

- a post without `--requesting-user-id` checked only that the bot could post;
- a `--requesting-user-id` naming some other user ran the check for that user,
  not for the person the run acts for;
- strict mode (`CORVIDINHO_DISCORD_REQUIRE_REQUESTER_CHECK`) trusted whatever id
  the model supplied.

Constraints: bug fix only; no new env var, flag, config key, slash command,
schema bump or package bump; no CHANGELOG edit. The other open PRs (#232 ask
button actor gate, #233 SAFE-3 clamp) are not touched. Tracked by issue #76
(lists DISCORD-8 as captured).

## From the change's design.md

# Design

All in `plugins/discord/index.ts` (`discord-post-message` handler):

1. Channel allowlist gate (unchanged, still first).
2. `actingDiscordUser(process.env)` = trimmed
   `CORVIDINHO_ACTING_DISCORD_USER_ID` (empty outside the bridge).
3. Acting user set and any non-empty `--requesting-user-id` / `--requester`
   value (every occurrence of either alias) that differs from it → refuse, exit 3, "names a different Discord user …
   Nothing was posted." (checked before the token lookup; no check runs).
   A requesting id equal to the acting user is accepted.
4. Token lookup (unchanged).
5. `checkUserId = actingUserId || requestingUserId`. When set, run
   `verifyRequesterCanSend(channelId, checkUserId, …)`. A throw is caught only
   when an acting user is set: refuse, exit 3, "could not check that the acting
   Discord user can post in channel … so nothing was posted: <formatErrorLine>
   … Server Members Intent …". Without an acting user the throw propagates as
   before. A failed verdict refuses with the existing reason + fix hint (now
   naming the checked user).
6. Strict mode refuses only when there is neither an acting user nor a
   requesting id, which is the old rule when the acting env is unset.
7. Dry-run data reports the checked user (`actingUserId || (requestingUserId ?? null)`).

Design choices pending Leif:

- A requesting id naming someone other than the acting user is refused, not
  silently replaced with the acting user, so a model that tries to post "as"
  someone else gets a clear refusal.
- Fail closed when the acting user's check cannot run (Server Members Intent
  off, login timeout, checker error): nothing is posted and the error says why.
  An operator who allowlists `discord-post-message` for the owner's runs
  therefore needs Server Members Intent on.
- Operator / local / WATCH runs (no acting user) keep today's behaviour,
  including a throwing live check propagating as an error.

## From the change's testing.md

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

## Where these lessons go

- `specs/discord/context.md`
