---
id: tool-loop-dispatches-only-tools-offered-in-the-run-s-catalog-safe-1-agent-5-pr-128-review-follow-up-a-registered-but
state: approved
type: bug_fix
base_commit: a9feb0fde12d55d7625957eb869ce49665c631d3
---

# Tool loop dispatches only tools offered in the run's catalog (SAFE-1 / AGENT-5, PR #128 review follow-up): a registered but not-offered (e.g. dangerous or above-tier) plugin name from the model is refused instead of run; memory store test updated for soft-deleted re-store history

## Intent

Tool loop dispatches only tools offered in the run's catalog (SAFE-1 / AGENT-5, PR #128 review follow-up): a registered but not-offered (e.g. dangerous or above-tier) plugin name from the model is refused instead of run; memory store test updated for soft-deleted re-store history

## Affected Canonical Specs

- `agent`

## Acceptance Criteria

- The LLM tool loop only runs plugins present in the tool catalog it offered for this run (tier + danger filtered); any other registered name (e.g. dangerous danger-ping or memory-forget when dangerous tools are not offered) returns a refused tool result and never reaches runPlugin even in interactive mode with an allowlist; offered tools behave as before; memory store fixture reflects soft-deleted re-store history; fixture tests + SpecSync + fledge verify green

## No-spec Rationale

Not applicable
