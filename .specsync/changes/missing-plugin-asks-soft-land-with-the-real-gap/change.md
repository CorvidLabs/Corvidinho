---
id: missing-plugin-asks-soft-land-with-the-real-gap
state: implementing
type: feature
base_commit: a93c60a64b8ffbd54f2ea345a76dcd1bfa7eabf5
---

# Missing-plugin asks soft-land with the real gap

## Intent

Missing-plugin asks soft-land with the real gap

## Affected Canonical Specs

- `agent`

## Acceptance Criteria

- An ask that names a plugin or tool which is not installed, not allowlisted, or missing its configured key gets a concrete reply stating that gap, and cites a captured HI id or an open PR number only when that id or PR is actually present. It does not invent a provider such as Tenor and does not ask a generic install question when the message already names the plugin. A community session is not given mutating tools. When the named capability is already offered, the run is not replaced by that reply.

## No-spec Rationale

Not applicable
