---
id: thin-ack-gate-ignores-identity-5-mention-trailer-so-bot-ok-still-restates-pending-asks-follow-up-to-discord-user-lookup
state: approved
type: feature
base_commit: c200ca2e34d7e2dc4a2599f7e04d5417e7606fa2
---

# Thin-ack gate ignores IDENTITY-5 mention trailer so <@bot> ok still restates pending asks (follow-up to discord-user-lookup soft-land)

## Intent

Thin-ack gate ignores IDENTITY-5 mention trailer so <@bot> ok still restates pending asks (follow-up to discord-user-lookup soft-land)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- After stripMentions appends [mentioned: Discord user id …], isThinAck/isCancelAsk run on promptBodyForAskGate(prompt) so '<@bot> ok' still thin-acks a pending ask (AUTONOMY-5/6) while the full prompt keeps snowflakes for discord-user-lookup (IDENTITY-5). Fixture: tests/discord.slash-pending-ask.test.ts fallback @mention ok.

## No-spec Rationale

Not applicable
