---
change: security-gate-tests-fail-when-the-gate-is-removed-safe-2-refuses-every-specs-path-github-deny-users-and-deny-orgs-win
artifact: plan
---

# Plan

1. Add the tests (files, git, watch router, community gate, requester perms).
2. Run them on main's source: all pass (no gate is broken).
3. Mutate each gate in turn, run the touched files, confirm the new tests
   fail, restore (`git checkout -- <file>`).
4. Spec testing evidence + deltas (REQ-plugins-493 Added; REQ-plugins-004 /
   083 / 182, REQ-watch-003, REQ-discord-012 Modified).
5. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
