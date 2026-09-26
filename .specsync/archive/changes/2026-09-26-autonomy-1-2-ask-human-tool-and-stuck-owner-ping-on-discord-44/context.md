---
change: autonomy-1-2-ask-human-tool-and-stuck-owner-ping-on-discord-44
artifact: context
---

# Context

Issue #44 (M4 Safe autonomy): when Corvidinho is blocked on missing intent or
a human decision it should ask and ping the owner on Discord instead of
inventing an answer or going quiet. Leif confirmed and captured
**AUTONOMY-1..3** in `hi/autonomy.md`; his planning-interview comment on #44
confirms "when stuck, it asks a clarifying question **and** pings".

Before this change the tool loop had no way to stop and ask: a model that was
unsure either guessed or ended with a plain summary that runTask reported as
`done`. A run that exhausted verify retries replied on Discord with only
`session ... failed (exit 1)` and nobody was pinged.

Constraints: build only the captured slice. The owner is the ping target
because AUTONOMY-2 says "configured owner" and IDENTITY-1 already provides the
record. Not built (left for HI capture / other issues): a DM path to the owner
(#42 / Approve-Deny cards #96 are not captured; DISCORD-5 keeps posts in
allowlisted channels), escalation delay ("Leif too if it's still stuck"),
recording questions in MEMORY so answers resume with the question in context
(draft AUTONOMY-3 in docs/hi-drafts, not the captured AUTONOMY-3), loop-guard
(#86) and CI-fix retry limit (#94) asks, and pings from `/work` /
`/session start`.
