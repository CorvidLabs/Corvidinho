---
id: hear-live-thinking-status-discord-3-edit-in-place-progress-embeds-elapsed-time-current-tool-rough-token-use-while
state: archived
type: feature
base_commit: f987ded8770b32beffa2ed0a3c96b0ce0bc30906
---

# HEAR live thinking status DISCORD-3: edit-in-place progress embeds (elapsed time, current tool, rough token use) while session runs; steal corvid-agent progress-response/embeds patterns; no ProcessManager; fixture tests; STATUS Done refresh for HEAR thin #5→#23 and attribution #20→#24

## Intent

HEAR live thinking status DISCORD-3: edit-in-place progress embeds (elapsed time, current tool, rough token use) while session runs; steal corvid-agent progress-response/embeds patterns; no ProcessManager; fixture tests; STATUS Done refresh for HEAR thin #5→#23 and attribution #20→#24

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- On start/continue session the bridge posts one progress embed (not silent void); edits it in-place with elapsed time and optional current tool / rough token use while agent runs; marks Done (or error) when complete then posts final reply; no ProcessManager; allowlists unchanged (default-deny); fixture/unit tests without live Discord token; STATUS Done lists HEAR thin #5→#23 and attribution #20→#24; SpecSync + fledge verify green

## No-spec Rationale

Not applicable
