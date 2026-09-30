---
change: in-a-specsync-repo-it-opens-and-works-a-specsync-change-for-its-edits-and-on-corvidinho-it-approves-and-archives-its
artifact: context
---

# Context

- Issue #89 (WORK: follow each repo's own lifecycle) tracks AGENT-18. Its
  scope: detect each repo's tooling and drive its steps — SpecSync
  `change new` → implement → `specsync check` → verify → archive; hi draft →
  ask → capture; Trust where configured. Leif's decision on #89 (2026-09-26):
  in other repos it follows that repo's own gates; Corvidinho keeps its
  "no Trust re-add" stance.
- AGENT-18 was captured on main from Leif's 2026-09-28 interview (round 3).
  This change builds its SpecSync clause only (the slice record
  `/home/user/coord/pr-repo-ways-1.json`); the hi guard and hi drafts
  (repo-ways-3/4) and Trust (repo-ways-2) are later PRs, so AGENT-18 stays
  partial.
- AGENT-18.a is captured in this change with `hi` (first commit) from the
  interview's round 13 (2026-09-30, SpecSync reach): "On Corvidinho it may
  approve and archive its own SpecSync change once verify is green; in other
  repos a human approves, reviews and finalizes." It differs from the
  conservative default in `/home/user/coord/m34-defaults.md` (approve,
  review and finalize always human), and follows PROCESS-3.
- Before this change the agent could only read SpecSync changes
  (`specsync-change-list`, `specsync-ship-status`, SPECSYNC-4): nothing
  detected which ways a repo uses, nothing opened a change for the agent's
  edits, and nothing stopped a run in a SpecSync repo from ending verified
  with edits no change covers — which SpecSync's own CI audit then rejects.
- Main has #308 / #321 (the real-diff gate and the tests-ran evidence
  verdict) and #324 / #325 (the SAFE-3.a shell gate and the AGENT-11
  fallback in `runToolLoop`); this change extends the `loop.ts` gate set and
  touches only the prompt-block region of `runToolLoop`.
