---
change: it-can-merge-its-own-corvidinho-pr-when-i-ask-and-every-gate-is-green-never-its-gates-never-someone-else-s-github-7
artifact: requirements
---

# Requirements

- GITHUB-7 (captured on main, `hi/github.md`, Leif 2026-09-28 round 4) and
  GITHUB-7.a (captured with `hi` in this change from the same interview
  record, round 16 of 2026-10-06), quoted in context.md. Both are built here.
- Kept: GITHUB-1..6 (typed tools, dangerous writes, repo gate), GITHUB-9 /
  9.a (review before a PR; not a merge gate), SAFE-1 (allowlist), SAFE-5
  (audit), SAFE-18..20 (cards, one-time code, no answer is no), SAFE-21.a
  (shell has no GitHub credentials), AUTONOMY-9..11 (the must-ask list),
  IDENTITY-9..12 (owner only, role in the tool layer), DISCORD-SCHEDULE-1.a
  (owner schedules still never merge), PROCESS-3 / PROCESS-4 (unchanged:
  this tool is the runtime's, not the coordinator's).
- Added: REQ-plugins-099 (the tool and its gate), REQ-agent-099 (offered
  only to the owner's own interactive run; a merge is a state change).
- Modified: REQ-plugins-097 (the `merge` class and card kind), REQ-plugins-095
  (`<command>:<reason>` denied rows), REQ-agent-097 (prompt sentence and the
  wait line).
- No env var, config key, flag, NDJSON field, protocol or schema change.
- IDENTITY-12.a (#374, on main) is kept: the owner's GitHub-triggered WATCH
  run keeps the owner's other tools; only `github-pr-merge` is held back
  there, by the tool layer itself.
