---
change: nightly-sqlite-backup-to-a-directory-the-owner-sets-with-a-weekly-tested-restore-a-restore-command-and-a-once-per
artifact: context
---

# Context

Issue #68 (P1, M1 "Knows everyone"): memory is about to hold people, private
notes and history, and losing the box should not lose them. Leif confirmed the
criteria in the 2026-09-28 interview (round 7), captured in this PR with `hi`
into the new family `hi/ops.md`:

- **OPS-1** "A nightly backup goes to a place I choose, and I'm told if it fails."
- **OPS-2** "A backup can be restored, and the restore is tested regularly."

Interview design call: "local dir you set (nightly SQLite online-backup snapshot
to a configured dir, rotating copies; owner told on failure; weekly restore
test into a temp dir)". Orchestrator notes: no backup when unset and doctor
says so; told once per failure streak; the run is logged; a CLI restore of a
named snapshot to a target path, never overwriting the live DB while a process
holds it; runs from the existing scheduler/daemon tick; no secrets in logs;
backups inherit the DB's scrubbing (SAFE-6).

Gap on main (310861f): nothing copies `corvidinho.db`; there is no restore
path and no doctor line; `docs/DAEMON.md` lists heartbeats / crash DMs as
draft OPS-3..5 (not touched here).

Constraints: v1 is off-chain (no on-chain backup; issue non-goal). No new
table or schema version (state in `schema_meta`, like the announce channel and
the memory confirm secret). One new optional env var only
(`CORVIDINHO_BACKUP_DIR`, needed by "a place I choose"). No DM path exists in
the bridge (DISCORD-5: it posts only in configured channels), so the owner is
told in the configured `/announce` ops channel with only the owner pinged.
#232/#233 scope untouched. The issue's "encrypted before it leaves the box"
does not apply to a local directory; left for Leif.
