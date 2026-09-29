---
change: safe-3-shell-exec-cd-clamp-checks-the-scripts-a-command-runs-in-a-shell-sourced-handed-to-a-shell-as-a-file-here-doc-or
artifact: design
---

# Design

All in `plugins/shell/clamp.ts`; `firstDisallowedCd(cmd, root)` keeps its
signature and its results for commands that run no scripts.

- Tokenizer: redirection markers carry a kind (`in`, `out`, `rw` for `<>`,
  `heredoc`, `herestring`; `<<<` is now its own operator), and a here-doc
  marker gets its body (tabs stripped for `<<-`) and whether it is quoted once
  the body is read. `fragParts` replaces `stripRedirections` and returns the
  words plus the redirections with their targets.
- A per-call `Ctx` holds the root, the dirs the shell may be in (root plus each
  in-root `cd` target resolved from every dir before it, capped at 32), the
  paths the command writes, every path a script was looked up at, a script →
  verdict cache (a script sourcing itself is fine; a refused one keeps its
  message), and the script-text byte budget (1 MiB across the command).
- Writes pre-pass (`collectWrites`): output / `<>` redirection targets and the
  arguments of every command that is not read-only (a short list of readers
  and builtins, and read-only `git` subcommands); `eval`, `trap` and `-c`
  strings are read the same way. A script's writes are added when it is
  checked. `firstDisallowedCd` ends with a pass over every looked-up path, so a
  write seen later in the text (or in a later script, or a loop) still refuses.
- `scriptRefs`: for the simple command, `BASH_ENV=` words, `.` / `source`
  operands, and for every word that runs as a command (`commandIndexes`: the
  command word, what `exec` / `env` / `nice` / `timeout` / `stdbuf` / `xargs` /
  `nohup` / `setsid` / `busybox` run, and `find -exec…` commands) either the
  shell's `--rcfile`, operand or stdin, or a path run directly. Stdin is the
  last non-output redirection of the command: a here-doc (body checked; an
  unquoted one expanded by `hereDocScript`, refusing on `$` / backtick), a
  here-string, or a file; anything else refuses.
- `checkScript`: refuse an expanding path; look the path up from every dir (a
  bare name for `.` / a shell also on PATH); refuse a written path; refuse a
  missing sourced / shell-run file (a missing file run by path is a program the
  command builds); read a file run by path only if `isShellScript` (`#!` shell
  via `env` / `busybox`, or text without `#!`); refuse past the byte budget or
  32 scripts; otherwise check the text with `checkScriptText` (writes, then all
  readings, one nesting level deeper, so `MAX_NESTING` still bounds recursion).
- `shellArgs` is shared by `shellScripts`, `scriptRefs` and the writes pass:
  `-` ends options, `o` / `O` in a cluster take the next word, `-s` means stdin.
- `trap` actions are checked like `eval` (listing / reset forms skipped);
  `alias NAME=…` refuses.
