---
change: in-a-specsync-repo-it-opens-and-works-a-specsync-change-for-its-edits-and-on-corvidinho-it-approves-and-archives-its
artifact: requirements
---

# Requirements

- AGENT-18 (captured on main, Leif 2026-09-28 interview, round 3): "It works
  each repo's own way: a SpecSync change where the repo uses SpecSync; where
  it uses hi, it drafts criteria and asks before capturing, never inventing
  them; and Trust where the repo uses Trust." This change builds the
  SpecSync clause (partial: hi drafting and Trust are later PRs).
- AGENT-18.a (captured in this change with `hi`, round 13 of 2026-09-30):
  "On Corvidinho it may approve and archive its own SpecSync change once
  verify is green; in other repos a human approves, reviews and finalizes."
- Kept: AGENT-14 (no off switch: the coverage check has no key or flag),
  AGENT-15 / AGENT-15.a (real diff, evidence verdict, carried baseline),
  AGENT-4 / AGENT-4.a (a failed check retries with its note), SAFE-1 (approve
  and finalize are dangerous: allowlist), SAFE-5 (audit), IDENTITY-9..12
  (roles resolved in the tool layer), SPECSYNC-4 (the change machinery is
  never turned off), PROCESS-3 (agents may approve their own work on
  Corvidinho) and PROCESS-4 (not elsewhere).
- Added: REQ-agent-518 (repo ways, prompt block, the coverage gate),
  REQ-agent-519 (own change approved and archived after a green lane on
  Corvidinho, then verified again), REQ-plugins-518 (change status / new /
  answer tools, hi citations, `agentTool`), REQ-plugins-519 (approve /
  finalize tools and their gate), REQ-discord-518 (/work coverage before
  commit and push).
- Modified: REQ-agent-002 (the coverage check comes before the lane; the lane
  runs again after the own-change steps), REQ-agent-065 (team `/work`
  catalog gains new / answer; `agentTool: false` never offered),
  REQ-agent-086 (the change tools are state-changing), REQ-plugins-065
  (`TEAM_WORK_TOOLS`), REQ-plugins-114 (tool-surface budget ~9000).
- No new env var, config key, flag, slash command, table, schema version or
  NDJSON field.
