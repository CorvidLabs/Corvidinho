# Lesson bundle — safe-3-shell-exec-cd-clamp-fails-closed-on-redirections-quote-aware-tokenizing-backslash-newline-continuations-expanded

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: SAFE-3 shell-exec cd clamp fails closed on redirections, quote-aware tokenizing, backslash-newline continuations, expanded command words and command substitutions, and moves CDPATH protection to a runtime readonly guard
- **Kind**: BugFix
- **Specs**: plugins
- **Paths**: plugins/shell/clamp.ts, plugins/shell/commands.ts, tests/shell.clamp-failclosed.test.ts, tests/shell.clamp-bypass.test.ts
- **Acceptance**: shell-exec refuses before spawn (exit 2, SAFE-3) every reviewed escape: redirection-hidden targets (>/dev/null cd /etc, cd >/dev/null /etc, cd 2>&1 /etc, cd</dev/null /etc); quoted separators and quoted escaping targets (X="a b" cd /etc, X=';' cd /etc, cd "x /../.."); backslash-newline continuations (c\<nl>d /etc, cd sub/\<nl>../..); expanded command words and eval with expansion ($(echo cd) /etc, $x /etc, cd${IFS}/etc, eval $(printf 'cd /etc')); command substitutions whose body escapes the root (echo `cd /etc`, echo $(cd /etc && cat x)); bash X+= assignment prefix and DIRSTACK writes. In-root forms still run (cd sub with redirections/quoting/continuations, echo $(cd sub && ...), eval 'cd sub'). CDPATH is no longer refused lexically; the spawned shell runs CDPATH=; readonly CDPATH and does not inherit CDPATH/OLDPWD, so a dynamically set CDPATH cannot redirect a relative cd outside the root. tsc --noEmit and bun test green; new tests fail on the pre-fix clamp.

## Evidence

- Verification commit: `4dc2b16b51a58e8ad8996979e42c528217a0d9f0`
- Base commit: `05b269af23ea2be9e9c41966f6cf9ee41dfeac02`
- Verified by: `specsync check --spec plugins`

## From the change's context.md

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

## From the change's design.md

# Design

