---
module: discord
change: discord-button-pick-resume-injects-the-presser-s-display-name-and-username-like-a-chat-message-identity-4
---

# Delta — discord (button-pick resume carries the presser's Discord names)

## Added

### REQUIREMENT REQ-discord-446

Every interactive Discord agent run (an @mention / reply / thread chat
message, an ask button pick resume, `/session start` and `/work`) SHALL
prepend the IDENTITY-4 acting-user block to the spawn prompt: the acting
user's Discord id and, when one is known, a display name. The display name SHALL be the
configured owner's display when the acting user is the owner and it is set,
else the Discord display name on that message or interaction, else its
Discord username; when none is known the block SHALL carry the id only and
SHALL NOT invent a name (IDENTITY-4). An ask button pick resume SHALL take
the names from the press itself: the live gateway SHALL set
`ComponentInteraction.userDisplayName` (guild member display, then member
nickname, then user global name, then user display) and
`ComponentInteraction.userUsername`, trimmed, blank as absent, and the
bridge SHALL pass them to `enrichPromptWithIdentity` as the chat path passes
the message author's. The presser is the session's user (another user's
press never resumes), so the names describe the acting user. No new slash
command, env var, config key, table or column.

Acceptance Criteria
- A non-owner's button-pick resume prompt has `display_name` from the press's Discord display name, or from its username when there is no display name.
- The owner's button-pick resume keeps the owner map display and the `role: owner (ADMIN)` line; the Discord names do not replace the owner display.
- A button pick with no names known injects the Discord id only, with no `display_name` line.
- `componentActorNames` resolves member display → member nickname → user global name → user display for the display name and trims the username; blank or missing values are `undefined`.
- A discord.js button press through the live gateway's InteractionCreate listener reaches `onComponent` with the presser's `userDisplayName` and `userUsername`, and with neither when no name is known.
- The chat path, `/session start` and `/work` keep their identity inject unchanged.
- No new slash command, env var, config key, table or column; SQLite schema version unchanged.
- Regression tests in `tests/discord.identity-pick.test.ts` fail on `main` and pass after.
