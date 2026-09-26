---
id: agent-run-summaries-are-secret-scrubbed-before-every-length-clip-and-a-private-key-block-cut-before-its-end-line-is
state: approved
type: bug_fix
base_commit: 5b0c8a64a53421a13f292eed646b2358f4545c72
---

# Agent run summaries are secret-scrubbed before every length clip, and a private-key block cut before its END line is redacted

## Intent

Agent run summaries are secret-scrubbed before every length clip, and a private-key block cut before its END line is redacted

## Affected Canonical Specs

- `agent`
- `discord`

## Acceptance Criteria

- a run summary whose stderr fallback, non-frame stdout or result summary holds a vendor token or PEM private key that straddles a length cap (500-char stderr fallback, 1800-char chat body, 4000-char result frame) comes out as [redacted:<kind>] with no raw token prefix or key body, so WATCH and Discord never post it; scrubSecrets redacts a BEGIN ... PRIVATE KEY block that has no END line through the next BEGIN line or end of text while still redacting full blocks in linear time; text with no secret is unchanged

## No-spec Rationale

Not applicable
