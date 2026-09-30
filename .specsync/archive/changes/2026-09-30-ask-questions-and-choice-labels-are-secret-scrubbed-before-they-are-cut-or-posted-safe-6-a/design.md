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
- Scrub, cut, then scrub the cut text once more: a marker the cut itself
  falls inside is cut like other text (`[redacted:gith…`); the raw key never
  survives. The post-cut scrub (review fix) only matters when the cut ends a
  key shape: the one pattern anchored after the key is the AWS key id
  (`\b` after 16 characters), so `AKIA` plus a longer run of capitals is no
  key until a cut keeps exactly 16 of them before `…`. Its marker (18
  characters) is shorter than the id (20), so the text stays within its cap,
  and without it normalizing a stored ask again changed that label
  (REQ-agent-045) and the pick's ack showed the id while the button and the
  stored row were redacted. Any other match in the cut text would already
  have matched before the cut, so the second scrub never lengthens it.
- Stored rows: `pendingAskBody` and `storedAsk` keep their scrub as a
  backstop; they now see scrubbed text. Reloaded rows pass `askFromUnknown`,
  so they are scrubbed before they are cut too. No `SCRUB_RULES_VERSION`
  bump: a split piece already stored cannot be matched by any rule.
