---
change: shell-exec-refuses-a-specsync-lifecycle-step-written-as-a-glob-or-brace-pattern-or-reached-through-an-expanding
artifact: design
---

# Design

- **Patterns are marked where quoting is known.** Only the tokenizer knows
  which characters were quoted, so it sets `Word.glob` (optional, only when
  true) for a word holding an unquoted `*`, `?`, `[` or `{`; no other
  reader changes (`expands` keeps its meaning, so the SAFE-3 clamp,
  SAFE-21 and AUTONOMY-9 behave as before). `eval` / `-c` strings are
  re-tokenized, so `eval spec\*ync …` is read as a pattern there too.
- **A pattern is read as every word it may stand for.** Brace alternatives
  are expanded (nested; at most 64 words, a pattern longer than 1024
  characters, or more words, may stand for anything), a sequence
  (`{a..z}`) becomes `*`, a bracket expression (POSIX classes included)
  any one character, and `*` / `?` are matched with a backtrack-to-last-star
  wildcard matcher (no regex, no blow-up). Matching over-approximates, which
  fails closed. A pattern that may be `specsync` (by basename, past an
  option's `=`, without `@version`) starts an invocation; one of wildcards
  alone (`*`) does so fully only at a command word (elsewhere it is read
  like an expanding command word, so `cp * "$dest"` runs). One that may be
  `change` is read as `change`, one that may be a step refuses with step
  null (what it expands to depends on the folder).
- **The subcommand fails closed.** After a word naming specsync, a word that
  expands or is a pattern where the subcommand (or what may be an option's
  value) belongs refuses: unquoted expansions split into several words and
  `"$@"` forwards any, so it may be `change` and the step. This covers a
  function body (`f() { specsync "$@"; }` is its own simple command), `set
  --`, `${IFS}` joins and brace splits. Under xargs the input may supply the
  subcommand: none, or a word outside `specsync --help`'s subcommands (a
  replace string), refuses; a pattern that may be `xargs` or an expanding
  command word counts as xargs for later words.
- **Scope of the new rules.** They do not apply after an expanding command
  word (that stays "only a literal step refuses", so `$X "$Y"` runs), nor to
  a `specsync` that is only an argument of a command that never runs its
  arguments (`echo`, `grep`, `rg`, `cat`, `ls` …), so `grep -l specsync "$f"`
  and `git ls-files | xargs grep -l specsync` (common here) still run; the
  existing literal reading still refuses `echo specsync change approve`.
- **Out of scope (stated as residual):** a shell alias for the binary and
  bash extended globs (`@(…)` with `extglob` on); neither is in the two
  findings.
