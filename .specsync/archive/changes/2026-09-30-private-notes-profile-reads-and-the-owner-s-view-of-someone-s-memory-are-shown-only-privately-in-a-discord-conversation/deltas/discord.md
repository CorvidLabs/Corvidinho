---
module: discord
change: private-notes-profile-reads-and-the-owner-s-view-of-someone-s-memory-are-shown-only-privately-in-a-discord-conversation
---

# Delta — discord (private replies by DM only)

## Added

### REQUIREMENT REQ-discord-710

The bridge shows private notes, profile reads and the owner's view of
someone's memory only privately (MEMORY-7.a, #101). The Discord agent client
SHALL read the result frame's `privateReplies` with
`privateRepliesFromUnknown` (`src/discord/private-reply.ts`; anything but
an array none) onto `AgentSpawnResult.privateReplies`, bounded with
`boundPrivateReplies`, which `task run` also uses on its own result
(REQ-cli-710): non-blank strings only, at most `PRIVATE_REPLIES_MAX` (5), each
secret-scrubbed first (SAFE-6: a cut never leaves a token prefix a later scrub
misses) and then cut to `PRIVATE_REPLY_TEXT_MAX` (6000) characters ending in
the visible `PRIVATE_REPLY_CUT_MARKER`, never inside a surrogate pair; when
more came than are kept, the last one kept SHALL end with a line saying how
many more were not sent; a bounded list SHALL come back unchanged.

On a chat reply, a button pick resume, an Answer form submit resume,
`/session start` and `/work` the bridge SHALL, before the answer goes out,
send each private reply to the person who asked (the message author, the
presser / submitter, the slash invoker) by direct message only
(`deliverPrivateReplies` over the gateway's `sendDm`, the forget card's DM
path; `SlashContext.sendDm` for slash): `PRIVATE_DM_HEADER` then the text,
secret-scrubbed (SAFE-6), `@everyone` / `@here` defanged and then split under
the 1900-character DM cap, so the gateway's own defang and cap never cut a
part. The channel answer SHALL get `PRIVATE_SENT_NOTE` on top when every part
went out,
else `PRIVATE_NOT_SENT_NOTE` (no DM path, a part refused or throwing) —
never a channel fallback — and SHALL never hold the text; the session thread
records only the answer as posted. Schedules and WATCH SHALL never post
`privateReplies` (the plugins refuse those reads there). No new config key
or env var.

Acceptance Criteria
- `privateRepliesFromUnknown` keeps non-empty strings, at most 5, each at most 6000; through it `boundPrivateReplies` keeps 5 of 8 texts with "3 more private results were not sent" on the last, cuts an over-long text with the cut marker — a token straddling the cut redacted, no lone surrogate — and returns a bounded list unchanged; `deliverPrivateReplies` returns null with none, "sent" with every part out (≤1900 each, scrubbed, header first, and still ≤1900 after the gateway's defang with a text full of `@everyone`), "failed" with no `sendDm`, a null or a throwing send; `withPrivateNote` puts the note on top.
- Chat: one DM to the author with the text; the channel (posts, embeds, content edits) carries `PRIVATE_SENT_NOTE` and the model's answer, never the text; the session thread never records it; with the DM failing the channel carries `PRIVATE_NOT_SENT_NOTE` and the text is nowhere.
- A button pick and an Answer form submit resume DM the presser / submitter, with the note in the channel.
- `/session start` and `/work` DM the invoker with the note in the channel; with no `sendDm` the channel carries `PRIVATE_NOT_SENT_NOTE`.
- End to end through the real `task run` spawn, the client returns both private texts.
- `tests/memory.private-view.test.ts` covers each and fails on main.
