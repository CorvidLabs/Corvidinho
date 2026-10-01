---
change: work-schedule-and-the-scheduler-can-be-turned-off-in-corvidinho-plugins-and-existing-installs-stay-on-plugin-5-5-a
artifact: research
---

# Research

- Sources: `hi/plugin.md` (PLUGIN-5, PLUGIN-5.a), the interview record
  `/home/user/coord/interview-2026-09-28.md` (round 10), the slice entry
  `/home/user/coord/pr-plugin-toggles.json` and the plugin-toggles rows of
  `/home/user/coord/m34-defaults.md` (both files, off in either; refuse a
  resumed `/work` talk, do not abort in-flight runs; refuse every `/schedule`
  subcommand and document the re-enable behaviour).
- `scripts/corvidinho-update.sh` runs `git checkout --force <ref>`
  (docs/BOX-UPDATE.md step 3): local edits to the tracked `fledge.toml` are
  lost on every update, so a `fledge.toml`-only off fails open. The
  allowlist file (`resolveAllowlistPath`) is outside the checkout; the /admin
  writer (`src/discord/admin-allowlist.ts`) rewrites only the list lines it
  owns and keeps other sections verbatim; `scanSimpleToml` reads
  `[corvidinho.plugins]` as a lenient unrelated section, so the allowlist
  loader and doctor accept the table.
- The bridge and the daemon take `projectRoot` from `process.cwd()`
  (`src/cli.ts`), the Corvidinho checkout under systemd (`WorkingDirectory`),
  i.e. the install root.
- A `/work` talk continues through the chat path: a reply to its answer
  (`getByBotMessage`), an @mention routed to the author's active session in
  that channel (`getByUserChannel`), and its ask's buttons
  (`findPendingAsk`); `WorkStore` rows carry the `sessionId`.
- `SchedulerService.tick` runs `onTick` (cards, stuck WATCH asks),
  `deliverPendingAsks`, `spendDm.deliver` and `backup.tick` around the due
  loop; only `refresh` / `listDue` / the loop's claim need gating.
  `claimRun` advances `next_run_at` from now, so an overdue schedule fires
  once when schedules come back on (no catch-up).
