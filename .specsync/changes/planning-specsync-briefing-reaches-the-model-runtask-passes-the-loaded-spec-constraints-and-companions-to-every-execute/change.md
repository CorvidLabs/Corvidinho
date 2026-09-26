---
id: planning-specsync-briefing-reaches-the-model-runtask-passes-the-loaded-spec-constraints-and-companions-to-every-execute
state: implementing
type: bug_fix
base_commit: e8bbd215036e7dc8739ac9159afa19f17ae943c6
---

# Planning SpecSync briefing reaches the model: runTask passes the loaded spec constraints and companions to every execute attempt and the LLM user message carries them fenced as project data (AGENT-2, SPECSYNC-1/5)

## Intent

Planning SpecSync briefing reaches the model: runTask passes the loaded spec constraints and companions to every execute attempt and the LLM user message carries them fenced as project data (AGENT-2, SPECSYNC-1/5)

## Affected Canonical Specs

- `agent`

## Acceptance Criteria

- task run with a registry and a matching module spec sends that spec's Invariants and companion files to the model on every attempt (tool loop and read tier), fenced as project data in the user message, secret-scrubbed and capped at 8000 chars; no match or no task text leaves the model messages unchanged

## No-spec Rationale

Not applicable
