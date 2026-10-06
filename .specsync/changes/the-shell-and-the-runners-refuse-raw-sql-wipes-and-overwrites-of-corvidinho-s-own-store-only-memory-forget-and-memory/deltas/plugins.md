---
module: plugins
change: the-shell-and-the-runners-refuse-raw-sql-wipes-and-overwrites-of-corvidinho-s-own-store-only-memory-forget-and-memory
---

# Delta: plugins (the shell and the runners never wipe or overwrite Corvidinho's own store — SAFE-4)

## Added

### REQUIREMENT REQ-plugins-404

SAFE-4 in the shell and the language runners (captured on main,
`hi/safe.md`: "Destructive data ops (raw SQL wipes, memory deletes) need a
two-phase confirm so a single confused tool call cannot erase the store.").
Memories change only through `memory-forget` / `memory-override` and their
two-phase confirm (REQ-plugins-011); a shell or runner call has no second
phase, so it SHALL NOT wipe or overwrite the store.

`shell-exec` SHALL refuse a command that may wipe or overwrite Corvidinho's
own store after the SAFE-21 check (REQ-plugins-494) and before the SAFE-3
clamp and any spawn: ok=false, exit 2, `data.refused` true with
`rule: "SAFE-4"` and the in-root `script` it was found in (null for the
typed command), and the message
`shell-exec refused (SAFE-4): <why>[ (in SCRIPT)]; <STORE_INSTEAD>`, where
`STORE_INSTEAD` says to change or forget memories only with
`memory-forget` or `memory-override` and their two-phase confirm. The store
SHALL be the data dir `resolveDataDir` names (`CORVIDINHO_DATA_DIR`, else
`~/.local/share/corvidinho`) and everything in it — `corvidinho.db` and its
`-wal` / `-shm` / `-journal` siblings included — as written and with
symlinks resolved; when the project root is inside the data dir, only the
DB file family counts. The check (`storeRefusal` / `firstStoreHit`,
`plugins/shell/store-guard.ts`) SHALL read every simple command over the
SAFE-21 ground through the same walker (`forEachSimpleCommand`), with every
command an exec wrapper or `find -exec` runs (`commandChain`), and SHALL
refuse:

- naming: a command with a word that lands in the store (as written, after
  `~`, `$HOME`, `$CORVIDINHO_DATA_DIR` or another variable the env sets, or
  through a symlink, a worktree link to the data dir included) or text that
  spells it (its path, `~/…`, `$HOME/…`, or its path below the home dir); an
  assignment or output redirection pointing into it, an in-root script's
  included; input fed to the command that names it; and code given to a SQL
  client or interpreter (its words, here-docs and here-strings, the
  commands piped into it) that names it or `CORVIDINHO_DATA_DIR`. Read-only
  looks (`ls`, `stat`, `du`, `df`, `file`, `wc`, `head`, `tail`, `cat`,
  `cmp`, `diff`, the checksum tools, `readlink`, `realpath`, `echo`,
  `printf`, `test`, `grep`, `rg`, `cd`, a `find` with no action) SHALL still
  run. A SQL client (`sqlite3`, `sqlite`, `sqlite3_rsync`, `sqlcipher`,
  `sqlite-utils`, `litecli`, `duckdb`) on the store SHALL be refused for
  reads too: the check cannot tell its reads from its writes. Shells,
  `eval` and `trap` are read through the code the walker hands over.
- fail closed: a SQL client's words and input (here-docs, here-strings,
  `<` files, the commands piped into it, and the SQL files it reads, which
  are scanned for the store) and a write command's target (`truncate`,
  `fallocate`, the `cp` / `install` / `rsync` destination, `dd of=`, the
  `tar -x` / `unzip` directory) SHALL be refused when they expand to anything
  but `~`, `$HOME` or `$CORVIDINHO_DATA_DIR` (those too once the command
  re-assigns, unsets or reads into `HOME` / `CORVIDINHO_DATA_DIR`), use
  `~user` or a brace, come from `xargs`' input, are a pattern that can match
  the store, can't be walked, or are what a `find` that can reach the store
  (or follows symlinks) finds; a tree copied or extracted into a directory
  that holds the store SHALL be refused.

SAFE-21 SHALL keep answering first, with its families, order and messages
unchanged (`rm <store db>` stays a SAFE-21 delete). `shellProdWhy`
(AUTONOMY-9) SHALL classify no command this check refuses.

`node-exec`, `python-exec` and `cargo-exec` (`runRunner`) SHALL refuse,
before the spawn, argv with a word that names the store or its data dir
(its text, `CORVIDINHO_DATA_DIR`, or a path from the project root that
leads into it): ok=false, exit 2, `data.refused` true with
`rule: "SAFE-4"` and `runner`, and `<runner> refused (SAFE-4): <why>;
<STORE_INSTEAD>` (`runnerStoreRefusal`); `runnerProdWhy` SHALL return null
for such argv.

Commands and argv that don't name the store SHALL still run. Residual
(stated, not checked): a store path a program builds at runtime (a command
substitution or a variable filled from program output, handed to a command
outside the SQL-client and write families; code that joins the path), code
that reaches the store without naming it (a script file handed to an
interpreter, a module it imports), and an in-root script's output
redirection to an expanded path (as for the SAFE-21 edit family). No new
command, slash command, env var, must-ask class, config key or schema.

Acceptance Criteria
- With `CORVIDINHO_DATA_DIR` a temp store seeded through `memory-store`, `shell-exec` refuses with exit 2, `shell-exec refused (SAFE-4): …`, `data.rule` `SAFE-4` and the two-phase `memory-forget` / `memory-override` named instead, spawning nothing, and the memories rows read back unchanged: `sqlite3` `DELETE` / `DROP TABLE` / `ATTACH` on `corvidinho.db` through `~`, `$HOME`, `${HOME}`, `$CORVIDINHO_DATA_DIR`, the absolute path or a worktree symlink to the data dir (SQL as an argument or piped in), `truncate -s 0`, `cp /dev/null`, `cp fixture.db` over it, `dd of=`, `python3 -c` with `sqlite3`, `sh -c`, `timeout`, and an in-root script run with `sh wipe.sh` (named in the message) or SQL read from `< wipe.sql`.
- A target only the running shell can resolve (`$(cat where.txt)`, a variable the command sets, `xargs` input) is refused fail-closed; the `-wal` / `-shm` / `-journal` siblings are refused like the DB.
- `python-exec` and `node-exec` refuse pre-spawn with `<runner> refused (SAFE-4): …` argv that names the DB path, `CORVIDINHO_DATA_DIR` or a worktree link to the data dir, and the rows stay; `python-exec ["-c","print(40 + 2)"]` runs.
- `sqlite3 ./fixture.db 'DELETE FROM t'` in the worktree changes the fixture; `ls`, `stat`, `sha256sum` of the store, `cp` / `truncate` of worktree files and `python3 -c "print(1)"` run; `rm <store db>` and `echo > <store db>` still refuse under SAFE-21 (delete, edit).
- `shellProdWhy` / `runnerProdWhy` return null for a refused call that also names `kubectl` (non-null without the store part).
- `memory-forget` / `memory-override` phase 1 still only issues a confirm token and the row stays (REQ-plugins-011).
- `tests/shell.store-guard.test.ts` fails on the base sources and passes after.
