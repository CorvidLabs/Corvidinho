---
change: where-a-repo-uses-hi-it-drafts-criteria-and-asks-the-owner-on-a-card-before-capturing-them-agent-18-hi-drafts
artifact: research
---

# Research

- Sources: issue #89 (body and three comments: Leif's decision that other
  repos follow their own gates; the v0.0.30/0.0.31 rollups saying nothing
  drives hi draft-then-ask), the interview record
  `/home/user/coord/interview-2026-09-28.md` (round 3: capture AGENT-18 as
  written; round 13: the SpecSync reach call), the slice entry for
  `repo-ways-4` in `/home/user/coord/m34-synthesis.json`, and the repo-ways
  rows of `/home/user/coord/m34-defaults.md` (only Corvidinho's owner
  confirms, through the SAFE-18 DM card; owner and team runs and the local
  CLI draft, community and workers don't; capture always needs Approve).
- #348 (merged as 8bf4422f): `hiChangesSince` / `hiChangesFromSnapshot`, the gate in
  `runTask`, the `/work` PR step and `github-pr-create` inside a run all go
  through the two comparison functions, so the allowance lives there once.
- #316 (the approvals engine): kinds with their own store (`forget`) and
  `onApprove` inside an IMMEDIATE transaction; `mayDecide` is the owner
  re-check per press; delivery after chat runs, on ticks and on its poll.
- The `hi` CLI (checked here): `hi <ID> "<text>"` appends to the family's
  file (a dotted id under its parent), refuses an id that exists (also a
  retired one) and a dotted id with no parent, creates a new family file for
  an unknown family, collapses a newline in the text, and on a first capture
  writes `INTENT.md`, `hi/AGENTS.md` and `hi/CLAUDE.md` when missing.
  Multi-part families (e.g. `DISCORD-SCHEDULE`) are not declared families,
  so their ids are not drafted. Hence: new ids only, declared families only,
  one-line text, and a full snapshot of `hi/` plus `INTENT.md` for the undo.
- SESSION-WORKTREE: a talk worktree is removed when its session is parked,
  and its branch deleted when it has no commits of its own; `git worktree
  add <path> <branch>` brings back one whose branch survived.
