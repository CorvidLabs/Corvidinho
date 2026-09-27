---
change: safe-3-shell-exec-cd-clamp-reads-quoting-the-way-the-shell-does-escaped-backslash-before-a-newline-comments-and-here
artifact: testing
---

# Testing

With `main`'s `plugins/shell/clamp.ts` swapped in, `bun test tests/shell.clamp-quoting.test.ts` gives 3 pass and 6 fail: the escaped `\`+newline, comment, here-doc, `$( )` end and open cd/pushd unit tests and the end-to-end refusal test fail (`firstDisallowedCd` returns null and the commands spawn). The reported-forms unit test already passes on `main` because #210 fixed those six forms; it stays as their regression guard. After the fix: 9 pass, 0 fail.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-087` (reported forms) | `tests/shell.clamp-quoting.test.ts` | `mkdir -p "a b" && cd "a b/../.."`, `cd "zz q/../.."`, `cd a\ b/../..` and `cd 'a b'/../..` return `a b/../..` / `zz q/../..`; `X="a b" cd /etc` returns `/etc`; `cd sub/..\`+newline+`/..` returns `sub/../..`; `eval "cd /; ls"` still returns `/`. |
| `REQ-plugins-087` (continuations) | `tests/shell.clamp-quoting.test.ts` | `echo a\\`+newline+`cd /etc` and `echo "a\\"`+newline+`cd /etc` return `/etc`; a `\`+newline inside single quotes stays literal. |
| `REQ-plugins-087` (comments) | `tests/shell.clamp-quoting.test.ts` | a `cd /etc` after `#"` or `#'` returns `/etc`; `cd sub#/../..` is one word (`sub#/../..`); `cd sub # don't go up` and `echo $# a#b && cd sub` are null. |
| `REQ-plugins-087` (here-docs, both readings) | `tests/shell.clamp-quoting.test.ts` | a `cd /etc` after a here-doc body with a lone quote (`<<EOF`, `<<'EOF'`, `<<-EOF`, two here-docs on a line) returns `/etc`; `$(cd /etc …)` and a backtick in an unquoted body return `/etc`; `(( x = 1 << 2 ))`+newline+`cd /etc` returns `/etc`; an in-root `cd sub` after a body with a stray quote or apostrophe is null. |
| `REQ-plugins-087` (`$( )` end) | `tests/shell.clamp-quoting.test.ts` | a `cd /etc` after a `$( )` whose comment or here-doc holds `)`, or after `$(echo \))`, returns `/etc`; `echo $(cd sub && echo ')'); cd sub` is null. |
| `REQ-plugins-087` (open text) | `tests/shell.clamp-quoting.test.ts` | `cd "sub` → `"sub`, `cd 'sub` → `'sub`, `cd sub\` → `sub\`, `ls; pushd sub "x` → `sub "x`, `cd -P 'sub dir` → `'sub dir`; `cd sub && echo "x` is null. |
| `REQ-plugins-087` (end to end) | `tests/shell.clamp-quoting.test.ts` | each escaping form (the six reported, escaped `\`+newline, comment, here-doc, `$( )`, `cd "sub`, `cd sub\`) returns exit 2, SAFE-3, `data.refused`, and neither the `spawned` marker nor `a b` is created; `cd "a b"`, `cd sub # …`, a here-doc with `don't` then `cd sub`, and `cd sub \`+newline+`&& pwd` run and print the in-root dir. |
| `REQ-plugins-087` (earlier fixtures) | `tests/shell.clamp-failclosed.test.ts`, `tests/shell.clamp-bypass.test.ts`, `tests/shell.plugins.test.ts` | every existing allow/refuse assertion and integration case still passes unchanged. |

## Automated coverage

- `bunx tsc --noEmit` — passed.
- `bun test` — 1318 passed, 1 optional live test skipped, 0 failed.
- `bun test tests/shell.clamp-quoting.test.ts tests/shell.clamp-failclosed.test.ts tests/shell.clamp-bypass.test.ts tests/shell.plugins.test.ts` — 32 passed, 0 failed.
- `specsync check --require-coverage 100` and `fledge lanes run verify --non-interactive` — green.
- Differential fuzz (random mixes of quotes, comments, here-docs, continuations, substitutions, separators and `cd` targets; a `cd` wrapper records any landing outside the root): 0 misses in 19,826 dash samples (1,932 escapes) and 19,828 `bash --posix` samples (1,509 escapes); `main`'s clamp misses 15 of ~6,000 under dash.
