---
change: discord-a-reply-or-forward-that-references-a-tracked-bot-message-never-continues-the-session-outside-an-allowlisted
artifact: docs
---

# Docs

- `specs/discord/discord.spec.md`: new test in `files:`, Public API line for
  `replyReferenceMessageId` / `REFERENCE_TYPE_FORWARD` / `RawMessageReference`,
  and one invariant line (own channel must be allowlisted; forwards and
  other-channel references are not replies).
- No operator doc change: `docs/discord.md` already says MessageCreate
  (@mention / reply / thread) outside the allowlist is silent; this fix makes
  forwards and cross-channel references honor it.
- No CHANGELOG / STATUS / package version edits (release PRs own those).
