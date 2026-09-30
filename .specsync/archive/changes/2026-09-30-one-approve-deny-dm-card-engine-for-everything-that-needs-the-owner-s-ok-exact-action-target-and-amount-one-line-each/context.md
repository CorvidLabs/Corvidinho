---
change: one-approve-deny-dm-card-engine-for-everything-that-needs-the-owner-s-ok-exact-action-target-and-amount-one-line-each
artifact: context
---

# Context

Issue #96 (M4 Safe autonomy). Leif's 2026-09-28 interview (round 3) confirmed
SAFE-18, SAFE-19 and SAFE-20, already captured in `hi/safe.md` on main:

- **SAFE-18** "When it needs my OK, it DMs me an Approve/Deny card with the exact action, target, amount, and diff or text."
- **SAFE-19** "Destructive actions and money actions also need a one-time code I type back; the code is valid once, only for that action, and expires quickly."
- **SAFE-20** "No answer, or an answer after the card expires, means no."

Round 6 put forget-me (MEMORY-ACL-6) on the SAFE-18 card; the peer order
settles v1 as off-chain ("ask at the spend cap"), so the money class exists
for the later SAFE-8 spend card. No new hi/ criterion is captured here.

What main had (1a251d1): one card kind. `src/discord/forget-card.ts` DMed
the owner an Approve/Deny forget card (#291/#301) with a count taken when it
was posted, re-resolved the targets on Approve (so more could be deleted
than shown), approved with one press, and was delivered only on scheduler
ticks and after a chat run. The card helper collapsed whitespace and had no
text/diff field; the gateway silently cut DMs, component replies/updates and
modal replies at 1900 and edits at 2000. No codes existed; anything but the
forget kind got "This card is no longer handled.".

Ruled out: the spend card (SAFE-8, next PR `spend-card`), SAFE-1 consent on
cards, and a session-wide "allow all" (issue #96 out of scope). Files of
#313 (loop guards: `src/discord/watch-ask.ts`, `src/watch/owner-ask.ts`) and
of #232/#233 are not touched; the bridge keeps #313's wiring beside the
engine's.
