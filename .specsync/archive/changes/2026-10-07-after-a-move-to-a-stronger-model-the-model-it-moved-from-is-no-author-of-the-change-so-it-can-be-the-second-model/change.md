---
id: after-a-move-to-a-stronger-model-the-model-it-moved-from-is-no-author-of-the-change-so-it-can-be-the-second-model
state: accepted
type: bug_fix
base_commit: 54d6a6c777f51b4fa430511a5d7f049a8ba42083---

# After a move to a stronger model, the model it moved from is no author of the change, so it can be the second-model reviewer (AGENT-17.a, GITHUB-9.a)

## Intent

After a move to a stronger model, the model it moved from is no author of the change, so it can be the second-model reviewer (AGENT-17.a, GITHUB-9.a)

## Affected Canonical Specs

- `agent`

## Acceptance Criteria

- With CORVIDINHO_LLM_MODEL=fake-weak,fake-strong and the order fake-weak,fake-strong, a code-tier run whose weak model says Done. twice moves to fake-strong, which changes README.md; the run's review authors() is [fake-strong] only and resolveReviewer picks fake-weak (on main authors() is [fake-weak, fake-strong] and resolveReviewer is null, so no PR); in a worker whose lead's authors name fake-weak it stays an author after the move; tests/agent.stall-escalate.test.ts, the full suite and verify pass

## No-spec Rationale

Not applicable
