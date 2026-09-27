---
change: safe-8-x-discord-ask-7-issue-98-merge-of-208-work-and-session-start-answer-in-one-collapsed-message-and-keep-the-safe-8
artifact: research
---

# Research

- Discord does not notify mentions added by editing a message, so an owner
  ping inside the collapsed answer would be silent; the fresh post keeps the
  ping (and was already the #160 slash design).
- #208 also made `finalizeContent` close the status only on a successful
  edit, so the fallback's status call now runs; calling `finalizeContent`
  again on a collapsed status still edits the same message (it only returns
  null when closed without a message id), which is what appending the notice
  to the collapsed answer uses.
- An expired interaction token makes `deleteReply` / `editReply` throw after
  the answer may already be out; `onDelivered` separates "answer delivered"
  from "deferred reply resolved".
