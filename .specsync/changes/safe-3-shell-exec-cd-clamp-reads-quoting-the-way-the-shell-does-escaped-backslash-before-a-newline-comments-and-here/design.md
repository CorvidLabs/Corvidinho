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
  body's `$(…)` / backticks are tokenized and analysed like any other
  substitution. The delimiter word itself is not expanded: while it is read,
  `$(` and backticks stay literal (a fuzz run found dash expanding
  `$(cd ..)` in the body after `cat <<`+backtick+`x`, where the clamp had
  swallowed the rest of the text as an unclosed backtick).
- Two readings of `<<`: `tokenize` takes a `hereDocs` flag. `checkReadings`
  analyses the here-doc (dash) reading and, only if that allows the command and
  the text contains `<<`, `checkCodeOnly`, where `<<` is an ordinary
  redirection and the following lines are code (bash arithmetic). An `eval`
  argument under the here-doc reading goes through `checkReadings` again,
  because quote removal can form a `<<` (`<''<`) the outer text lacks; a
  `covered` flag skips the code-only pass when an enclosing text's code-only
  pass already takes it in, so the work stays within about twice `main`'s.
- `$(…)`: `captureSubstitution` tokenizes the body in place by running
  `tokenize` from just inside the `$(` in `inSubst` mode (bare `(` / `)`
  counted), so the closing `)` is found with quotes, comments and here-docs
  read the same way; `matchParen` is removed. `tokenize` now returns a tree
  (`Lexed.subs`) and `analyzeLexed` walks it, so each character is tokenized
  once per reading instead of once per nesting level (a 22 KB nested
  here-doc input went from ~100 s to ~0.2 s during development).
- Nesting cap: every `Lexed` records its depth (command substitutions plus
  `eval` re-parses around it). `tokenize` throws an internal `NestedTooDeep`
  past `MAX_NESTING` (64), and `firstDisallowedCd` turns that into the refusal
  `(nested too deeply to check)`. `main`'s clamp recursed once per level and
  threw `RangeError` out of `shell-exec` at ~20,000 nested `$(` after seconds
  of work; catching `RangeError` is not enough, since a stack overflow can
  crash the runtime, so the recursion is bounded instead. It also caps the
  quadratic cost of long `eval` chains.
- Open text: `tokenize` reports `open` when it ends inside a quote, after a lone
  trailing `\`, or inside an unclosed `$(…)` / backtick. `Word` now carries its
  `start` offset. For the last command only, `analyzeFragment` refuses a
  `cd` / `pushd` whose text is open and returns the raw text from its target (or
  its head, if none) to the end, e.g. `"sub` or `sub\`. An open quote in another
  command (`cd sub && echo "x`) is left to the shell, which will not run it.
- No new flag, env var, command or message: refusals are still exit 2 with the
  SAFE-3 text from `clampRefuseMessage`.
