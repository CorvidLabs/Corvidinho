---
change: safe-3-shell-exec-cd-clamp-checks-the-scripts-a-command-runs-in-a-shell-sourced-handed-to-a-shell-as-a-file-here-doc-or
artifact: research
---

# Research

Every case was run as `shell-exec` runs it (`sh -c 'eval "$1"'`, dash, from a
project dir) and where bash differs also under `bash` / `bash --posix`, with a
script that appends to a marker file when it lands in `/etc`
(`scratchpad/scripts-diff.ts`, 47 command/shell pairs).

- Sourced (`.`, bash `source`), shell operand (`sh x`, `bash -e ./x arg`),
  stdin (`sh < x`, `sh -s arg < x`, `sh <>x`), and run by path (`./x` with a
  `#!/bin/sh`, `#!/usr/bin/env -S bash -e`, or no `#!` at all — the shell runs
  a `#!`-less text file itself on ENOEXEC) all escaped, also behind `env`,
  `timeout`, `exec`, `xargs` (GNU xargs runs the command once on empty input)
  and `find -exec`. A script sourcing another script escaped through both.
- A shell's startup files run too: `BASH_ENV=./x bash -c true` (non-interactive
  bash) and `bash --rcfile x -i`. `ENV` only matters to interactive shells, and
  `ENV=production` is a common variable, so only `BASH_ENV` is read.
- A shell reading its commands from a here-doc runs the body. An unquoted
  body is expanded first: `$`, backticks and `\$`, `` \` ``, `\\`, `\`-newline
  are processed, so `'$C' /etc` with `C=cd` runs `cd`, and `c\\d /etc` reaches
  the shell as `c\d` and runs `cd`. #226's bash code reading caught a literal
  `cd /etc` body only by accident. A here-string (`bash <<< 'cd /etc'`) runs its
  word.
- Input the clamp cannot see: `cat x | sh`, `{ sh; } < x`, `exec < x; sh`,
  `bash < <(…)`, `. <(…)` all escaped. A shell with no operand and no input
  redirection on its own command reads whatever stdin it inherited.
- Written then run: `echo 'cd /etc' > gen.sh; sh gen.sh`, `cp bad.sh x && ./x`,
  and `for …; do sh ok.sh; cp bad.sh ok.sh; done` (the write comes after the
  run in the text but before it on the second pass) all escaped.
- `trap`, `alias`, `sh -c -` and `-co pipefail`: see context; each escaped under
  dash, and `-co` / `-c -` under bash too.
- Out of reach, confirmed escaping and documented: `./tool.py` whose
  `#!/usr/bin/env python3` script calls `os.chdir('/etc')`, and
  `python3 -c "…os.chdir('/etc')…"`.
- Common agent commands checked for false positives with a real project
  layout: `source .venv/bin/activate` (python3 -m venv), `. ./.env`,
  `./node_modules/.bin/tsc` (`#!/usr/bin/env node`), `git commit -m "$(cat
  <<'EOF' …)"`, `cat <<EOF > notes.txt`, `find | xargs grep`, `npm run build`
  all stay allowed. `for f in *.sh; do bash "$f"; done`, `curl … | sh` and
  scripts that `cd` through a variable (the repo's own
  `scripts/corvidinho-update.sh`, `SCRIPT_DIR=$(cd "$(dirname …)")`) refuse.
