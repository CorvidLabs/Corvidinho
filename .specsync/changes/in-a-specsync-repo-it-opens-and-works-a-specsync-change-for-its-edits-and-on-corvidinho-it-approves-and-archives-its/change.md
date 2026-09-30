---
id: in-a-specsync-repo-it-opens-and-works-a-specsync-change-for-its-edits-and-on-corvidinho-it-approves-and-archives-its
state: draft
type: feature
base_commit: d238d2d4e59deb3924042b0dacb52fc4479dfc76
---

# In a SpecSync repo it opens and works a SpecSync change for its edits, and on Corvidinho it approves and archives its own change once verify is green (AGENT-18 SpecSync clause, AGENT-18.a)

## Intent

In a SpecSync repo it opens and works a SpecSync change for its edits, and on Corvidinho it approves and archives its own change once verify is green (AGENT-18 SpecSync clause, AGENT-18.a)

## Affected Canonical Specs

- `agent`
- `plugins`
- `discord`

## Acceptance Criteria

- AGENT-18 (captured on main; its SpecSync clause, partial: the hi-drafting and Trust clauses are later PRs) and AGENT-18.a (captured in this PR with hi from Leif's 2026-09-28 interview, round 13 of 2026-09-30): detectRepoWays(root, base) reads the SpecSync change workflow, hi and Trust from the session base, HEAD and the working tree (union, so a deletion or commit mid-run can't switch a way off); a run names the ways in one Text line and the tool loop gets one fixed prompt block; specsync-change-new / -answer (mutating, minTier 2, TEAM_WORK_TOOLS) refuse --root and a repo whose workflow is off, and in a hi repo an acceptance_criteria answer must cite hi ids hi export shows as captured; specsync-change-status is read-only; in a repo whose sdd.json requires a change for meaningful files, a changed meaningful path no open change covers fails the verify gate before the lane (retry with the note) and keeps /work from committing or pushing (sdd-uncovered); on Corvidinho only (the checkout this code runs from, origin github.com/CorvidLabs/Corvidinho) runTask, right after a green evidence-backed lane, runs specsync-change-approve then specsync-change-finalize (check, review, finalize) for the changes this run opened, through runPlugin (role, SAFE-1 allowlist, must-ask, SAFE-5), then runs the lane again; elsewhere the tools refuse with the human line and the run says the change stays open for a human; the tools are never offered to the model and refuse in WATCH, schedules, workers and community runs

## No-spec Rationale

Not applicable
