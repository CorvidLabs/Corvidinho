---
change: in-a-hi-repo-it-never-changes-the-criteria-itself-any-hi-change-no-approved-capture-made-blocks-done-and-the-pr-agent
artifact: requirements
---

# Requirements

- AGENT-18 (captured, `hi/agent.md`, Leif 2026-09-28 round 3): "It works
  each repo's own way: a SpecSync change where the repo uses SpecSync; where
  it uses hi, it drafts criteria and asks before capturing, never inventing
  them; and Trust where the repo uses Trust." Built here: the guard half of
  the hi clause. Not built: drafting and the capture card (repo-ways-4),
  Trust (repo-ways-2). AGENT-18 stays partial.
- Kept: AGENT-14 / AGENT-15 / AGENT-15.a (one gate, real diff, no opt-out),
  AGENT-4.a (retry feedback leads with the note), AGENT-18 SpecSync clause
  and AGENT-18.a (unchanged), SAFE-2 / SAFE-2.a (protected paths unchanged),
  GITHUB-5 / GITHUB-6 / GITHUB-9 (the /work PR gates unchanged), PROCESS-1
  (criteria change only through a confirmed capture).
- Added: REQ-agent-520 (the gate, the parse, the prompt block),
  REQ-plugins-520 (file tools refuse hi/ in hi repos), REQ-plugins-521
  (`github-pr-create` inside a run refuses while hi/ differs from the run's
  session base), REQ-discord-520
  (`/work` refuses its PR with `hi-changed` before commit, push and the
  fallback re-verify).
- No env var, config key, flag, NDJSON field, protocol or schema change.
