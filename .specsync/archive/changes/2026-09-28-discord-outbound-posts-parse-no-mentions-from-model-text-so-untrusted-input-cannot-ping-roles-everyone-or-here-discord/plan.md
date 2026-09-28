---
change: discord-outbound-posts-parse-no-mentions-from-model-text-so-untrusted-input-cannot-ping-roles-everyone-or-here-discord
artifact: plan
---

# Plan

1. Regression tests `tests/discord.allowed-mentions.test.ts` (fail on main).
2. Helper module + gateway client default + explicit payloads + plugin REST.
3. Spec files / Public API / Invariants; delta Added REQ-discord-205;
   `docs/discord.md` outbound formats.
4. `specsync change approve` → `specsync change check --commit` →
   `fledge lanes run verify --non-interactive` → scoped review → finalize.
