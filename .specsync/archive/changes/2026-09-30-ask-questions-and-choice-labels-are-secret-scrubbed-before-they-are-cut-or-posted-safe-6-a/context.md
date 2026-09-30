---
change: ask-questions-and-choice-labels-are-secret-scrubbed-before-they-are-cut-or-posted-safe-6-a
artifact: context
---

# Context

Leif's 2026-09-28 interview, round 12 (2026-09-29, M1/M2 rollup gaps): "Ask
labels (DISCORD-ASK / SAFE-6): scrub before cut — each ask question and
choice label is secret-scrubbed first, then cut; a label that held a secret
shows [redacted]; applies to what is posted and what is stored." Captured in
this PR with `hi` as SAFE-6.a "Ask questions and choice labels are scrubbed
for secrets before they are cut or posted." (parent SAFE-6).

The gap on `origin/main` `5aaf7f0`:

- `normalizeQuestion` (`src/agent/ask.ts`) cut the question at
  `ASK_QUESTION_MAX` (1500) with no scrub. Every later scrub (the stored
  `pending_ask`, `schedule_runs.ask_question`, the posts) ran on the cut
  text, so a key the cut split kept `ghp_` plus fewer than 20 raw characters,
  below the pattern's minimum, and was stored raw.
- `cleanLabel` (`src/agent/ask-options.ts`) cut each option label at 80 with
  no scrub, and `buildChoiceComponents` (`src/discord/ask-buttons.ts`)
  posted `label.slice(0, 80)` with no scrub at all: a label holding a whole
  key reached the Choose-pick buttons raw (only the stored row was
  scrubbed), and a split key stayed raw in the row and after a restart.

Constraints: bug fix with the new sub-criterion; smallest change; reuse
`scrubSecrets`; keep option ids as #265 left them (a secret-looking id
becomes its position); no env var, config key, flag, data field, schema or
scrub-rules version change; #232/#233 scope untouched.
