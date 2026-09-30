---
change: ask-questions-and-choice-labels-are-secret-scrubbed-before-they-are-cut-or-posted-safe-6-a
artifact: docs
---

# Docs

- `docs/discord.md` (open asks paragraph): the question and choice labels
  are scrubbed before they are cut to their caps (1500 / 80) or posted, so a
  question or label that held a secret shows `[redacted:<kind>]` on the
  buttons, in the posts and in the stored ask even when the cut falls inside
  the secret (SAFE-6.a).
- `specs/discord/discord.spec.md`: `cleanAskLabel` export and the
  scrub-before-cut sentence; new scenario "A secret the cut would split is
  redacted, not cut (SAFE-6.a)"; `tests/discord.ask-scrub-first.test.ts`
  added to `files:`.
- `specs/agent/agent.spec.md`: ask section names `cleanAskLabel` and the
  scrub-before-cut order.
- `specs/discord/testing.md`, `specs/agent/testing.md`: evidence entries.
- `hi/safe.md` + `INTENT.md` index: SAFE-6.a captured with `hi` (separate
  commit). README and `docs/DISCORD-GO-LIVE.md` say nothing this changes;
  no CHANGELOG/STATUS/package.json edit.
