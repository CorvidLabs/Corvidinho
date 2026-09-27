---
change: safe-3-shell-exec-cd-clamp-fails-closed-on-redirections-quote-aware-tokenizing-backslash-newline-continuations-expanded
artifact: design
---

# Design

- `firstDisallowedCd` is rebuilt around one quote-aware scanner. `joinContinuations` removes `\`+newline first. `tokenizeFragments` then scans char by char tracking single/double quotes: it splits fragments only on *unquoted* control operators (`; & | newline ( )`), so a quoted `;` or `&` stays inside a word.
- Redirections are handled in the scanner: `<` / `>` (with `>>`, `>&`, `>|`, `<>`, `<&`, bash `&>`) start a redirection token, a leading all-digit word is treated as the `fd` (discarded), and the operator's target word is dropped in `stripRedirections`. An `&` is a separator only when it is not part of a redirection, so `2>&1` is not torn apart.
- Each word records `expands` — set when an unquoted/`"…"` `$`, `$(…)` or backtick appears. Command-substitution bodies (`$(…)` and backticks) are captured and analysed recursively; the raw substitution text is kept in the word value so refusal markers stay readable (e.g. `` `pwd`/.. ``).
- `analyzeFragment` walks prefix words (`{ } ! if then else elif do while until time builtin command`, `function NAME`, plus `-opt` after them) and `NAME=` / `NAME+=` assignments to the command word. A command word that `expands` refuses. `eval` is special: an expanded argument refuses, otherwise its literal argument is re-joined and re-parsed as a command.
- After `cd`/`pushd` it skips option words (`-[A-Za-z@]+`, `--`) to the target. Bare/`-`/expanded/glob/brace/escaping targets refuse exactly as before. `DIRSTACK[…]=` / `DIRSTACK=` writes refuse.
- CDPATH moves out of the lexer. `plugins/shell/commands.ts` spawns `sh -c 'CDPATH=; readonly CDPATH 2>/dev/null; eval "$1" 2>&1'`; both no-ops leave the command's exit code and stdout intact, and a later `CDPATH=` assignment fails (readonly). The existing `delete env.CDPATH / env.OLDPWD` stays. No new env var, command, flag or package version.
