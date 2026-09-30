---
change: an-answer-typed-in-the-private-answer-form-is-fenced-and-scanned-like-a-chat-reply-a-non-owner-s-submit-that-looks-like
artifact: docs
---

# Docs

- `docs/discord.md` "Untrusted text and injection attempts": an Answer form
  answer is fenced (SAFE-12) and a flagged one runs nothing, keeps the
  question open, is refused privately and pings only the owner in one post
  (SAFE-13). "Questions and owner ping": the form's answer is fenced and
  scanned like a reply.
- `docs/DISCORD-GO-LIVE.md` E.6.a: the Answer form in the fenced list and the
  refusal bullet.
- `specs/discord/discord.spec.md`: REQ-discord-548 paragraph, untrusted-text
  exports (`ask-answer`, `refuseInjectedAnswer`) and paragraph, new
  scenario; `specs/discord/testing.md`. Requirements through the delta.
- README and STATUS say nothing this makes false. No CHANGELOG / version edits.
