---
change: in-a-specsync-repo-it-opens-and-works-a-specsync-change-for-its-edits-and-on-corvidinho-it-approves-and-archives-its
artifact: research
---

# Research

- Sources: issue #89 (body, Leif's 2026-09-26 decision, two progress
  comments), the interview record `/home/user/coord/interview-2026-09-28.md`
  (round 3, round 13), the slice record `/home/user/coord/pr-repo-ways-1.json`,
  the repo-ways rows of `/home/user/coord/m34-defaults.md` and the
  `specsync-change-reach` question in `/home/user/coord/m34-synthesis.json`
  ("SpecSync's CI audit stays red until the change is approved").
- SpecSync 6.0.0, checked in scratch clones of this repo: `change new` makes
  `.specsync/changes/<id>/` (`state.json`: `id`, `affected_paths`, …) and
  prints the interview; `change approve --actor` needs complete artifacts
  and deltas matching the affected specs; `change audit` reports "meaningful
  changed paths are not covered by an active change" and counts a change
  only once `change check` has verified it; `change check` materializes the
  deltas and runs `verification_commands`; `change review --reviewer` and
  `change finalize` work on an uncommitted tree and finalize moves the folder
  to `.specsync/archive/changes/<date>-<id>/` with no GitHub call.
- `specsync init` writes `sdd.json` with SpecSync's default
  `meaningful_paths` and `ignored_paths` (`.specsync/`, `specs/`) where
  `.specsync/sdd.json` is meaningful despite `.specsync/` being ignored: the
  more specific entry wins.
- `hi export` JSON: `files[].families`, `files[].criteria[].id` (captured),
  `files[].retired[]` (retired, kept apart).
- `Bun.which(name)` reads the PATH the process started with; passing
  `{ PATH: process.env.PATH }` uses the current one.
- `runGit` never searches parent directories, so a repo's ways are read at
  its top level (the run's cwd).
