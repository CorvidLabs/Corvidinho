---
change: in-a-hi-repo-it-never-changes-the-criteria-itself-any-hi-change-no-approved-capture-made-blocks-done-and-the-pr-agent
artifact: research
---

# Research

- Sources: issue #89 (body and three comments: Leif's decision that other
  repos follow their own gates; v0.0.30/v0.0.31 rollups saying nothing
  detects or drives hi draft-then-ask), the interview record
  `/home/user/coord/interview-2026-09-28.md` (round 3: capture AGENT-18 as
  written), the slice entry `/home/user/coord/pr-repo-ways-3.json` and the
  repo-ways rows of `/home/user/coord/m34-defaults.md` ("File tools refuse
  all of hi/. The gate blocks any criterion or retired-entry change without
  an approved capture, and any other hi/ file change except one Corvidinho's
  own capture made" — a conservative default, not a Leif decision).
- #329 (`src/agent/repo-ways.ts`): `detectRepoWays` / `scanRepoWays` with the
  hi flag the union of the session base (`repoWaysBase`), HEAD and the
  working tree; the run ledger (`beginSddRun`) keyed by cwd; the SpecSync
  coverage gate in `runTask` (`sddGateNote`) and in `openWorkPr`.
- #321 (`src/agent/test-evidence.ts`) and #329 put their checks in the same
  gate set: a failed verify with the note leading, retried, then failed
  with the stuck ask. The hi guard joins that set rather than forking it.
- hi file shape (`hi export` on this repo): criteria are
  `- **ID**  text` bullets (sub-criteria indented), retired entries sit
  under `## Retired` with a `retired: <why>` continuation line. Parsing the
  files directly works at any git revision (`git cat-file`), so the base
  side needs no `hi` binary.
- The file tools resolve paths with symlinks followed (`resolveProjectPath`),
  so judging the resolved path catches a link into hi/.
