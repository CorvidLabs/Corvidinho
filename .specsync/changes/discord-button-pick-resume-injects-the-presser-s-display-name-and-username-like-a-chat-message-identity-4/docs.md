---
change: discord-button-pick-resume-injects-the-presser-s-display-name-and-username-like-a-chat-message-identity-4
artifact: docs
---

# Docs

- `docs/discord.md` file map: the identity + memory inject line says every
  Discord run (chat, button pick, `/session start`, `/work`) gets the acting
  user's id plus their Discord display name or username when known, owner
  map display winning for the owner.
- `specs/discord/discord.spec.md` Public API: the `identity-inject.ts`
  paragraph names `ComponentInteraction.userDisplayName` / `userUsername`
  from `componentActorNames` and the button-pick resume; the new test file
  is in `files:`.
- `specs/discord/testing.md`: new "Button-pick resume identity" section.

No README, CHANGELOG or STATUS change; no version bump.
