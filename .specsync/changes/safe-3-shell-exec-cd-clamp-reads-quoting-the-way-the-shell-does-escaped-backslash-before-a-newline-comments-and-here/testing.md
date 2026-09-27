---
change: safe-3-shell-exec-cd-clamp-reads-quoting-the-way-the-shell-does-escaped-backslash-before-a-newline-comments-and-here
artifact: testing
---

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
| `REQ-plugins-087` (end to end) | `tests/shell.clamp-quoting.test.ts` | each escaping form (the six reported, escaped `\`+newline, comment, here-doc, `$( )`, `cd "sub`, `cd sub\`) returns exit 2, SAFE-3, `data.refused`, and neither the `spawned` marker nor `a b` is created; `cd "a b"`, `cd sub # …`, a here-doc with `don't` then `cd sub`, and `cd sub \`+newline+`&& pwd` run and print the in-root dir. |
| `REQ-plugins-087` (earlier fixtures) | `tests/shell.clamp-failclosed.test.ts`, `tests/shell.clamp-bypass.test.ts`, `tests/shell.plugins.test.ts` | every existing allow/refuse assertion and integration case still passes unchanged. |

## Automated coverage

- `bunx tsc --noEmit` — passed.
- `bun test` — 1319 passed, 1 optional live test skipped, 0 failed.
- `bun test tests/shell.clamp-quoting.test.ts tests/shell.clamp-failclosed.test.ts tests/shell.clamp-bypass.test.ts tests/shell.plugins.test.ts` — 33 passed, 0 failed.
- `specsync check --require-coverage 100`, `specsync change audit` and `fledge lanes run verify --non-interactive` — green.
- Differential fuzz (random mixes of quotes, comments, here-docs and delimiters, continuations, substitutions, separators and `cd` targets; a `cd` wrapper records any landing outside the root, one marker file per sample): 0 misses in 29,726 dash samples (2,412 escapes) and 29,706 `bash --posix` samples (1,974 escapes). The same generator finds 12 misses in 7,973 dash samples on `main`'s clamp.
- Timing on pathological input: deep `$(` / `eval` nesting refuses at the cap in under 60 ms (`main` spent ~0.65 s on a 2,000-deep `eval` chain and ~4 s before throwing on 20,000 nested `$(`); 2,000 substitutions side by side with `<<` ~16 ms; a 100 KB plain command ~13 ms.
- `bun test` on this box intermittently dies with a Bun 1.3.11 segfault (`panic(main thread): Segmentation fault at address 0x0`, ~20 s in, after `tests/discord.ask-ephemeral.test.ts`). It is not from this change: the same crash report id shows up on `main` (2 of 6 side-by-side runs on `main`, 3 of 6 on this branch); runs that do not crash pass in full.
