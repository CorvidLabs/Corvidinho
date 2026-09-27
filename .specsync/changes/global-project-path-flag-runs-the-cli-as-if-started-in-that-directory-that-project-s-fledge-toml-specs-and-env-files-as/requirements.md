---
change: global-project-path-flag-runs-the-cli-as-if-started-in-that-directory-that-project-s-fledge-toml-specs-and-env-files-as
artifact: requirements
---

# Requirements

- **REQ-cli-505** (new, CLI-5): global `--project <path>` runs the
  top-level process as if started in `<path>` — Bun's own `.env*` loading
  there from the exec-time env (start directory's `.env*` values dropped,
  set variables win, project `bunfig.toml` never read), then `chdir`, so
  `fledge.toml`, specs and files are the project's; unusable path → one
  REQ-cli-419 line + hint, exit 1, nothing changed; spawns unchanged. Full
  text in `deltas/cli.md` and `specs/cli/requirements.md`.
- Unchanged and still honoured: REQ-cli-419 (error shape), REQ-cli-085
  (spawns never `--no-verify`), REQ-cli-262 (tests never touch operator
  state: the new tests pass an explicit temp env).
