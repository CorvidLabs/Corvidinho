---
change: the-collapsed-final-answer-keeps-a-footer-only-embed-with-the-model-and-state-verified-verifyskipped-attempts-while-the
artifact: context
---

# Context

DISCORD-3.a (`hi/discord.md`, captured): "Thinking/progress embed shows
model name and useful status (session id OK); state/verified/verifySkipped/attempts
live in the embed footer or description, never in the final chat reply body".

Gap on main (0940db3): `ThinkingStatus.buildThinkingFooter` appends the
plumbing only in the done/error phase, and `finalizeContent` (DISCORD-ASK-6/7)
edits the thinking message into the answer with `embed: null` without a
done/error flush. On the normal path (`editMessage` available: every live
gateway) the plumbing the bridge computes (`formatTaskPlumbing`) and the model
were shown nowhere; they appeared only on the fallback `done()`/`fail()`
path when the collapse edit was unavailable or failed. `docs/discord.md` said
the plumbing line shows "on done/error". Same for `/session start` and `/work`
(`finishSlashWithThinking`) and for the answer a button pick resumed.

Constraints: DISCORD-ASK-6 / REQ-discord-047 keep the Choose stub embed-free;
DISCORD-ASK-7 keeps one public message (a message can carry content and an
embed together). No new env vars, config keys, slash commands or schema bump.
Not the draft DISCORD-15/16 footer of issue #75 (tokens, cost, time): nothing
beyond the captured model + plumbing is shown.
