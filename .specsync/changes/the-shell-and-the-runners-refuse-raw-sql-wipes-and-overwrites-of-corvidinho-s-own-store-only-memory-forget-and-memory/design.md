---
change: the-shell-and-the-runners-refuse-raw-sql-wipes-and-overwrites-of-corvidinho-s-own-store-only-memory-forget-and-memory
artifact: design
---

# Design

- **`plugins/shell/store-guard.ts`** (new). The store is resolved per call
  from the env the child gets (`resolveDataDir`, `defaultDbPath`): the data
  dir as written and with symlinks resolved, or only the DB file family when
  the project root sits inside the data dir (so a shell rooted there still
  works). `firstStoreHit(cmd, root, opts)` walks the command with the
  SAFE-21 walker (`forEachSimpleCommand`) and each command's exec-wrapper
  chain (`commandChain`):
  - naming: every word of a non-reader command (and its assignments, output
    redirections, input, and — for SQL clients and interpreters — the
    commands piped into it) is checked as text (the store's spellings, with
    a name-character boundary on both sides; `CORVIDINHO_DATA_DIR` in code)
    and as a path (whole word, the pieces after `=` / `:`, and the
    path-like tokens of code), expanded loosely (`~`, any env variable) and
    walked with `physicalPath` so a worktree symlink lands in the store.
    Read-only looks are skipped (`rg` only without `--pre`; `xxd`, `tree`
    and `less`, which can write a file, are not looks); shells, `eval` and
    `trap` are read through the code the walker hands over. An assignment
    (prefix, or an `export` / `declare` / `typeset` / `local` / `readonly`
    word) is also checked with its value as code, so code naming
    `CORVIDINHO_DATA_DIR` carried to `python3 -c "$CODE"` refuses. A SQL
    client naming the store refuses for reads too (stated in the spec).
  - fail closed: SQL-client words and input, and write-command targets
    (`truncate`, `fallocate`, `cp` / `install` / `rsync` destination,
    `dd of=`, `tar -x` / `unzip` directory), expanded strictly: only `~`,
    `$HOME`, `$CORVIDINHO_DATA_DIR` resolve (and not once the command
    re-assigns them); `xargs` input, patterns (via `globMatches`, now
    exported from footguns.ts unchanged) and `find` start paths that can
    reach the store refuse; tree writers also refuse a directory that
    holds the store. SQL files a client reads (`-init`, `.read`, `<`,
    `cat f |`) are scanned for the store.
  `storeRefusal` / `storeRefuseMessage` build the exit-2 result;
  `runnerStoreHit` / `runnerStoreRefusal` check runner argv (text and
  paths from the root).
- **`plugins/shell/commands.ts`**: `storeRefusal` runs after SAFE-21 and
  before the clamp, so SAFE-21 keeps its families, order and messages and a
  store wipe names SAFE-4 rather than a clamp escape; description updated.
- **`plugins/shell/must-ask.ts`**: `shellProdWhy` and `runnerProdWhy` return
  null for a call the guard refuses (no Approve card for it).
- **`plugins/runners/commands.ts`**: `runRunner` refuses before the spawn,
  so the registered runners and every direct caller are covered.
- Alternatives ruled out: dropping `HOME` / `CORVIDINHO_DATA_DIR` from the
  child env (an absolute path still reaches the store, and tools need
  `HOME`); a must-ask card (no new must-ask class; SAFE-4 asks for a
  two-phase confirm, which the memory tools already have); telling SQL reads
  from writes (refused for both instead, stated in the spec); reading
  interpreter script files (Corvidinho's own sources and tests name the data
  dir, so `bun test` would be refused; stated residual).
