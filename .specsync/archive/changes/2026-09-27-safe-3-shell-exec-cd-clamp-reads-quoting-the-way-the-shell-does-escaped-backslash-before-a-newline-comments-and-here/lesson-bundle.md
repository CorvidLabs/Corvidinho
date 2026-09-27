# Lesson bundle — safe-3-shell-exec-cd-clamp-reads-quoting-the-way-the-shell-does-escaped-backslash-before-a-newline-comments-and-here

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: SAFE-3 shell-exec cd clamp reads quoting the way the shell does: escaped backslash before a newline, comments and here-doc bodies no longer hide a cd, the end of a command substitution is found with the same tokenizer, and a cd/pushd command left open by a quote or trailing backslash is refused
- **Kind**: BugFix
- **Specs**: plugins
- **Paths**: plugins/shell/clamp.ts, tests/shell.clamp-quoting.test.ts
- **Acceptance**: shell-exec refuses before spawn (exit 2, SAFE-3) the reported quoted and escaped cd forms: mkdir -p "a b" && cd "a b/../..", cd "zz q/../..", cd a\ b/../.., cd 'a b'/../.., X="a b" cd /etc and cd sub/..\<nl>/.. (each checked as the single target word the shell sees); it also refuses echo a\\<nl>cd /etc (escaped backslash, real newline), a cd hidden by a quote inside a # comment, a cd after a here-doc whose body holds a lone quote (<<EOF, <<'EOF', <<-EOF), a cd after a $( ) whose comment or here-doc holds a ), an escaping cd inside a $( ) or backtick in an unquoted here-doc body, a cd after (( x = 1 << 2 )) (bash arithmetic), and any cd/pushd command left open by an unterminated quote or a trailing backslash; a command with << is checked both as dash reads it (here-doc body is data) and as bash may read it (lines are commands) and refuses if either does; cd "sub dir", cd sub # comment, cd sub \<nl>&& ls, a here-doc body holding a stray quote before an in-root cd sub, eval "cd /; ls" (still refused as /) and every existing clamp assertion keep their results; no new flag, env var or command

## Evidence

- Verification commit: `8029aeeb00f671cdd21801f28f14b2954f1f8cf6`
- Base commit: `07fa953887ab61dde8a0e32ee1161b5981695dea`
- Verified by: `specsync check --spec plugins`

## From the change's context.md

# Context

Bug report (SAFE-3, `hi/safe.md`: shell commands cannot `cd` their way out of
the project root) against the clamp as merged in #187 (d0a8d95):
`firstDisallowedCd` split each fragment with `split(/\s+/)` and only then
removed quotes, so quoted or escaped whitespace broke one shell word into
pieces and only the first piece was checked. Through `sh -c 'eval "$1"'`
(dash), `mkdir -p "a b" && cd "a b/../.."`, `cd "zz q/../.."`,
`cd a\ b/../..`, `cd 'a b'/../..`, `X="a b" cd /etc` and
`cd sub/..\`+newline+`/..` all passed the clamp and ran outside the root.

#210 (15cbe4f) replaced the splitter with a quote-aware tokenizer before this
change started, and it already refuses all six reported forms. Probing that
tokenizer against dash found the same class of bug still open — the clamp's
idea of what is quoted or code drifts from the shell's, and a real `cd` hides:

- `echo a\\`+newline+`cd /etc`: `joinContinuations` removed `\`+newline even
  when that backslash was itself escaped, deleting a real newline.
- `echo #"`+newline+`cd /etc #"`: `#` comments were not recognised, so the
  quote inside the comment opened a string that swallowed the `cd`.
- `cat <<EOF`+newline+`"`+newline+`EOF`+newline+`cd /etc #"`: here-doc
  bodies were tokenized as code, so a lone quote in the body did the same.
- `x=$(echo hi # )"`+newline+`); cd /etc #"`: the end of `$(…)` was found by
  a separate paren matcher that ignored comments and here-docs.
