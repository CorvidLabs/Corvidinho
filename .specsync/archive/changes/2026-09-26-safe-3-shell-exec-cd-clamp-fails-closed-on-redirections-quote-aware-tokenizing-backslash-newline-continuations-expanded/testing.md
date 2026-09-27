---
change: safe-3-shell-exec-cd-clamp-fails-closed-on-redirections-quote-aware-tokenizing-backslash-newline-continuations-expanded
artifact: testing
---

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

