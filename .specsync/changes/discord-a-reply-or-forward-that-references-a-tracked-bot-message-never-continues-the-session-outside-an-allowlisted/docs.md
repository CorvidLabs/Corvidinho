---
change: discord-a-reply-or-forward-that-references-a-tracked-bot-message-never-continues-the-session-outside-an-allowlisted
artifact: docs
---

# Docs

- `specs/discord/discord.spec.md`: new test in `files:`, Public API line for
  `replyReferenceMessageId` / `REFERENCE_TYPE_FORWARD` / `RawMessageReference`,
  and one invariant line (own channel must be allowlisted; forwards and
  other-channel references are not replies).
- `docs/discord.md` (review follow-up): the deny table gains an ask-button
  row (same ephemeral answer as slash, no resume) and one line saying a
  message counts in the channel it was sent in, so a forward or other-channel
  reply never continues a session, and a button resumes only while the
  session's channel is still allowlisted. `componentChannelAllowlisted` is
  added to the spec Public API line and the invariant line.
- No CHANGELOG / STATUS / package version edits (release PRs own those).
