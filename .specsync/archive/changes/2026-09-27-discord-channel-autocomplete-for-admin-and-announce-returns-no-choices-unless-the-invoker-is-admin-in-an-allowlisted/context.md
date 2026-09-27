---
change: discord-channel-autocomplete-for-admin-and-announce-returns-no-choices-unless-the-invoker-is-admin-in-an-allowlisted
artifact: context
---

# Context

- Scoping found that channel autocomplete on `/admin channels add|remove` and
  `/announce channel` has no permission or channel check. `gateway.ts` sends
  every autocomplete interaction to `respondChannelAutocomplete`, which builds
  choices for anyone. No slash command sets `default_member_permissions`, so
  every guild member can trigger it.
- Effect on `origin/main` (fbaa84b): a non-owner typing into `/admin channels
  remove` gets the allowlisted channel names and ids. In `channels add` or
  `/announce channel` they get every guild text channel the bot can see. This
  also happens from a channel that is not allowlisted.
- Captured HI (`hi/discord.md`, `hi/admin.md`):
  - **DISCORD-DENY-3**: "Non-admins get zero response (no DM, no public
    message, no reaction). … never leak allowlist guidance to non-admins."
  - **ADMIN-4**: "Every admin-shaped command re-checks permission at handler
    time (DISCORD-7); registration alone is never enough, and empty
    owner/admin lists mean nobody is ADMIN."
- Out of scope: open PR #232 (the actor gate and mute/rate limit for ask
  button presses) and open PR #233 (SAFE-3 shell clamp). Neither touches
  autocomplete.
