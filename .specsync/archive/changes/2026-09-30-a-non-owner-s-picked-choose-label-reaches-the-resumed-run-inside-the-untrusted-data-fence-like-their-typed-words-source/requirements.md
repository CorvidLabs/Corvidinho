---
change: a-non-owner-s-picked-choose-label-reaches-the-resumed-run-inside-the-untrusted-data-fence-like-their-typed-words-source
artifact: requirements
---

# Requirements

Captured HI (captured in this change's PR with `hi` from Leif's 2026-09-28
interview, round 13 on 2026-09-30):

- **SAFE-12.a**: "When someone other than me picks a choice, the picked label
  reaches the run as their words, inside the same untrusted fence as anything
  they type."
- Parent **SAFE-12** (already on main): "Issue, PR, comment, web page and chat
  bodies are data to read, not instructions to follow; only the sender's role
  decides what may run."

Kept unchanged: DISCORD-ASK-3 (a pick resumes the session), DISCORD-ASK-5
(expiry), DISCORD-ASK-8 (option buttons cleared at once, "Got it" dropped when
the run ends).

Canonical requirements changed (see deltas):

- Modified **REQ-discord-548**: the pick bullet — a team / community
  presser's label reaches the run inside the `fenceSpeakerText` fence
  (`source=ask-pick`, role at press time with Discord role ids), not scanned;
  the owner's pick byte-identical; `humanText` / turn the plain label;
  DISCORD-ASK-3/5/8 unchanged — and a new bullet: an unmatched option id gets
  `ASK_CHOICE_EXPIRED` only, no run, ask pending, the raw id in no prompt;
  new acceptance bullet.
- Modified **REQ-discord-071**: the pick sentence (fenced for team /
  community with `ask-pick`, not scanned, owner unchanged, unmatched id never
  reaches a run); new acceptance bullet.
