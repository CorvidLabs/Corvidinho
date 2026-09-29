---
module: discord
change: discord-rich-final-replies-answer-footer-with-model-tokens-cost-and-time-tokens-and-cost-owner-only-and-fence-safe
---

# Delta — discord (rich final replies: footer and fence-safe splits, DISCORD-15/15.a/16)

## Added

### REQUIREMENT REQ-discord-075

The bridge SHALL deliver a final answer longer than Discord's 2000-character
message limit as several messages of at most 2000 characters each
(DISCORD-16), on every answer path: the chat reply, the answer to a run a
button pick resumed, `/work` and `/session start`, collapsed into the thinking
message and on their reply fallbacks. The answer SHALL be secret-scrubbed
before it is split (SAFE-6). A split SHALL follow line breaks (a line longer
than a message is cut at a space in its back half, else hard, never inside a
surrogate pair) and SHALL NOT break a fenced code block: a message that ends
inside a block SHALL close it and the next message SHALL reopen it with the
same language; a block that opened partway through a message SHALL move whole
to the next message when the message runs out of room; a block still open at
the end SHALL be closed. A closing ROLES-CHAT-3 role note (REQ-agent-333) SHALL
stay whole in the last message. The first message SHALL be the one the answer
went out in before (the thinking message edited in place, the fallback reply,
or the deferred slash reply); later messages SHALL be fresh posts that reply
to nothing and allow no mention except, on a fresh-reply path, a user first
mentioned in that message; the answer's footer (REQ-discord-457) and any
Choose button SHALL ride the last message, and a reply to any of the messages
SHALL continue the session (DISCORD-2). Embeds SHALL be used only where they
read better than plain text and never for code: an answer over 2000
characters that is plain prose (no code fence, no user or role mention) and
fits one embed description (4096 characters) SHALL go out as one embed holding
the text and the footer, unless it carries a Choose button or mentions someone
to ping. The Discord spawn client SHALL take the answer from the `result`
frame uncut up to `DISCORD_ANSWER_MAX` (6000 characters; the frame already
caps it at 4000) instead of the 1800-character chat body, and SHALL return the
run's last `usage` frame; WATCH comments (1800) and schedule posts (1500) SHALL
keep their own caps. The gateway reply, message edit and slash adapters SHALL
cap content at 2000 (not 1900) and the gateway reply SHALL carry an optional
embed. No env var, config key, slash command, schema or protocol change.

Acceptance Criteria
- A chat answer over 4000 characters with a code block across the 2000 mark: the first part is edited into the thinking message and the rest are fresh posts; every part is at most 2000 characters with balanced fences; the block is closed at a part end and reopened with its language; every line of the answer appears in order; the footer rides only the last part; each part's message id continues the session.
- Long plain prose (over 2000, within 4096, no code fence or mention) goes out as one embed whose description is the answer and whose footer is the answer footer; no extra posts.
- An answer ending with the role note keeps the note whole at the end of the last part; no earlier part carries it.
- Without an editable thinking message, the fallback reply is split the same way: the first part replies to the request with the answer's allowed mentions, later parts reply to nothing and allow no mention, the footer is on the last part.
- A button pick's resumed long answer is split into the stub the same way.
- `/work` and `/session start` long answers are split (collapsed: later parts posted by the thinking outbound; fallback: the deferred reply holds the first part and the slash `post` sends the rest with no mentions), the footer on the last part.
- The text is scrubbed before the split: a token across the 2000 boundary never reaches a part raw.
- A line longer than a message is cut at a space; a hard cut never leaves a lone surrogate.
- The Discord spawn client returns a 3800-character result-frame answer uncut and the last `usage` frame; the WATCH client returns the same answer cut at 1800.
- The live gateway reply sends a 2000-character part in full with its embed.
- `tests/discord.rich-replies.test.ts` fails on the base sources (13 of 14; the WATCH guard passes on both) and passes on the branch.

## Modified

### REQUIREMENT REQ-discord-457

When the bridge edits the thinking progress message into the final answer
(DISCORD-ASK-7: an @mention or reply, the answer to a run a button pick
resumed, `/session start`, `/work`), the edit SHALL keep one footer-only embed
(no description) whose footer text is the LLM model, then — only when the
acting user is the configured owner (DISCORD-15.a, SAFE-14.a) — the run's
tokens and cost, then the time the answer took, then the run's plumbing
(`state=… verified=… [verifySkipped] [cancelled] attempts=…`), joined by
` | `, so they stay visible without entering the answer body (DISCORD-3.a,
DISCORD-15). Tokens SHALL be the run's provider-reported total and the cost
that usage priced at the model's known list price (the SAFE-8 table); with no
usage reported the footer SHALL say `tokens unknown`, and with no usage or no
known price for the model `cost unknown` — never 0 or `$0` (SAFE-16). Anyone
else's footer SHALL show the model and the time (and the plumbing) and never
tokens or an amount; the live thinking status SHALL show token use only on the
owner's own runs. The embed SHALL be colored like the done or error status the
fallback would show. A Choose stub (the edit that carries buttons) SHALL carry
no embed (DISCORD-ASK-6, REQ-discord-047). A reply fallback (no editable
thinking message) SHALL carry the same footer on the answer's last message
(REQ-discord-075). A later re-edit SHALL keep the first footer, time included.
The answer body SHALL remain human text only.

Acceptance Criteria
- Mention answer collapsed into the thinking message: `content` is the summary and `embed` is `{ color, footer: { text: "<model> | <time> | state=… verified=… [verifySkipped] attempts=…" } }` with no description; no `✅ Done` embed edit.
- Button pick: the Choose stub edit has `embed: null`; the answer of the run the pick resumed, edited into that stub, carries the footer-only embed.
- `/session start` and `/work` collapsed answers carry the same footer-only embed; the body never contains `state=` or `attempts=`.
- Color: success unless the fallback would mark the status failed (a failed run without a question, or a stuck ask), then error.
- A later re-edit of the collapsed answer (SAFE-8 owner notice appended) keeps the same footer (same time) and color.
- With neither a model nor plumbing known the answer's footer is the time; the fallback without `editMessage` keeps its done/error status embed and its reply carries the answer footer on the last message.
- The owner's run with provider usage shows `<model> | <tokens> tokens | $<cost> | <time>`; with no usage `tokens unknown | cost unknown`; an unpriced model `cost unknown`; never `$0`.
- A run by anyone but the owner shows `<model> | <time>` (plus plumbing) and never `token` or `$`; its live status never shows `tok`, the owner's does.
- No new env vars, config keys, slash commands or schema changes.
