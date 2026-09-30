---
module: agent
change: ask-questions-and-choice-labels-are-secret-scrubbed-before-they-are-cut-or-posted-safe-6-a
---

# Delta: agent (ask question and option labels scrubbed before they are cut — SAFE-6.a)

## Modified

### REQUIREMENT REQ-agent-045

`ask-human` SHALL accept an optional `options` array of short labels (2–5).
`askFromToolArguments` / `askFromUnknown` SHALL populate `HumanAsk.options`
when provided or when the question contains a numbered/lettered choice list
(`resolveAskOptions`). `ASK_AGENT_SYSTEM_INSTRUCTIONS` SHALL steer the model
to prefer options for Discord ephemeral buttons and free-text only when
choices cannot be listed.

`normalizeAskOptions` SHALL return option ids that are unique within the
ask, because each id rides in its option button's `custom_id` and a pick is
matched to its label by id (DISCORD-ASK-1/3): an id (explicit, cut to 32
chars, or the position fallback for a missing, empty or secret-looking id)
that an earlier kept option already holds SHALL take the first unused
position number (`1`, `2`, …), and a dropped empty option SHALL hold no id.
Options whose ids are already unique SHALL come out byte-identical, so
normalizing a stored ask again changes nothing and its open buttons keep
working. No new env var, flag or protocol field.

The question and every option label SHALL be SAFE-6 scrubbed before they
are cut (SAFE-6.a): `normalizeQuestion` (used by `askFromToolArguments` and
`askFromUnknown`) SHALL drop control characters and trim, then scrub, then cut
at `ASK_QUESTION_MAX` (1500); `cleanAskLabel` SHALL collapse whitespace, then
scrub, then cut at `ASK_OPTION_LABEL_MAX` (80), for structured options and
for choices parsed from the question. A secret the cut would split SHALL show
as `[redacted:<kind>]`, never as a raw piece. A question or label that was
cut SHALL be scrubbed once more, because the cut can end a key shape (an AWS
key id is matched only up to a word boundary); that marker is shorter than
what it replaces, so the text stays within its cap and normalizing it again
changes nothing. Option ids are unchanged: a secret-looking id still falls
back to its position.

Acceptance Criteria
- Tool args with options:2+ → HumanAsk.options set.
- Numbered question lines parse into options when structured options absent.
- Single or empty options do not set HumanAsk.options.
- `normalizeAskOptions([{id:"x",label:"Keep"},{id:"x",label:"Drop"}])` gives ids `x`, `1`; `[{id:"x"},{id:"x"},{id:"1"}]` (with labels) gives `x`, `1`, `2`.
- A position fallback equal to an earlier id moves on: `[{id:"2"},{id:"✅"}]` gives `2`, `1`; `["Yes",{id:"1",label:"No"}]` gives `1`, `2`.
- Two ids that are equal once cut to 32 chars stay apart (the second takes `1`).
- A dropped empty option holds no id (`[{id:"a",label:"  "},{id:"a"},{id:"b"}]` gives `a`, `b`).
- Already-unique options normalize byte-identically, and normalizing the result again changes nothing.
- ask-human arguments whose options repeat one id give option buttons with distinct `custom_id`s, and the second option's id finds the second label.
- A question whose fake key starts where the whole marker fits before the 1500 cut comes out `…[redacted:github-token]…` (1500 chars) from `askFromToolArguments` and `askFromUnknown`, and `formatAskSummary` carries no raw piece; for every cut position across the key no raw piece survives and the question stays within 1500.
- A label straddling the 80 cut comes out `…[redacted:github-token]…` from string options, `{id,label}` options and numbered question lines; for every cut position no raw piece survives and the label stays within 80; a secret-looking id still becomes its position.
- A numbered choice the question cap cuts is parsed from the scrubbed question.
- A label or question whose cut leaves `AKIA` plus 16 capitals before the `…` (a longer run that is no key id before the cut) comes out `…[redacted:aws-key]…` within its cap, and normalizing it again changes nothing.
