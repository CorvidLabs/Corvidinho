---
change: safe-3-shell-exec-cd-clamp-reads-quoting-the-way-the-shell-does-escaped-backslash-before-a-newline-comments-and-here
artifact: research
---

# Research

- `/bin/sh` here is dash; every case was run as `shell-exec` runs it
  (`sh -c 'eval "$1"'` from a project dir).
- Continuations: dash removes `\`+newline outside single quotes and inside
  double quotes; `\\`+newline is an escaped backslash followed by a real
  newline (`echo a\\`+newline+`cd /etc` runs `cd /etc`); inside single quotes
  `\`+newline is literal.
- Comments: `#` starts a comment only at the start of a word, including right
  after an operator (`echo hi >#x` is a syntax error because `#x` is a
  comment); `a#b` and `$#` are not comments. A `)` inside a comment in `$( … )`
  does not close it.
- Here-docs: the body starts after the next unquoted newline and ends at a line
  exactly equal to the delimiter (a trailing space does not match; `<<-` strips
  leading tabs; `EO\`+newline+`F` does not match even though the body text is
  joined). Several here-docs on one line are read in order. A quoted
  delimiter (`'EOF'`, `"EOF"`, `E"O"F`) keeps the body literal; an unquoted one
  expands `$(…)` and backticks, which run as commands. A here-doc inside
  `$( … )` hides a `)` in its body. The delimiter word is not expanded: in
  `cat <<`+backtick+`x` the backtick is part of the delimiter (dash then
  expands `$(cd ..)` on the body line, where `#` is not a comment), and
  `cat <<$(x` is a syntax error.
- bash (`/bin/sh` on some distros) reads `(( x = 1 << 2 ))` and `$[x << 2]` as
  arithmetic, so the lines after them are commands, while dash reads a
  here-doc there. Treating bodies only as data would miss
  `(( x = 1 << 2 ))`+newline+`cd /etc` under bash, which #210 refused.
- An unterminated quote makes dash refuse the rest of that line as a syntax
  error; a trailing lone `\` is kept literally (`cd sub\` tries `sub\`). Neither
  runs outside the root on its own; they are refused because the clamp cannot
  see where the shell's reading ends.
- A differential fuzz (random mixes of quotes, comments, here-docs,
  continuations, substitutions, separators and `cd` targets, run through dash
  with a `cd` wrapper that records any landing outside the root) found 15
  misses in ~6000 samples on #210's clamp, mostly comment-driven.
- Still out of a pure lexer's reach (unchanged leftover risk): `sh -c '…'`,
  `exec env -C`, `.`/`source`, `trap`, `alias`, symlink `pwd -P`, and bash-only
  `$'…'` quoting.
- Callers: only `plugins/shell/commands.ts` uses `firstDisallowedCd`; the
  exports in `plugins/shell/index.ts` are unchanged.
