---
change: safe-3-shell-exec-cd-clamp-refuses-a-shell-reading-commands-from-standard-input-a-pipe-sh-s-sh-a-file-a-dup-d-fd-a
artifact: requirements
---

# Requirements

- SAFE-3 (captured in `hi/safe.md`): shell commands cannot `cd` their way out of the project root to run elsewhere on my machine. Issue #83.
- Add REQ-plugins-430 (delta `deltas/plugins.md`): the `shell-exec` clamp refuses a shell that reads its commands from standard input unless that input is a here-string or here-doc that checks clean, a `-c` with no string, and a `-c` string filled in by `xargs -I`; `-` and `o`-clusters are read correctly in a shell's options.
- REQ-plugins-087 text is unchanged (`bash scripts/build.sh` stays allowed); REQ-plugins-430 extends its clamp.
- Out of scope (need Leif on #83): script files, `.` / `source`, `env -C` / `git -C` / `make -C`, interpreter chdir.
- No new flag, env var, config key, command, package version or SQLite schema change.
