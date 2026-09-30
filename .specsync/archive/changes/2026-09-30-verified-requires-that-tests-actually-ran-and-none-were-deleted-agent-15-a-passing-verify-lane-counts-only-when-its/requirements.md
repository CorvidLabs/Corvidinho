---
change: verified-requires-that-tests-actually-ran-and-none-were-deleted-agent-15-a-passing-verify-lane-counts-only-when-its
artifact: requirements
---

# Requirements

- AGENT-15 (captured on main, Leif 2026-09-28 interview, round 2): "The real
  git diff decides what changed, and 'verified' requires that tests ran and
  none were deleted." This change builds the tests-ran / none-deleted half;
  the real-diff half and AGENT-15.a shipped in #308. Nothing new captured.
- Kept: AGENT-14 (no opt-out: the new checks have no key or flag),
  AGENT-4 / AGENT-4.a (a failed check retries with its note), FLEDGE-2/3 (the
  lane stays the gate; the AGENT-15 checks are additive), REQ-agent-502
  (non-git fail-closed rule), REQ-agent-015 (carried baseline).
- Added: REQ-agent-185 (tests ran and none deleted: summaries, names,
  non-git walk, fail closed), REQ-discord-185 (/work merge-base check and
  pre-push evidence).
- Modified: REQ-agent-002 (a passing lane is verified only with the
  REQ-agent-185 evidence).
- No new env var, config key, flag, slash command, table, schema version or
  NDJSON field.
