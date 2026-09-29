---
change: free-text-asks-post-a-short-public-stub-with-the-question-and-one-answer-button-that-opens-a-private-form-its-submit
artifact: context
---

# Context

Wave M2 slice "free-text private modal" from Leif's 2026-09-28 interview
(record `/home/user/coord/interview-2026-09-28.md`, round 10: "Free-text asks
(DISCORD-ASK-1/2/4): public stub + private modal — requester presses
"Answer", types privately; a reply still works as fallback").

The criterion is already captured on main in `hi/discord.md` (landed with
#270), so this PR captures nothing new with `hi`:

- **DISCORD-ASK-4.a**: "When the choices can't be listed, the question still
  goes in the short public stub and the requester answers privately in a
  form; replying in the channel still works."

Parent criteria that still hold: DISCORD-ASK-2 (ask UI ephemeral / only the
requester), DISCORD-ASK-3 (answer continues that requester's session, no
public reply needed), DISCORD-ASK-4, DISCORD-ASK-5 (~30 min expiry, late press
"that choice expired"), DISCORD-ASK-6/7/8.

On the base (`53f2e5d`, as on `f1809a5` where this started) a free-text ask posts the quoted question with "Reply
to this message to answer." and no component; the only way to answer is a
public reply. The Choose-ask machinery (`src/discord/ask-buttons.ts`, the
session store's open asks, `onComponent` gates from #232 / REQ-discord-201 /
REQ-discord-010 / REQ-discord-212, the late-press closed asks of
REQ-discord-045, scrub-at-rest from #265) already exists and is reused.

Settled rules: specs only through SpecSync; v1 off-chain; #232/#233 scope not
touched (their gates are reused as they are). Kind feature, spec discord.
