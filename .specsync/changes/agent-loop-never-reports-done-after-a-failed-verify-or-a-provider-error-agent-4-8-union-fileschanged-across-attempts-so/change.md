---
id: agent-loop-never-reports-done-after-a-failed-verify-or-a-provider-error-agent-4-8-union-fileschanged-across-attempts-so
state: draft
type: bug_fix
base_commit: e8bbd215036e7dc8739ac9159afa19f17ae943c6
---

# Agent loop never reports done after a failed verify or a provider error (AGENT-4/8): union filesChanged across attempts so a retry that changes nothing is re-verified, and provider/HTTP failures return an execute error flag that ends the run failed

## Intent

Agent loop never reports done after a failed verify or a provider error (AGENT-4/8): union filesChanged across attempts so a retry that changes nothing is re-verified, and provider/HTTP failures return an execute error flag that ends the run failed

## Affected Canonical Specs

- `agent`

## Acceptance Criteria

- A retry after a failed verify that changes no files is verified again and the run ends failed (non-zero exit) when retries run out, never done; filesChanged is the union across attempts; a provider or HTTP failure (bad key, 5xx, network error, malformed reply) sets ExecuteResult.error and runTask ends failed instead of done, with or without the verify gate

## No-spec Rationale

Not applicable
