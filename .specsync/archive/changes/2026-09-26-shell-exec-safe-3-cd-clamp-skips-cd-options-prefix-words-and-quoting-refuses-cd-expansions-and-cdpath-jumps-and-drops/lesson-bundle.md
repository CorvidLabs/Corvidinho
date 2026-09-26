# Lesson bundle — shell-exec-safe-3-cd-clamp-skips-cd-options-prefix-words-and-quoting-refuses-cd-expansions-and-cdpath-jumps-and-drops

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Shell-exec SAFE-3 cd clamp skips cd options, prefix words and quoting, refuses cd -, expansions and CDPATH jumps, and drops inherited CDPATH/OLDPWD so shell-exec cannot run outside the project root
- **Kind**: BugFix
- **Specs**: plugins
- **Paths**: plugins/shell/clamp.ts, plugins/shell/commands.ts, tests/shell.clamp-bypass.test.ts
- **Acceptance**: shell-exec refuses (exit 2, SAFE-3, before spawn) cd - / cd -- -, cd -P / (and other option forms), { cd /; }, if/then/else/do/while/! cd /, builtin/command/eval cd /, NAME=value cd /, quoted or backslashed cd heads, quote-concatenated .. targets, targets with $VAR, backticks, globs or braces anywhere, and relative targets when the command sets CDPATH; an inherited CDPATH or OLDPWD is not passed to the child shell, so a relative cd sub stays under the root; in-root forms (cd -P sub, cd -- sub, { cd sub; }, quoted sub dir) still run

## Evidence

- Verification commit: `950cebf97a43545b1e4538bcf2d277ae94d68e58`
- Base commit: `cfcf2b7c6ab71ed46ce4f319969c26bc3c599c0f`
- Verified by: `specsync check --spec plugins`

## From the change's context.md

# Context

Bug report plugins-exec-4 (medium, SAFE-3). `firstDisallowedCd` in
`plugins/shell/clamp.ts` split a command only on `; & | newline ( )`, checked
only fragments whose first word was exactly `cd` or `pushd`, and took the
second word as the target even when it was an option. So `cd - && ls`,
`cd -P / && …`, `{ cd /; …; }`, `if true; then cd /; …; fi` and
`CDPATH=/ && cd tmp` all passed the clamp. `shell-exec` spawned `sh -c` with
`...process.env`, so an `OLDPWD` or `CDPATH` in the bot's environment reached
the child shell. Repro on main: `firstDisallowedCd` returned null for all five
commands; with `OLDPWD` set outside the root, `cd - >/dev/null && pwd` printed
that directory with ok=true; `cd -P / && pwd` and `{ cd /; pwd; }` printed `/`;
an inherited `CDPATH` sent `cd sub` to `$CDPATH/sub`. Probing `/bin/sh` (dash)
also showed `builtin` / `command` / `eval cd /`, `X=1 cd /`, `\cd /`,
`'cd' /`, `cd ".."/..`, `cd .[.]` and `cd .?` leaving the root.

Constraints: minimal bug fix; no new env vars or commands; no package bump or
CHANGELOG/STATUS edits. Command text is untrusted data. The clamp stays
lexical (REQ-plugins-087); a mount or chroot sandbox is out of scope.

## From the change's design.md

# Design

- Every word of a fragment gets quote and backslash removal (`dequote`) before it is compared, so `'cd'`, `\cd` and `".."/..` are seen as the shell sees them.
- The clamp walks past prefix words (`{ } ! if then else elif do while until time builtin command eval`, plus any `-opt` words right after them), `function NAME`, and `NAME=value` assignments to find the command word. Separators are unchanged.
- After `cd` / `pushd` it skips option words (`-[A-Za-z@]+`) and a `--` to reach the real target. No target (bare, or only options) is still `$HOME`. `-` is refused as `$OLDPWD`.
- A target containing `$`, a backtick, `*`, `?`, `[` or `{` is refused: the shell would expand it, so the lexical check cannot know where it lands.
- If the command text (after quote removal) mentions `CDPATH`, a relative target whose first component is not `.` or `..` is refused as `$CDPATH/<target>`.
- `shell-exec` deletes `CDPATH` and `OLDPWD` from the child env, so the bot's own environment cannot redirect a plain relative `cd`. No new env var, command or flag; the refusal is still exit 2 with the SAFE-3 message.

## From the change's testing.md

# Testing

Before the fix, `bun test tests/shell.clamp-bypass.test.ts` gave 1 pass and 5 fail: `firstDisallowedCd` returned null for every reported form, `cd - >/dev/null && pwd` with an outside `OLDPWD`, `cd -P / && pwd` and `{ cd /; pwd; }` ran with ok=true, and an inherited `CDPATH` made `cd sub && pwd` print the outside `sub`. After the fix it gives 6 pass and 0 fail. `tests/shell.plugins.test.ts` stays green.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-087` | `tests/shell.clamp-bypass.test.ts` | `cd - && ls`, `cd -P / && ls`, `{ cd /; rm x; }`, `if true; then cd /; ls; fi` and `CDPATH=/ && cd tmp` are refused by `firstDisallowedCd`. |
| `REQ-plugins-087` | `tests/shell.clamp-bypass.test.ts` | option (`-L --`, `-LP`, `-- -`, `pushd -n`), keyword, `builtin` / `command -p` / `eval`, `X=1`, quoted and backslashed heads, quote-concatenated `..`, `$X`, backtick, glob and `export CDPATH` forms are refused; `cd -P sub`, `cd -- sub`, `{ cd sub; }`, `cd "sub dir"`, `cd ./tmp` with CDPATH and `command -v git` stay allowed. |
| `REQ-plugins-087` | `tests/shell.clamp-bypass.test.ts` | end to end, `cd -` with an outside `OLDPWD`, `cd -P /` and `{ cd /; }` return exit 2 with SAFE-3 before spawn; with an outside `CDPATH` in the bot env, `cd sub && pwd` prints the in-root `sub`. |
| `REQ-plugins-087` | `tests/shell.plugins.test.ts` | existing allow/refuse unit fixtures and the `cd /tmp`, `cd ..` and `cd sub` integration cases still pass. |

## Where these lessons go

- `specs/plugins/context.md`
