---
id: collapsed-ask-pings-notify-when-an-answer-is-delivered-by-editing-the-thinking-message-discord-ask-6-7-and-mentions-the
state: archived
type: bug_fix
base_commit: dc65cf70d4a46d59c35f80acd91822df3eddf3f1
---

# Collapsed ask pings notify: when an answer is delivered by editing the thinking message (DISCORD-ASK-6/7) and mentions the requester or owner, one short fresh post pings exactly those users (AUTONOMY-2/4, SAFE-8), without double pings

## Intent

Collapsed ask pings notify: when an answer is delivered by editing the thinking message (DISCORD-ASK-6/7) and mentions the requester or owner, one short fresh post pings exactly those users (AUTONOMY-2/4, SAFE-8), without double pings

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- When a chat, button-pick, /work or /session start answer is delivered by editing the thinking message (DISCORD-ASK-6/7 collapse) and that answer mentions the requester (clarify, AUTONOMY-4) and/or the owner (stuck AUTONOMY-2, spend-cap or 80% warning SAFE-8), the bridge sends one short fresh post (a reply to the edited message) containing only those mentions and a one-line pointer (requester: '↑ question for you'; owner: '↑ needs you'), with allowed mentions limited to exactly those users (no @everyone, no roles). No extra post when the answer mentions nobody, when it went out as a fresh reply (fallback path), or for a user a fresh post already pinged this turn (the slash owner notice from #160); a spend-cap ask already pinged this cap episode still carries no owner mention, so no ping. The one-message layout of DISCORD-ASK-6/7 is otherwise unchanged; a failed ping post never fails the turn. No new slash command, env var or schema.

## No-spec Rationale

Not applicable
