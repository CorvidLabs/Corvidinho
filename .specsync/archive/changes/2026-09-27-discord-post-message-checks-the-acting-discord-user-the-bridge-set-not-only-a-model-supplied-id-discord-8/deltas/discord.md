---
module: discord
change: discord-post-message-checks-the-acting-discord-user-the-bridge-set-not-only-a-model-supplied-id-discord-8
---

# Delta — discord (DISCORD-8 requester check is for the acting user in bridge runs)

## Modified

### REQUIREMENT REQ-discord-012

When posting to a Discord channel on a user's behalf (`discord-post-message`
with requesting user id), the system SHALL verify that the requesting user
could post there (ViewChannel + SendMessages) — not only that the bot could
(DISCORD-8 / Merlin confused-deputy). Channel allowlist SHALL still gate first.
Optional strict mode SHALL refuse posts missing requesting user id. Archive
cross-channel-guard advisory SHALL NOT be treated as the ACL. Fixture tests
SHALL cover allow/deny without a live Discord token. The bridge SHALL NOT
introduce ProcessManager or weaken allowlists.

In a run the bridge started (a non-empty `CORVIDINHO_ACTING_DISCORD_USER_ID`,
set per spawn by the bridge, REQ-discord-021), the requesting user SHALL be
that acting user: `discord-post-message` SHALL run the requester check for the
acting user even when no `--requesting-user-id` is passed, and a
`--requesting-user-id` / `--requester` naming a different user SHALL be
refused with nothing posted, never checked in place of the acting user. When
the acting user's check cannot run (the Guild Members login is refused, times
out or errors), the post SHALL be refused with nothing posted and the error
SHALL say why in one scrubbed line (SAFE-6). With the acting env empty or
unset (operator `plugins run`, local `task run`, WATCH), the requester check
SHALL run only for a passed `--requesting-user-id` and strict mode SHALL
refuse a post without one, as before. No env var, flag, config key or command
is added.

Acceptance Criteria
- Requester lacks send/view → refuse; no post.
- Requester has View+Send + allowlisted channel → may post (dry-run ok in tests).
- Strict mode + missing requesting_user_id → refuse.
- Allowlist deny still wins before requester check.
- No ProcessManager; secrets out of repo; default-deny unchanged.
- Bridge run (acting user set), no `--requesting-user-id`: the check runs for the acting user; a denial refuses and nothing is posted; an allowed acting user posts once.
- Bridge run: `--requesting-user-id` / `--requester` naming another user → refused (exit 3), not checked, nothing posted; naming the acting user → the one check for that user.
- Bridge run + strict mode, no `--requesting-user-id` → the acting user's check satisfies strict mode.
- Bridge run, the check cannot run (the checker throws; the live Guild Members login is refused, e.g. Server Members Intent off) → refused (exit 3) with the reason in one scrubbed line that names Server Members Intent; the bot token never appears; nothing posted.
- Bridge run: the channel allowlist deny still wins before the acting user check.
- Acting env empty or unset: no flag posts without a check; the flag checks the named user; strict refuses a missing id; a throwing check still throws.
