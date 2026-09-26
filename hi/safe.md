---
hi: 1
families: [SAFE]
owner: leif
---

# Safe

## Intent

Safety has to fire even when the model is having a bad day. Guards live in the tool layer: refuse the foot-gun, log the close call, and never depend on the prompt to save the repo.

## Criteria

- **SAFE-1**  Dangerous tools require my consent; in non-interactive mode they are denied unless I allowlisted them.
- **SAFE-2**  The agent cannot delete or overwrite protected project infra (env files, git metadata, fledge.toml, specs, keystores) through its file tools.
- **SAFE-3**  Shell commands cannot `cd` their way out of the project root to run elsewhere on my machine.
- **SAFE-4**  Destructive data ops (raw SQL wipes, memory deletes) need a two-phase confirm so a single confused tool call cannot erase the store.
- **SAFE-5**  Destructive actions leave a tamper-evident audit trail I can verify later.
- **SAFE-6**  Secrets that look like vendor keys are scrubbed before sessions are saved, and I can re-scrub history when rules tighten.
- **SAFE-7**  Web fetch and search refuse private and link-local targets so the agent is not an SSRF helper.
- **SAFE-8**  When a daily spend cap is set, I get a warning at 80% of it, and at 100% the agent asks me (an Approve card to continue) instead of refusing or quietly running up the bill.
- **SAFE-9**  Expensive cross-agent networking tools stay hidden until a session is allowed to use them, so small models cannot wander off starting councils unprompted.

## Notes (not numbered AC)

- Leif's decision on #98 (2026-09-26) amended the spend-cap criterion above: warn at 80%, ask at 100% (Approve card) rather than refuse.
- Non-ADMIN sessions refuse mutating tools at catalog + run time even when `dangerous: false` (notably files-write/edit): **ROLES-CHAT-2..5** in [`hi/roles.md`](roles.md).
