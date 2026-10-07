---
change: the-shell-and-the-runners-refuse-raw-sql-wipes-and-overwrites-of-corvidinho-s-own-store-only-memory-forget-and-memory
artifact: research
---

# Research

- Reproduced on main (86d68cd0) against a temp store seeded through
  `memory-store` (`CORVIDINHO_DATA_DIR` under a temp `HOME`): `shell-exec`
  ran every form and the memories were gone afterwards (0 rows, or no
  `memories` table): `sqlite3` DELETE / DROP TABLE / ATTACH through `~`,
  `$HOME`, `$CORVIDINHO_DATA_DIR`, the absolute path and a worktree link;
  `truncate -s 0`, `cp /dev/null`, `dd of=`, `cp` of another DB over it;
  `python3 -c` with `sqlite3`; `sh -c`, `timeout`; a path only the running
  shell resolves (`$(cat where.txt)`); an in-root `sh wipe.sh`. `python-exec`
  and `node-exec` did the same from `-c` / `-e` code. Only `rm`, `mv`,
  `shred` and `>` were refused (SAFE-21).
- Why nothing caught them: `firstFootgun` has no store place (its secret
  places list the config dir, not the data dir); `firstDisallowedCd` only
  reads `cd` / `env -C`; `shellProdWhy` / `runnerProdWhy` only read prod
  words; `runnerChildEnv` keeps `HOME` and `CORVIDINHO_DATA_DIR`, so `~` and
  `$CORVIDINHO_DATA_DIR` name the live store in the child.
- The store layout (`src/store/paths.ts`, `src/store/db.ts`): one data dir
  (`CORVIDINHO_DATA_DIR`, else `~/.local/share/corvidinho`) holding
  `corvidinho.db` (rollback journal, so `-journal`; `-wal` / `-shm` if a
  tool switches it to WAL) plus `watch-spawn.jsonl` and daemon files.
- The SAFE-21 walker (`forEachSimpleCommand`) already hands every simple
  command over (dash and bash readings, `eval` / `trap` / `-c` strings,
  substitutions, here-docs to a shell, in-root scripts) with its pipeline and
  the dirs the shell may be in; `commandChain` gives the commands wrappers
  and `find -exec` run; `physicalPath` walks symlinks the way the kernel
  does; `globMatches` expands a pattern the way the shell does. The new
  module reuses all four rather than parsing again.
- `sqlite3` is not on this box or on the CI image by default, so the test
  uses a bun:sqlite stand-in; `python3` and `node` are real.
- Bun's `os.homedir()` does not follow a changed `HOME`, and `runPlugin`'s
  audit append opens the data dir, so the tests set both `HOME` and
  `CORVIDINHO_DATA_DIR` (the preload already isolates the latter).
