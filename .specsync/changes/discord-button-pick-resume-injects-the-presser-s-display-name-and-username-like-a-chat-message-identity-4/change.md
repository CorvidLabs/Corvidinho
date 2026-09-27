---
id: discord-button-pick-resume-injects-the-presser-s-display-name-and-username-like-a-chat-message-identity-4
state: verifying
type: bug_fix
base_commit: 1c7b6ced470e0ed87e4c854f2663111713af3fa7
---

# Discord button-pick resume injects the presser's display name and username like a chat message (IDENTITY-4)

## Intent

Discord button-pick resume injects the presser's display name and username like a chat message (IDENTITY-4)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- An ask button pick resume injects the presser's Discord identity like a chat message: a non-owner's resume prompt carries display_name from the press's Discord display name, or its username when there is none; the owner's pick keeps the owner map display and the owner role line; a pick with no names known injects the Discord id only, never an invented name. The live gateway sets ComponentInteraction userDisplayName (member display, nickname, global name, user display) and userUsername, trimmed, blank as undefined. No new slash command, env var, config key, table or column; SQLite schema unchanged. Regression tests fail on main and pass after.

## No-spec Rationale

Not applicable
