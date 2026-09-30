---
change: ask-questions-and-choice-labels-are-secret-scrubbed-before-they-are-cut-or-posted-safe-6-a
artifact: requirements
---

# Requirements

- SAFE-6.a (captured in this PR from Leif's 2026-09-28 interview, round 12):
  "Ask questions and choice labels are scrubbed for secrets before they are
  cut or posted." Parent SAFE-6: "Secrets that look like vendor keys are
  scrubbed before sessions are saved, and I can re-scrub history when rules
  tighten."
- Interview design call (round 12): scrub before cut for each ask question
  (`ASK_QUESTION_MAX` 1500, `normalizeQuestion`) and choice label (80,
  `cleanLabel`); a label that held a secret shows `[redacted:<kind>]`;
  applies to what is posted on buttons / stubs / forms and what is stored
  (`pending_ask`); keep option ids behaviour (#265); covers chat asks,
  schedule asks, the Answer form stub and restated asks after restart;
  fail-on-main tests for a label/question whose secret straddles the cut, in
  the posted payload and the stored row; kind bug-fix.
- Modified (deltas): REQ-discord-066 (scrub-before-cut paragraph + five AC
  bullets) and REQ-agent-045 (scrub-before-cut paragraph + three AC bullets).
- No new REQ id, env var, config key, flag, command, data field, schema or
  scrub-rules version change.
