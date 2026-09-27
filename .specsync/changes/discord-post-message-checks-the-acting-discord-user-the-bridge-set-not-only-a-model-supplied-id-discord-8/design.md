---
change: discord-post-message-checks-the-acting-discord-user-the-bridge-set-not-only-a-model-supplied-id-discord-8
artifact: design
---

# Design

All in `plugins/discord/index.ts` (`discord-post-message` handler):

1. Channel allowlist gate (unchanged, still first).
2. `actingDiscordUser(process.env)` = trimmed
   `CORVIDINHO_ACTING_DISCORD_USER_ID` (empty outside the bridge).
3. Acting user set and a non-empty `--requesting-user-id` / `--requester`
   that differs from it → refuse, exit 3, "names a different Discord user …
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
