---
id: autonomy-1-2-ask-human-tool-and-stuck-owner-ping-on-discord-44
state: verifying
type: feature
base_commit: 8205b1bb66eb18aa63328e4690de3dba0f8b6ecc
---

# AUTONOMY-1/2 ask-human tool and stuck owner ping on Discord (#44)

## Intent

AUTONOMY-1/2 ask-human tool and stuck owner ping on Discord (#44)

## Affected Canonical Specs

- `agent`
- `discord`

## Acceptance Criteria

- Tool loop offers an ask-human tool; calling it ends the run with state blocked and TaskResult.ask {reason clarify, question} instead of claiming done (AUTONOMY-1); verify retries exhausted keep state failed and add ask {reason stuck} (AGENT-4 + AUTONOMY-2); CLI text/json/ndjson surface the question; Discord mention replies and schedule posts show the question and mention the configured owner with allowedMentions limited to that owner, skipping the ping when no owner is configured (AUTONOMY-2 / IDENTITY-3); fixture tests only; specsync + fledge verify green

## No-spec Rationale

Not applicable
