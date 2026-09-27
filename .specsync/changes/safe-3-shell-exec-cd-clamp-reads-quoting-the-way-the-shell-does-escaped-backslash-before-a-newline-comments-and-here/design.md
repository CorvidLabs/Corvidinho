---
change: safe-3-shell-exec-cd-clamp-reads-quoting-the-way-the-shell-does-escaped-backslash-before-a-newline-comments-and-here
artifact: design
---

# Design

All in `plugins/shell/clamp.ts`; `firstDisallowedCd`'s signature and return
values for existing inputs are unchanged.

- `tokenize` (was `tokenizeFragments`) handles `\`+newline itself instead of a
  regex pre-pass: skipped outside quotes and inside double quotes, literal in
  single quotes, and an escaped `\` is consumed before it can pair with the
  newline. `joinContinuations` is removed.
- `#` when no word is in progress skips to the newline (the newline is still a
  separator).
- Here-docs: `<<` / `<<-` (not `<<<`) marks the next word as a delimiter
  (recording `<<-` and whether the word was quoted). At the next unquoted
  newline the pending bodies are skipped line by line up to an exact
  delimiter line (tabs stripped for `<<-`). For an unquoted delimiter the
  body's `$(…)` / backticks are pushed onto the substitution list, as for any
  other substitution.
- Two readings of `<<`: `tokenize` takes a `hereDocs` flag. `firstDisallowedCd`
  runs `scanCommand(cmd, root, true)` (dash) and, only if that allows it and
  the text contains `<<`, `scanCommand(cmd, root, false)`, where `<<` is an
  ordinary redirection and the following lines are code (bash arithmetic).
  `eval` and substitution bodies are re-scanned under the same reading, so
  the cost is at most two passes, never exponential.
- `$(…)`: `captureSubstitution` finds the closing `)` by running `tokenize` from
  just inside the `$(` in `inSubst` mode (bare `(` / `)` counted), so quotes,
  comments and here-docs inside are read the same way. `matchParen` is removed.
  The nested scan's own substitutions are dropped; the body is analysed again
  from the list, keeping the work linear in nesting depth.
- Open text: `tokenize` reports `open` when it ends inside a quote, after a lone
  trailing `\`, or inside an unclosed `$(…)` / backtick. `Word` now carries its
  `start` offset. For the last command only, `analyzeFragment` refuses a
  `cd` / `pushd` whose text is open and returns the raw text from its target (or
  its head, if none) to the end, e.g. `"sub` or `sub\`. An open quote in another
  command (`cd sub && echo "x`) is left to the shell, which will not run it.
- No new flag, env var, command or message: refusals are still exit 2 with the
  SAFE-3 text from `clampRefuseMessage`.