- `firstDisallowedCd` is rebuilt around one quote-aware scanner. `joinContinuations` removes `\`+newline first. `tokenizeFragments` then scans char by char tracking single/double quotes: it splits fragments only on *unquoted* control operators (`; & | newline ( )`), so a quoted `;` or `&` stays inside a word.
- Redirections are handled in the scanner: `<` / `>` (with `>>`, `>&`, `>|`, `<>`, `<&`, bash `&>`) start a redirection token, a leading all-digit word is treated as the `fd` (discarded), and the operator's target word is dropped in `stripRedirections`. An `&` is a separator only when it is not part of a redirection, so `2>&1` is not torn apart.
- Each word records `expands` — set when an unquoted/`"…"` `$`, `$(…)` or backtick appears. Command-substitution bodies (`$(…)` and backticks) are captured and analysed recursively; the raw substitution text is kept in the word value so refusal markers stay readable (e.g. `` `pwd`/.. ``).
- `analyzeFragment` walks prefix words (`{ } ! if then else elif do while until time builtin command`, `function NAME`, plus `-opt` after them) and `NAME=` / `NAME+=` assignments to the command word. A command word that `expands` refuses. `eval` is special: an expanded argument refuses, otherwise its literal argument is re-joined and re-parsed as a command.
- After `cd`/`pushd` it skips option words (`-[A-Za-z@]+`, `--`) to the target. Bare/`-`/expanded/glob/brace/escaping targets refuse exactly as before. `DIRSTACK[…]=` / `DIRSTACK=` writes refuse.
- CDPATH moves out of the lexer. `plugins/shell/commands.ts` spawns `sh -c 'CDPATH=; readonly CDPATH 2>/dev/null; eval "$1" 2>&1'`; both no-ops leave the command's exit code and stdout intact, and a later `CDPATH=` assignment fails (readonly). The existing `delete env.CDPATH / env.OLDPWD` stays. No new env var, command, flag or package version.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-087` (redirections) | `tests/shell.clamp-failclosed.test.ts` | `firstDisallowedCd` returns `/etc` for `>/dev/null cd /etc`, `cd >/dev/null /etc`, `cd>/dev/null /etc`, `cd</dev/null /etc`, `cd -P >/dev/null /etc`, `cd 2>&1 /etc`; null for `cd 2>&1 sub` and `cd sub >/dev/null`. E2E: each escaping form refuses (exit 2, SAFE-3) before spawn. |
| `REQ-plugins-087` (quote-aware) | `tests/shell.clamp-failclosed.test.ts` | `X="a b" cd /etc` and `X=';' cd /etc` → `/etc`; `cd "x /../.."` → `x /../..`; `cd 'sub dir/../..'` → `sub dir/../..`; `cd "sub dir"` and `X=';' cd sub` → null. |
| `REQ-plugins-087` (continuations) | `tests/shell.clamp-failclosed.test.ts` | A backslash-newline `cd` → `/etc`; `cd sub/`+`\`+newline+`../..` → `sub/../..`; `cd sub/`+`\`+newline+`deep` → null. |
| `REQ-plugins-087` (expansion / substitution) | `tests/shell.clamp-failclosed.test.ts` | `$(echo cd) /etc`, `` `echo cd` /etc ``, `$x /etc`, `cd${IFS}/etc`, `eval $(printf 'cd /etc')`, `eval $v` all refuse; `echo` `` `cd /etc` `` and `echo $(cd /etc && cat x)` → `/etc`; `eval eval cd /etc` → `/etc`; `echo $(cd sub && ls)`, `grep -r 'cd /etc' .`, `eval 'cd sub'` → null. |
| `REQ-plugins-087` (bash minors / dir stack) | `tests/shell.clamp-failclosed.test.ts` | `X+=1 cd /etc` → `/etc`; `pushd sub; DIRSTACK[1]=/etc; popd` → `$DIRSTACK`. |
| `REQ-plugins-087` (runtime CDPATH / OLDPWD) | `tests/shell.clamp-failclosed.test.ts` | With `CDPATH`/`OLDPWD` set outside the root in env, `cd sub` prints the in-root `sub` only; a command that sets `CDPATH` (literal or dynamic) then runs `cd sub` never prints the outside path. |
| `REQ-plugins-087` (regression, PR #187 forms) | `tests/shell.clamp-bypass.test.ts` | The #187 bypass fixtures still pass; the two CDPATH lexical cases are updated to expect null (now runtime-guarded). |
| `REQ-plugins-086/088` (unchanged behaviour) | `tests/shell.plugins.test.ts` | Existing allow/refuse fixtures and SAFE-1 deny / happy path still pass. |

## Automated coverage

- `bunx tsc --noEmit` — passed.
- `bun test` — 1163 passed, 1 optional live test skipped, 0 failed.
- `bun test tests/shell.clamp-failclosed.test.ts tests/shell.clamp-bypass.test.ts tests/shell.plugins.test.ts` — 23 passed, 0 failed.
- Regression proof: with `main`'s `plugins/shell/{clamp,commands}.ts` swapped in, `tests/shell.clamp-failclosed.test.ts` fails 7 of 9; restored after.
- `fledge lanes run verify --non-interactive` — green (includes local `spec-check`).
- `specsync change check --commit`, `specsync change audit`, `specsync check --require-coverage 100` — green.
- Runtime `CDPATH=; readonly CDPATH` prelude verified in both `dash` (this box) and `bash`: exit codes and stdout preserved; a later `CDPATH=` reassignment fails and the relative `cd` stays in-root.

## Where these lessons go

- `specs/plugins/context.md`
