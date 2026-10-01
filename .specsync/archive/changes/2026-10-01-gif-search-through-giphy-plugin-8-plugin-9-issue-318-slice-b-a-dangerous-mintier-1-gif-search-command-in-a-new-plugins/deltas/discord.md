---
module: discord
change:
gif-search-through-giphy-plugin-8-plugin-9-issue-318-slice-b-a-dangerous-mintier-1-gif-search-command-in-a-new-plugins
---

# Delta: discord (the GIPHY key is a SAFE-6 secret env name; a GIPHY link is never put in an embed, #318 slice B)

## Modified

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
characters that is plain prose (no code fence, no user or role mention, no
link on a GIPHY media host — `hasGiphyMediaLink`, `plugins/gif/hosts.ts`,
because a GIF a run posts as a link (PLUGIN-8) shows only when Discord
unfurls it, which it never does inside an embed) and fits one embed
description (4096 characters) SHALL go out as one embed holding the text and
the footer, unless it carries a Choose button or mentions someone to ping. The Discord spawn client SHALL take the answer from the `result`
frame uncut up to `DISCORD_ANSWER_MAX` (6000 characters; the frame already
caps it at 4000) instead of the 1800-character chat body, and SHALL return the
run's last `usage` frame; WATCH comments (1800) and schedule posts (1500) SHALL
keep their own caps. The gateway reply, message edit and slash adapters SHALL
cap content at 2000 (not 1900) and the gateway reply SHALL carry an optional
embed. No env var, config key, slash command, schema or protocol change.

Acceptance Criteria
- A chat answer over 4000 characters with a code block across the 2000 mark: the first part is edited into the thinking message and the rest are fresh posts; every part is at most 2000 characters with balanced fences; the block is closed at a part end and reopened with its language; every line of the answer appears in order; the footer rides only the last part; each part's message id continues the session.
- Long plain prose (over 2000, within 4096, no code fence or mention) goes out as one embed whose description is the answer and whose footer is the answer footer; no extra posts.
- An answer holding a GIPHY media link (`media.giphy.com`, `media0`–`media4.giphy.com`, `i.giphy.com`, any case) is never an embed: within 2000 characters it is one plain message (the link in its content) with the footer embed, and as long plain prose it goes out as split parts, the link in a part's content and the footer on the last; another link, a `giphy.com` page URL or a look-alike host keeps the one-embed path (`tests/discord.rich-reply.unit.test.ts`, which fails on the slice A head).
- An answer ending with the role note keeps the note whole at the end of the last part; no earlier part carries it.
- Without an editable thinking message, the fallback reply is split the same way: the first part replies to the request with the answer's allowed mentions, later parts reply to nothing and allow no mention, the footer is on the last part.
- A button pick's resumed long answer is split into the stub the same way.
- `/work` and `/session start` long answers are split (collapsed: later parts posted by the thinking outbound; fallback: the deferred reply holds the first part and the slash `post` sends the rest with no mentions), the footer on the last part.
- The text is scrubbed before the split: a token across the 2000 boundary never reaches a part raw.
- A line longer than a message is cut at a space; a hard cut never leaves a lone surrogate.
- The Discord spawn client returns a 3800-character result-frame answer uncut and the last `usage` frame; the WATCH client returns the same answer cut at 1800.
- The live gateway reply sends a 2000-character part in full with its embed.
- `tests/discord.rich-replies.test.ts` fails on the base sources (13 of 14; the WATCH guard passes on both) and passes on the branch.

### REQUIREMENT REQ-discord-417

Errors shown to an operator SHALL be one SAFE-6 line, and a rejected Discord
login SHALL end the bridge start cleanly (CLI-4, SAFE-6).

- `formatErrorLine(err, { env?, max? })` in `src/store/scrub.ts` SHALL return
  the error message only (a `TypeError` / `RangeError` / `ReferenceError` /
  `SyntaxError` keeps its class name; other names are dropped), with the
  literal value of each set secret env var from `.env.example`
  (`DISCORD_TOKEN`, `DISCORD_BOT_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`,
  `CORVIDINHO_LLM_API_KEY`, `OPENAI_API_KEY`, `CORVIDINHO_AUDIT_HMAC_KEY`,
  `BRAVE_SEARCH_API_KEY` (PLUGIN-7) and `GIPHY_API_KEY` (PLUGIN-8; neither
  has a vendor shape, so each is redacted by name);
  values of 8+ characters) replaced by `[redacted:env-secret]`, then passed
  through `scrubSecrets`, cut to its first line and capped at
  `ERROR_LINE_MAX` (300) characters. It SHALL NOT throw; an unprintable value
  gives `(unprintable error)`.
- `startBridge` SHALL catch a rejected `gateway.start()`, stop the
  half-started gateway (the schedule ticker is not started yet) and return
  `{ ok: false, exitCode: 1, message }` with
  `message = formatDiscordLoginFailure(err, { env })` (the bridge's env, so a
  token passed only in `startBridge({ env })` is redacted too): discord.js
  `TokenInvalid`
  counts as 401; on 401/403 it is
  `discord login failed (<status>): check DISCORD_TOKEN (<line>)`; otherwise
  `discord login failed: <line> — check DISCORD_TOKEN and that discord.com is
  reachable`.
- `formatRegisterCommandsFailure(err, { what?, guildHint?, env? })` in
  `src/discord/register-commands.ts` SHALL return one line
  `[discord] <what> (<status>): <line>` (`what` defaults to
  `register-commands failed`; no status part when the error has none), adding
  `— check DISCORD_TOKEN / DISCORD_BOT_TOKEN and <guildHint>` (default
  `--guild-id`) on 401/403. The bridge's slash registration on gateway ready
  SHALL log it with `what: "slash command registration failed"` and
  `guildHint: "DISCORD_GUILD_ID"`, never the DiscordAPIError object (stack,
  `rawError`, `requestBody`).

Existing start refusals (missing token, empty channel allowlist) are
unchanged. No new env var, slash command, CLI flag, table or column.

Acceptance Criteria
- `startBridge` whose gateway `start()` throws discord.js `TokenInvalid` returns `{ ok: false, exitCode: 1 }` with `discord login failed (401): check DISCORD_TOKEN (An invalid token was provided.)` and calls the gateway's `stop()` once.
- A `DiscordAPIError` with status 403 gives `discord login failed (403): check DISCORD_TOKEN …` on one line with no `rawError`.
- `corvidinho discord bridge` with a token Discord rejects exits 1 with that line and no stack, crash footer or token value.
- `formatErrorLine` returns only the first line, redacts vendor-key shapes (including a multi-line private-key block) and the value of a set secret env var of 8+ characters (`BRAVE_SEARCH_API_KEY` and `GIPHY_API_KEY` included, `tests/web.search.test.ts`, `tests/gif.search.test.ts`; a GIPHY request URL in an error keeps only `key=[redacted:env-secret]`), keeps shorter values, keeps the `TypeError:` prefix, drops `DiscordAPIError[0]`, handles strings, `{message}` objects, numbers, empty messages and null-prototype objects, and caps at `ERROR_LINE_MAX`.
- A token that is only in the `startBridge` env and appears in the login error text is redacted in the returned message.
- `formatRegisterCommandsFailure` on a `DiscordAPIError` 403 `Missing Access` with the bridge options gives `[discord] slash command registration failed (403): Missing Access — check DISCORD_TOKEN / DISCORD_BOT_TOKEN and DISCORD_GUILD_ID` with no `requestBody` and no newline; with defaults a 401 names `--guild-id`, a status-less error gets no hint, and a secret env value is redacted.
