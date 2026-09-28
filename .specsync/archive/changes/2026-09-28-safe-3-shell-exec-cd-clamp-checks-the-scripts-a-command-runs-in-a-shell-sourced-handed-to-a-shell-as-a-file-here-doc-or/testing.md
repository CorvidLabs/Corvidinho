---
change: safe-3-shell-exec-cd-clamp-checks-the-scripts-a-command-runs-in-a-shell-sourced-handed-to-a-shell-as-a-file-here-doc-or
artifact: testing
---

# Testing

With `main`'s `plugins/shell/clamp.ts` swapped in, `bun test tests/shell.clamp-scripts.test.ts tests/shell.clamp-quoting.test.ts` gives 13 pass and 6 fail: all five script / trap / alias unit tests, the end-to-end refusal test, and the quoting test's `-c` case (`sh -c -`, `-co pipefail`) fail — `firstDisallowedCd` returns null and the scripts run. After the fix: 19 pass, 0 fail.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-087` (scripts run in a shell) | `tests/shell.clamp-scripts.test.ts` | with `bad.sh` holding `cd /etc`: `. ./bad.sh`, `source bad.sh`, `sh bad.sh`, `bash -e ./bad.sh arg`, `./bad.sh`, `./noshebang`, `./badbash` (`#!/usr/bin/env -S bash -e`, `cd ..`), `./varcd.sh` (`cd "$(dirname "$0")"`), `env X=1 ./bad.sh`, `timeout 5`, `exec`, `find -exec`, `. ./nested.sh`, `cd sub && . ./inner.sh`, `(cd sub && sh ../bad.sh)`, `BASH_ENV=./bad.sh bash -c true` and `bash --rcfile bad.sh -i ok.sh` refuse with `TARGET (in SCRIPT)`; `. ./self.sh` (sources itself) is null. |
| `REQ-plugins-087` (shell input) | `tests/shell.clamp-scripts.test.ts` | `sh < bad.sh`, `sh -s arg < bad.sh`, a quoted here-doc `cd /etc`, an unquoted here-doc `c\\d /etc`, `bash <<< 'cd /etc'` refuse; `sh <<EOF` with `$C`, `bash <<< "$X"` refuse as shell input that would expand; `cat bad.sh \| sh`, `{ sh; } < bad.sh`, `bash < <(cat bad.sh)` refuse as reading standard input; `. <(cat bad.sh)` as a script not named; in-root here-doc, `sh -s < okcd.sh` and `bash <<< 'echo hi'` are null. |
| `REQ-plugins-087` (cannot check) | `tests/shell.clamp-scripts.test.ts` | `sh missing.sh`, `. ./missing.sh` (not found); `sh "$S"`, `. ~/x.sh`, `sh *.sh` (path would expand); `echo 'cd /etc' > gen.sh; sh gen.sh`, `cp bad.sh ok.sh && ./ok.sh`, `cp /tmp/x new.sh && ./new.sh`, `for i in 1 2; do sh ok.sh; cp bad.sh ok.sh; done` (written by this command, also after the run in the text); a 1.2 MB script (too large). |
| `REQ-plugins-087` (`trap`, `alias`) | `tests/shell.clamp-scripts.test.ts` | `trap 'cd /etc' EXIT` → `/etc`, `trap -- 'cd ..' INT` → `..`, `trap "$X" EXIT` → `$X`, `alias c=cd`+newline+`c /etc` → `c=cd (alias)`; `trap 'rm -f tmp.txt' EXIT; trap - EXIT; trap -p` and bare `alias` are null. |
| `REQ-plugins-087` (allowed) | `tests/shell.clamp-scripts.test.ts` | `sh ok.sh`, `./ok.sh && ./okcd.sh`, `. ./ok.sh`, `bash scripts/build.sh`, `cd sub && sh ../ok.sh`, `chmod +x ok.sh && ./ok.sh`, `git add ok.sh && git commit -m x ok.sh && ./ok.sh`, `./bin-true` (binary), `./tool.py` (`#!/usr/bin/env python3`), `cc -o app main.c && ./build/app`, `sh -c 'echo hi' && bash -lc 'cd sub'` are null. |
| `REQ-plugins-087` (`-c -`, option clusters) | `tests/shell.clamp-quoting.test.ts` | `sh -c - 'cd /etc'` and `bash -co pipefail 'cd /etc'` → `/etc`; `bash -eo pipefail -c 'cd ..'` → `..`; `bash scripts/build.sh` moved to the scripts test, where the file exists. |
| `REQ-plugins-087` (end to end) | `tests/shell.clamp-scripts.test.ts` | `./bad.sh`, `sh bad.sh`, `. ./bad.sh`, `sh < bad.sh`, a here-doc fed to `sh`, `cat bad.sh \| sh`, `trap`, `alias` and write-then-run each return exit 2, SAFE-3, `data.refused`; neither the `spawned` marker nor `gen.sh` is created and `/etc` is never printed; `./ok.sh`, `sh okcd.sh`, `bash scripts/build.sh` and an in-root here-doc run and print their output. |
| `REQ-plugins-087` (earlier fixtures) | `tests/shell.clamp-failclosed.test.ts`, `tests/shell.clamp-bypass.test.ts`, `tests/shell.plugins.test.ts`, `tests/shell.clamp-quoting.test.ts` | every existing assertion passes unchanged except `bash scripts/build.sh`, which now needs the file to exist and is covered in the scripts test. |

## Automated coverage

- `bunx tsc --noEmit` — passed.
- `bun test` (Bun 1.4.2, as CI pins) — 1711 passed, 2 skipped, 0 failed.
- `specsync check --require-coverage 100` — 5 specs passed, file and LOC coverage 100%.
- `fledge lanes run verify --non-interactive` — green (see the change check record).
- Differential script harness (`scripts-diff.ts`, 47 command/shell pairs run in real dash / bash / `bash --posix` from a fresh project dir; a script appends to a marker when it lands in `/etc`): every escaping form refused, every in-root form allowed; the two interpreter cases (`./tool.py`, `python3 -c`) escape and are documented residual risk.
- #226's differential fuzz re-run against this clamp: 0 misses in 19,895 dash (1,540 escapes), 19,870 `bash --posix` (1,224) and 9,973 `bash` (629) samples; the share refused without an escape is unchanged (~45%, mostly unterminated quotes in random input).
- Common agent commands on a real layout stay allowed: `source .venv/bin/activate` (python3 -m venv), `. ./.env`, `./node_modules/.bin/tsc`, `git commit -m "$(cat <<'EOF' … EOF)"`, `cat <<EOF > notes.txt`, `find | xargs grep`, `npm run build && npm test`.
- Cost: a 100 KB command without scripts takes ~30 ms (was ~13 ms; the writes pre-pass tokenizes it once more); the 1 MiB script budget bounds a long sourced chain at ~0.26 s.
