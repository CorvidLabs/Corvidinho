---
id: safe-2-a-the-file-tools-refuse-fledge-like-fledge-toml-and-specs-so-a-run-cannot-weaken-the-verify-lane-it-is-judged-by
state: archived
type: bug_fix
base_commit: 1d28c493ce59084e4a2a8cb09c3f7fc278289b0e
---

# SAFE-2.a: the file tools refuse .fledge/ like fledge.toml and specs/, so a run cannot weaken the verify lane it is judged by

## Intent

SAFE-2.a: the file tools refuse .fledge/ like fledge.toml and specs/, so a run cannot weaken the verify lane it is judged by

## Affected Canonical Specs

- `plugins`
- `discord`

## Acceptance Criteria

- files-write, files-edit and files-delete refuse any path with a .fledge component (existing lane and config files, a new lane file, a file planted as .fledge itself, ./ and ../ spellings, an absolute path, other letter case, a symlink to a lane file, a path through a symlink to .fledge/lanes, a dangling symlink to a missing lane file) with the same SAFE-2 refusal (exit 2) and the files unchanged or not created; files-read and files-list of .fledge/ still work; git-commit refuses to stage the deletion of a .fledge/ file (exit 2, SAFE-2) and nothing is staged; discord-send-file refuses a .fledge/ file and a link to one like the rest of the SAFE-2 set; each of these tests fails on main's source

## No-spec Rationale

Not applicable
