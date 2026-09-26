---
change: shell-exec-cd-pushd-clamp-skips-options-and-before-taking-the-target-so-cd-p-etc-cd-etc-and-cd-cannot-escape-the
artifact: design
---

# Design

- New private helper `cdArgsOffending(args, root)` in `plugins/shell/clamp.ts` handles the words after a `cd`/`pushd` head; `firstDisallowedCd` calls it per fragment (fragment splitting on `; & | newline ( )` is unchanged).
- Walk the words, each through `stripQuotes` so `"-P"` is still an option: a lone `-` returns `$OLDPWD` (refuse); `--` ends options and the next word is the target; any other word starting with `-` (`-P`, `-L`, `-e`, `-@`, `-PL`, pushd `-n`, ...) is skipped as an option; the first other word is the target.
- No target after options (`cd -P`, `cd --`, `pushd -n`) is bare cd, so `$HOME` (refuse), as before for plain `cd`.
- The target is checked with the unchanged `isCdEscape`. A target of `-` after `--` still means OLDPWD in bash and refuses.
- Fail closed on unparseable words: an option or target word that still holds a double quote, single quote, backtick, backslash, `$`, `{` or `}` after one layer of matching outer quotes is stripped is returned as the offending word. The lexer cannot know what the shell turns it into (`""/etc`, `\/etc`, `"$(...)"`, backticks, brace expansion).
- Consequence: a quoted target containing whitespace (`cd "my dir"`) is split by the whitespace lexer and now refuses instead of passing unchecked. That is fail-closed and consistent with the existing conservative stance (`$VAR`, `~`, bare cd refuse).
- Refusal shape (exit 2, `SAFE-3` message, `data.refused/target/root`) and `shell-exec` arguments are unchanged; no new env vars, flags or slash commands.
