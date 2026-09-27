---
change: planning-picks-spec-modules-from-the-request-not-the-bridge-wrapper-and-the-briefing-fence-and-cap-are-hardened
artifact: design
---

# Design

- `planningSelectionText(task)` in `src/agent/specLoader.ts`: drop every
  paragraph whose first line starts with `[Corvidinho ` (Corvidinho's own
  injected context blocks), then strip an all-caps bracket label at the start
  of a line (`[WATCH issue_comment]`). Lower-case brackets such as
  `[image: …]` are the human's own message and still count.
- `loadRelevantSpecs` selects on that text. Reading, extraction, companions
  and the briefing text itself are unchanged; so is the Planning Text event.
- `renderSpecBriefing` escapes any `<\s*/\s*specsync-briefing` (any case or
  spacing) and, when the cut would end on a high surrogate, cuts one char
  earlier.
- The agent module does not import the discord or watch modules; the
  `[Corvidinho ` prefix is the shared convention of the injected headers.
