---
change: discord-a-reply-or-forward-that-references-a-tracked-bot-message-never-continues-the-session-outside-an-allowlisted
artifact: context
---

# Context

Defect (confirmed by an end-to-end check of origin/main at `dc65cf7`): the
bot ran and posted in a channel that is not allowlisted. The owner sent a
message in channel OFF whose `referencedMessageId` was a tracked bot message
from an allowlisted channel — in real Discord a *forward*, which sets
`message.reference` with the source channel. The agent spawned and the
progress embed, its edits and the answer were posted in OFF.

Causes:

- `src/discord/message-router.ts` reply path let the message through when
  EITHER the session's channel OR the message's channel was allowlisted, so an
  allowlisted session's channel stood in for the message's own channel. The
  thread path had the same fallback to the session's channel.
- `src/discord/gateway.ts` MessageCreate took `message.reference.messageId`
  without checking the reference type (forward vs reply) or that
  `reference.channelId` is the message's channel.

Repro on main (bridge, dry run, injected agent, channel allowlist `chan-on`):
@mention in `chan-on` → tracked progress message `progress_1`; then two
messages in `chan-off` referencing `progress_1` → the agent ran 2 more
times and 4 posts/edits landed in `chan-off`
(`sends` channels `["chan-on","chan-off","chan-off"]`).

Constraints: DISCORD-5 / DISCORD-DENY-1 only — silent refusal, no new product
surface, no new env var, slash command, table or column; DISCORD-2 replies and
DISCORD-2.a threads under an allowlisted parent keep working.
