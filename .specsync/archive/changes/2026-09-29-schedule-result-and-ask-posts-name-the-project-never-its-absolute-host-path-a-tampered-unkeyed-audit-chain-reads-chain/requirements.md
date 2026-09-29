---
change: schedule-result-and-ask-posts-name-the-project-never-its-absolute-host-path-a-tampered-unkeyed-audit-chain-reads-chain
artifact: requirements
---

# Requirements

No new criteria captured (Leif's 2026-09-28 interview: W12 seeds, no new
criteria; the records name only captured ones):

- **REQ-discord-353** AC: a daemon run whose project cannot be resolved
  "keeps `project resolve failed: …` (with the host path) on the row and
  stores the fixed question; the bridge posts it with the owner ping and
  without the host path"; the question is fixed text, "never the host path
  or the error text (REQ-discord-418, SAFE-6)".
- **REQ-discord-418**: "SHALL NOT show an absolute host path to anyone but
  ADMIN" (`/schedule list` already shows non-ADMIN only the project name).
- **REQ-discord-095**: `/status` shows "a one-line chain summary (entries,
  OK / BROKEN at #n / unkeyed / unverifiable without key)".
- **REQ-plugins-095**: "without a key it is a SHA-256 integrity chain
  reported as unkeyed. `verifyAudit` SHALL recompute the chain and report
  the first tampered row; keyed rows are unverifiable without the key."
- **SAFE-5**: "Destructive actions leave a tamper-evident audit trail I can
  verify later." **SAFE-6**: secrets and host details stay out of chat.

Canonical requirements (deltas, both Modified — full text plus a paragraph
and one AC bullet):

- **REQ-discord-353**: every schedule post (`✅` / `❌` result, each ask
  post, in-process or delivery pass) names the project by `projectLabel`,
  never an absolute host path; the run row and the model prompt keep it.
- **REQ-plugins-095**: `formatAuditLine` reads `chain BROKEN at #N` for a
  break before any keyed row even without a key; only stopping at a keyed
  row without the key reads `cannot verify keyed rows (…)`.

No new REQ id, hi id, env var, config key, command, option or schema change.
