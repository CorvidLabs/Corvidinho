---
change: safe-3-shell-exec-cd-clamp-fails-closed-on-redirections-quote-aware-tokenizing-backslash-newline-continuations-expanded
artifact: context
---

# Context

The SAFE-3 `cd`/`pushd` clamp landed in PR #187 (`REQ-plugins-087`). A
read-only review of that PR ran `shell-exec` end to end against a wide set of
escape attempts and found the clamp still fails **open** on several forms — it
printed a path outside the project root and, worse, would run commands there:

1. Redirections were not skipped. `>/dev/null cd /etc`, `cd >/dev/null /etc`,
   `cd</dev/null /etc` and `cd 2>&1 /etc` all escaped — splitting on `&` even
   tore `2>&1` apart so the real `/etc` landed in a fragment with no `cd` head.
2. Words were split on whitespace before quotes were removed, and quoted
   separators were split too, so `X="a b" cd /etc`, `X=';' cd /etc` and quoted
   escaping targets like `cd "x /../.."` slipped past.
3. Backslash-newline line continuations were never joined, so a `cd` split
   across a `\`+newline reassembled into `cd /etc` only in the real shell.
4. Command words the shell expands were not refused: `$(echo cd) /etc`,
   `` `echo cd` /etc ``, `x=cd; $x /etc`, `cd${IFS}/etc`, and `eval` with an
   expanded argument. Command substitutions whose body escaped the root
   (`echo $(cd /etc && cat x)`) ran the inner command from `/etc`.
5. The CDPATH guard only matched the literal text `CDPATH`, so a dynamically
   built assignment (`v=CDPAT; export ${v}H=/; cd etc`) still redirected a
   relative `cd`.

All of these were also present on `main` before #187 — they are not new — but
the clamp is meant to fail closed, so they are fixed here as one follow-up.

## Approach and what was ruled out

- The clamp is rewritten around a single quote-aware tokenizer
  (`plugins/shell/clamp.ts`) that joins continuations, splits fragments only on
  unquoted control operators, drops redirection operators with their targets
  (handling an `fd` prefix and `>&`/`&>`), records whether each word carries an
  expansion, and captures command-substitution bodies for recursive analysis.
- A pure lexer cannot know what `CDPATH` resolves to, and the previous text
  match over-refused (`echo CDPATH`) while missing dynamic assignments. The
  CDPATH defence is moved to the child shell: `sh -c 'CDPATH=; readonly CDPATH
  2>/dev/null; eval "$1" 2>&1'`, keeping the existing `delete env.CDPATH /
  env.OLDPWD`. Verified on dash (this box) and bash: a later `CDPATH=` fails
  (readonly), and a relative `cd sub` resolves against the cwd. The lexical
  CDPATH refusal is therefore dropped.
- `eval` is no longer a plain prefix word; its literal argument is re-parsed as
  a command and an expanded argument refuses.
- Deliberately left as leftover risk (see the PR body): forms no text-level
  clamp can catch without a sandbox — `sh -c '…'`, `exec env -C`, `source`/`.`,
  `trap`, `alias`, and symlink `pwd -P`. These were out of scope per the
  coordinator; whether to sandbox or document the limit is Leif's call. No HI
  was invented.