- `cd "sub`, `cd 'sub`, `cd sub\`: nothing refused a `cd` the text leaves
  open, which the report asks to fail closed.

Each printed a path outside the root (or would, for the open forms) while
`firstDisallowedCd` returned null. PR #200 (branch
`claude/fix-shell-cd-clamp-options`) is superseded and not reused: its
"unparseable word" rule also refused `cd "sub dir"`.

Constraints: bug fix only; no new flag, env var, command or package bump; no
CHANGELOG/STATUS edit. Command text is untrusted. The clamp stays lexical
(REQ-plugins-087); a mount or chroot sandbox is out of scope.

## From the change's design.md

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
- bash `$'…'`: `tokenize` takes a `Reading` (`DASH`, `BASH`, `BASH_CODE`)
  instead of the `hereDocs` flag. With `ansiC`, `$'…'` is one quoted word
  that ends at the first unescaped `'`; if it holds a backslash escape the
  word counts as an expansion (the decoded text is not modelled).
  `checkReadings` always runs the dash reading, adds a `BASH` pass when the
  text holds `$'` and a `BASH_CODE` pass (bash with `<<` as code) when it
  holds `<<`; `covered` skips a pass an enclosing text's pass already takes
  in. Each bash pass recurses into `eval` / `-c` strings under the same
  reading.
- Shell `-c` strings: `shellScripts` scans every word of a simple command for
  a shell (`sh bash dash zsh ksh mksh ash yash posh`, by basename). After its
  options (clusters like `-ec`; `-o` / `-O` / `--rcfile` take an argument;
  long `--` options; `--` ends them), if `-c` was given the next word is the
  command string and goes through the same check as an `eval` argument (one
  nesting level deeper); a string that would expand refuses. Scanning every
  word catches `env`, `exec`, `nohup`, `timeout`, `xargs` and `find -exec`
  wrappers; the cost is refusing `echo sh -c 'cd /etc'`.
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

## From the change's testing.md

# Testing

