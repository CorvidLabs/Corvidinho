---
id: ask-questions-and-choice-labels-are-secret-scrubbed-before-they-are-cut-or-posted-safe-6-a
state: archived
type: bug_fix
base_commit: c56ce4978bb7990e6064d6673aa60ba02267e056
---

# Ask questions and choice labels are secret-scrubbed before they are cut or posted (SAFE-6.a)

## Intent

Ask questions and choice labels are secret-scrubbed before they are cut or posted (SAFE-6.a)

## Affected Canonical Specs

- `discord`
- `agent`

## Acceptance Criteria

- Each ask question (ASK_QUESTION_MAX 1500, normalizeQuestion) and choice label (80, cleanAskLabel) is SAFE-6 scrubbed before it is cut, and Discord option buttons scrub their labels before the 80-char cut; a question or label whose secret straddles the cut shows [redacted:<kind>] and never a raw piece shorter than the scrub pattern, in what is posted (Choose-pick buttons, the Answer stub and form, an ask restated after a restart, schedule ask posts) and what is stored (discord_sessions.pending_ask, schedule_runs.ask_question); option ids keep today's behaviour (a secret-looking id becomes its position, other ids byte-identical); regression tests fail on main and pass here; no new env var, config key, flag, command, data field, schema or scrub-rules version change

## No-spec Rationale

Not applicable
