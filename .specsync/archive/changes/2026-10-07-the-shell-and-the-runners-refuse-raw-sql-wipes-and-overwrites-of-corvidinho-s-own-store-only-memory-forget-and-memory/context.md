---
change: the-shell-and-the-runners-refuse-raw-sql-wipes-and-overwrites-of-corvidinho-s-own-store-only-memory-forget-and-memory
artifact: context
---

# Context

SAFE-4 is captured on main (`hi/safe.md`): "Destructive data ops (raw SQL
wipes, memory deletes) need a two-phase confirm so a single confused tool
call cannot erase the store." Nothing new is captured here. Memories already
change only through `memory-forget` / `memory-override`, which take a
two-phase confirm (REQ-plugins-011) — since SAFE-18.a (#409) the owner's DM
card with Approve and a one-time code (REQ-plugins-183), no typed token. Leif's SAFE-3 decision (2026-09-28
interview, round 2) offers the shell and the language runners to the owner's
own talks, inside the talk's worktree, "with #233's clamp + SAFE-21 foot-gun
refusals".

What was wrong on main (86d68cd0), found by the W13 re-audit and checked
here by running each form against a temp store: since SAFE-3.a (#346) the
owner's allowlisted `shell-exec` could erase Corvidinho's own store with a
single call — `sqlite3 ~/.local/share/corvidinho/corvidinho.db "DELETE FROM
memories"`, `DROP TABLE`, through `"$CORVIDINHO_DATA_DIR"` or a worktree
symlink to the data dir, `truncate -s 0 <db>`, `cp /dev/null <db>`,
`dd of=<db>`, `python3 -c` with `sqlite3` inside the shell — and
`python-exec` / `node-exec` likewise. Only `rm` (and `mv`, `shred`, `>`)
was refused, by SAFE-21. `firstFootgun`, `firstDisallowedCd` and
`shellProdWhy` returned null for these; the SAFE-21 secret places list the
config dir but not the data dir (`src/store/paths.ts` `resolveDataDir` /
`defaultDbPath`); `runnerChildEnv` keeps `HOME` and
`CORVIDINHO_DATA_DIR`, so `~` and `$CORVIDINHO_DATA_DIR` reach the live store.

Constraints: specs only through SpecSync; #232 / #233 scope untouched;
#372 (AGENT-18.a, `plugins/shell/sdd-lifecycle.ts`) and #373 (SAFE-21.b
cloud-credential scrub) are merged, so the guard lives in its own module
(`plugins/shell/store-guard.ts`) and their order (lifecycle, SAFE-21, clamp)
is kept; the shared files get a few lines each. No new slash command, env
var, must-ask class, config key or criterion; no schema change.
