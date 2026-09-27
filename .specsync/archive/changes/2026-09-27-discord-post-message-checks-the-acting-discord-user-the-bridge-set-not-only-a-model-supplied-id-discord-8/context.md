---
change: discord-post-message-checks-the-acting-discord-user-the-bridge-set-not-only-a-model-supplied-id-discord-8
artifact: context
---

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
