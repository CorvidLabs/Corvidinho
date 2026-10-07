---
change: the-shell-and-the-runners-refuse-raw-sql-wipes-and-overwrites-of-corvidinho-s-own-store-only-memory-forget-and-memory
artifact: testing
---

# Testing

`tests/shell.store-guard.test.ts` (12 tests): temp dirs only, never this
checkout or the operator's data dir; `HOME` is a temp home and
`CORVIDINHO_DATA_DIR` its `~/.local/share/corvidinho`, seeded with two
memories through `memory-store`; the worktree holds a link `store -> <data
dir>` and a `fixture.db`; a fake `sqlite3` (bun:sqlite) on PATH stands in for
the CLI, so a wipe that is not refused really happens. Every refused shell
command starts with `touch spawned`; every case reads the memories rows back.
Imports come only from modules the base has; the new module is imported
inside its unit test.

Fail-on-base proof: with 86d68cd0's `plugins/shell/commands.ts`,
`plugins/shell/must-ask.ts`, `plugins/shell/footguns.ts` and
`plugins/runners/commands.ts` swapped in and `plugins/shell/store-guard.ts`
removed, `bun test tests/shell.store-guard.test.ts` gave 3 pass, 9 fail: the
wipe-forms, fail-closed, looks-that-write, siblings, in-root-script, shell Approve-card,
runner-refusal and runner Approve-card cases and the unit test (module
missing). Run on the base with the assertions logged instead, every wipe form
spawned (marker written) and left 0 memories rows or no `memories` table
(`sqlite3` DELETE / DROP / ATTACH, `truncate`, `cp /dev/null`, `dd`, `cp`
over it, `python3 -c`, `sh -c`, `timeout`, `$(cat where.txt)`, `sh
wipe.sh`, `python-exec`, `node-exec`). The 3 that pass on both are the
still-runs, SAFE-21-first and two-phase memory-tool cases. Restored: 12 of 12
pass. With the first draft's `store-guard.ts` (c2567140, which let `xxd`,
`tree -o`, `less -o`, `rg --pre` and code in a variable through; `rg --pre rm`
and `less -o` were seen to delete / overwrite a temp file) the
looks-that-write case fails and the other 11 pass.

`tests/shell.*.test.ts`, `tests/runners.plugins.test.ts`,
`tests/*safe3a*.test.ts`, `tests/must-ask.*.test.ts`,
`tests/memory.plugins.test.ts` and `tests/fledge.plugins.test.ts` (tool
surface budget) still pass unchanged.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-404` | `tests/shell.store-guard.test.ts` "each wipe or overwrite form is refused before spawning, and the memories stay" | `sqlite3` DELETE / DROP / ATTACH through `~`, the absolute path, `$CORVIDINHO_DATA_DIR`, `${HOME}`, the worktree link and piped SQL; `truncate -s 0`, `cp /dev/null`, `dd of=`, `cp fixture.db` over it; `python3 -c` with `sqlite3`; `sh -c`; `timeout`: exit 2, `shell-exec refused (SAFE-4)`, the two-phase memory tools named, `data.rule` SAFE-4, no marker, rows unchanged. Fail on base. |
| `REQ-plugins-404` | "a look that writes or runs a command, and code put in a variable, are refused" | `xxd /dev/null <db>`, `tree -o <db>`, `less -o <db>`, `rg --pre rm x <db>`, `CODE='…CORVIDINHO_DATA_DIR…'; python3 -c "$CODE"` and its `export` form: exit 2, SAFE-4, no marker, rows unchanged. Fail on base and on c2567140's guard. |
| `REQ-plugins-404` | "a target the check can't resolve is refused fail-closed", "the -wal / -shm / -journal siblings are the store too", "an in-root script the command runs in a shell is read too" | `$(cat where.txt)` targets, a variable the command sets, `xargs truncate`; the three siblings; `sh wipe.sh` (named in the message, `data.script`) and `sqlite3 :memory: < wipe.sql`. Fail on base. |
| `REQ-plugins-404` | "commands that don't name the store still run", "SAFE-21 still answers first…" | `sqlite3 ./fixture.db 'DELETE FROM t'` empties the fixture; `ls`, `stat`, `sha256sum` of the store, worktree `cp` / `truncate`, `python3 -c "print(1)"` run; `rm <db>` / `echo > <db>` are SAFE-21 delete / edit. Pass on both. |
| `REQ-plugins-404` | "the owner gets no Approve card…", "argv that doesn't name the store still runs; no Approve card for a refused call" | `shellProdWhy` / `runnerProdWhy` null for a refused call with `kubectl`, non-null without the store part; `python-exec -c "print(40 + 2)"` prints 42. Fail on base. |
| `REQ-plugins-404` | "python-exec and node-exec refuse pre-spawn, and the memories stay" | the DB path, `CORVIDINHO_DATA_DIR` and the worktree link in `-c` / `-e` code: exit 2, `<runner> refused (SAFE-4)`, rows unchanged. Fail on base. |
| `REQ-plugins-404` | "firstStoreHit … reads the store from the env, fails closed, and states its residual" | default data dir; SQL reads refused too; `HOME` re-assigned, `~user`, glob through the link, tree copy / `tar -x -C`, `find ~ -exec`, `find -L`, expanding here-doc, assignment / `export`, `gzip`; commands not naming the store run (`rg -n` / `grep -rn` through the link and `export CORVIDINHO_DATA_DIR=/tmp/elsewhere` included); a root inside the data dir counts only the DB files; the residual (`python3 x.py`, a `pathlib`-built path) is not refused; runner argv. Fail on base (module missing). |
| `REQ-plugins-011` (unchanged) | "phase 1 only issues a token; the row stays until a later turn confirms" | `memory-forget` / `memory-override` as the owner return a pending confirm token; the row stays. Pass on both. |
| all | full `bun test`, `fledge lanes run verify --non-interactive` | Run on this branch before push. |
