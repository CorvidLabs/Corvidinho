---
module: agent
change: ask-option-ids-come-out-unique-so-choose-buttons-open-and-a-pick-resumes-with-the-pressed-label-a-reply-after-a-button
---

# Delta: agent (ask option ids come out unique, DISCORD-ASK-1/3)

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
