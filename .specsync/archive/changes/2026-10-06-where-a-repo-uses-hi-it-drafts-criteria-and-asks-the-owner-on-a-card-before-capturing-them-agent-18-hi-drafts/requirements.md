---
change: where-a-repo-uses-hi-it-drafts-criteria-and-asks-the-owner-on-a-card-before-capturing-them-agent-18-hi-drafts
artifact: requirements
---

# Requirements

- AGENT-18 (captured, `hi/agent.md`, Leif 2026-09-28 round 3), quoted: "It
  works each repo's own way: a SpecSync change where the repo uses SpecSync;
  where it uses hi, it drafts criteria and asks before capturing, never
  inventing them; and Trust where the repo uses Trust." Built here: "drafts
  criteria and asks before capturing" (with the guard's allowance for an
  approved capture). Not built here: Trust (parallel PR). No new hi capture.
- Kept: AGENT-18.a (unchanged), AGENT-14 / AGENT-15 (one verify gate; an
  approved capture is the only hi/ change it lets through), SAFE-5 (every
  capture audited, `started` first), SAFE-6 (a draft scrubbing would change is
  refused), SAFE-18 / SAFE-20 (the owner's DM card; no answer is no),
  IDENTITY-9..12 (role re-resolved in the tool layer at every attempt and
  call), PROCESS-1 (criteria change only through a confirmed capture).
- Added: REQ-agent-521 (`hi-draft`: who gets it, what it checks, the request,
  how the run ends), REQ-agent-522 (the guard leaves out exactly what approved
  captures made), REQ-discord-521 (the owner's `hi` card: owner-only, Approve
  runs `hi` in the session worktree after re-creating it or failing closed,
  audit rows, outcome post, delivery after chat and `/work` runs and on the
  poll; the engine's optional `prepare` step).
- Modified: REQ-agent-520 (the gate leaves out an approved capture; the
  prompt block names `hi-draft` only when offered), REQ-discord-520 (`/work`
  likewise), REQ-plugins-520 (the refusal text names the card and
  `hi-draft`).
- No env var, config key, flag, NDJSON field or protocol change. Two
  module-owned tables (`hi_capture_requests`, `hi_capture_files`) by
  `CREATE TABLE IF NOT EXISTS`; no schema version bump.
