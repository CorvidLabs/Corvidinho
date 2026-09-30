---
change: ask-questions-and-choice-labels-are-secret-scrubbed-before-they-are-cut-or-posted-safe-6-a
artifact: design
---

# Design

- `src/agent/ask.ts` `normalizeQuestion`: CRLF → LF, control characters
  dropped, 3+ newlines folded, trimmed (as before), then `scrubSecrets`,
  then the `ASK_QUESTION_MAX` cut with `…`. Cleaning runs before the scrub so
  a control character inside a key cannot hide it from the pattern.
  `normalizeAskAnswer` already scrubbed first; the second scrub is a no-op.
- `src/agent/ask-options.ts`: `cleanLabel` becomes the exported
  `cleanAskLabel` — whitespace collapsed, trimmed, `scrubSecrets`, then the
  80 cut with `…`. Every option `normalizeAskOptions` and
  `parseChoicesFromQuestion` return goes through it. Option ids are
  untouched (the #265 position fallback stays).
- `src/discord/ask-buttons.ts` `buildChoiceComponents`: each button label is
  `cleanAskLabel(o.label)` instead of `o.label.slice(0, 80)`, so a label
  that reached the buttons without `resolveAskOptions` is scrubbed before it
  is cut too; custom_ids keep the option id byte-identical.
- One scrub then one cut (as the existing `clean` helpers do): a marker the
  cut itself falls inside is cut like other text (`[redacted:gith…`); the
  raw key never survives. No post-cut re-scrub (a Slack marker is longer
  than its shortest key, so it could push a label past Discord's 80).
- Stored rows: `pendingAskBody` and `storedAsk` keep their scrub as a
  backstop; they now see scrubbed text. Reloaded rows pass `askFromUnknown`,
  so they are scrubbed before they are cut too. No `SCRUB_RULES_VERSION`
  bump: a split piece already stored cannot be matched by any rule.