With `main`'s `plugins/shell/clamp.ts` swapped in, `bun test tests/shell.clamp-quoting.test.ts` gives 3 pass and 7 fail: the escaped `\`+newline, comment, here-doc, `$( )` end, open cd/pushd and deep-nesting unit tests and the end-to-end refusal test fail (`firstDisallowedCd` returns null and the commands spawn; the deep-nesting case runs ~31 s and then throws `RangeError`). The reported-forms unit test already passes on `main` because #210 fixed those six forms; it stays as their regression guard. After the fix: 10 pass, 0 fail.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-087` (reported forms) | `tests/shell.clamp-quoting.test.ts` | `mkdir -p "a b" && cd "a b/../.."`, `cd "zz q/../.."`, `cd a\ b/../..` and `cd 'a b'/../..` return `a b/../..` / `zz q/../..`; `X="a b" cd /etc` returns `/etc`; `cd sub/..\`+newline+`/..` returns `sub/../..`; `eval "cd /; ls"` still returns `/`. |
| `REQ-plugins-087` (continuations) | `tests/shell.clamp-quoting.test.ts` | `echo a\\`+newline+`cd /etc` and `echo "a\\"`+newline+`cd /etc` return `/etc`; a `\`+newline inside single quotes stays literal. |
| `REQ-plugins-087` (comments) | `tests/shell.clamp-quoting.test.ts` | a `cd /etc` after `#"` or `#'` returns `/etc`; `cd sub#/../..` is one word (`sub#/../..`); `cd sub # don't go up` and `echo $# a#b && cd sub` are null. |
| `REQ-plugins-087` (here-docs, both readings) | `tests/shell.clamp-quoting.test.ts` | a `cd /etc` after a here-doc body with a lone quote (`<<EOF`, `<<'EOF'`, `<<-EOF`, two here-docs on a line) returns `/etc`; `$(cd /etc …)` and a backtick in an unquoted body return `/etc`; a backtick in the delimiter is literal (`cat <<`+backtick+`x`+newline+`#' $(cd ..)` returns `..`); `(( x = 1 << 2 ))`+newline+`cd /etc` returns `/etc`, also inside `eval` with `<''<`; an in-root `cd sub` after a body with a stray quote or apostrophe is null. |
| `REQ-plugins-087` (`$( )` end) | `tests/shell.clamp-quoting.test.ts` | a `cd /etc` after a `$( )` whose comment or here-doc holds `)`, or after `$(echo \))`, returns `/etc`; `echo $(cd sub && echo ')'); cd sub` is null. |
| `REQ-plugins-087` (open text, deep nesting) | `tests/shell.clamp-quoting.test.ts` | `cd "sub` → `"sub`, `cd 'sub` → `'sub`, `cd sub\` → `sub\`, `ls; pushd sub "x` → `sub "x`, `cd -P 'sub dir` → `'sub dir`; `cd sub && echo "x` is null; 20 nested `$(` and 20 chained `eval`s around an in-root `cd sub` stay allowed, while 100 of either (and 100,000 nested `$(`) refuse as `(nested too deeply to check)`. |
| `REQ-plugins-087` (bash `$'…'`) | `tests/shell.clamp-quoting.test.ts` | `echo $'\''; cd /etc #'` and `echo $'a\'b'; X="a;b" cd /etc #'` return `/etc` (bash ends the quote after `\'`); `cd $'\x2e\x2e'` and `$'\x63d' /etc` refuse; `echo $'a\tb' && cd sub` is null. |
| `REQ-plugins-087` (shell `-c` strings) | `tests/shell.clamp-quoting.test.ts` | `sh -c 'cd /etc && pwd'`, `bash -c`, `/bin/sh -ec`, `bash --norc -o pipefail -c 'cd ..'`, `sh -c -- …`, `env X=1 sh -c`, `timeout 5 sh -c`, `xargs sh -c`, `find . -exec sh -c … \;` and `sh -c 'cd "a b/../.."'` refuse with the inner target; `sh -c "cd $X"` refuses as `cd $X`; `sh -c 'cd sub && ls'`, `bash -lc 'echo hi'`, `bash scripts/build.sh` and `grep -r "sh -c" .` are null. |
| `REQ-plugins-087` (end to end) | `tests/shell.clamp-quoting.test.ts` | each escaping form (the six reported, escaped `\`+newline, comment, here-doc, `$( )`, `cd "sub`, `cd sub\`, `sh -c`, `xargs sh -c`, bash `$'…'`) returns exit 2, SAFE-3, `data.refused`, and neither the `spawned` marker nor `a b` is created; `cd "a b"`, `cd sub # …`, a here-doc with `don't` then `cd sub`, `cd sub \`+newline+`&& pwd` and `sh -c 'cd sub && pwd'` run and print the in-root dir. |
| `REQ-plugins-087` (earlier fixtures) | `tests/shell.clamp-failclosed.test.ts`, `tests/shell.clamp-bypass.test.ts`, `tests/shell.plugins.test.ts` | every existing allow/refuse assertion and integration case still passes unchanged. |

## Automated coverage

- `bunx tsc --noEmit` — passed.
- `bun test` — 1319 passed, 1 optional live test skipped, 0 failed.
- `bun test tests/shell.clamp-quoting.test.ts tests/shell.clamp-failclosed.test.ts tests/shell.clamp-bypass.test.ts tests/shell.plugins.test.ts` — 33 passed, 0 failed.
- `specsync check --require-coverage 100`, `specsync change audit` and `fledge lanes run verify --non-interactive` — green.
- Second fuzz round with `$'`, `\'`, `sh -c` / `bash -c`, `env` and `xargs` pieces added (a `BASH_ENV` file puts the same `cd` wrapper into bash child shells): 0 misses in 19,899 dash, 19,900 `bash --posix` and 9,971 `bash` samples (1,544 / 1,228 / 627 escapes).
- Differential fuzz (random mixes of quotes, comments, here-docs and delimiters, continuations, substitutions, separators and `cd` targets; a `cd` wrapper records any landing outside the root, one marker file per sample): 0 misses in 29,726 dash samples (2,412 escapes) and 29,706 `bash --posix` samples (1,974 escapes). The same generator finds 12 misses in 7,973 dash samples on `main`'s clamp.
- Timing on pathological input: deep `$(` / `eval` nesting refuses at the cap in under 60 ms (`main` spent ~0.65 s on a 2,000-deep `eval` chain and ~4 s before throwing on 20,000 nested `$(`); 2,000 substitutions side by side with `<<` ~16 ms; a 100 KB plain command ~13 ms.
- `bun test` on this box intermittently dies with a Bun 1.3.11 segfault (`panic(main thread): Segmentation fault at address 0x0`, ~20 s in, after `tests/discord.ask-ephemeral.test.ts`). It is not from this change: the same crash report id shows up on `main` (2 of 6 side-by-side runs on `main`, 3 of 6 on this branch); runs that do not crash pass in full.

## Where these lessons go

- `specs/plugins/context.md`
