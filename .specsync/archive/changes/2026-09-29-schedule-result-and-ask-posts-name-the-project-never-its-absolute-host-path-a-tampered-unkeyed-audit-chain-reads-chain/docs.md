---
change: schedule-result-and-ask-posts-name-the-project-never-its-absolute-host-path-a-tampered-unkeyed-audit-chain-reads-chain
artifact: docs
---

# Docs

- `docs/discord.md` (stuck / clarify ask section): the schedule line that
  prefixes a scheduled question (and the `✅` / `❌` result posts) names the
  project — the last segment of an absolute path — never its absolute host
  path.
- `docs/DISCORD-GO-LIVE.md` (Audit key row): without the key a tampered
  unkeyed row before any keyed row still reads `chain BROKEN at #N`; only
  reaching a keyed row reads `cannot verify keyed rows (…)`.
- `specs/discord/discord.spec.md`: schedule post prefix invariant next to
  REQ-discord-353. `specs/plugins/plugins.spec.md`: SAFE-5 paragraph says
  when the line reads BROKEN vs cannot verify. `specs/discord/testing.md`
  and `specs/plugins/testing.md`: new test bullets. Version and change log
  are left to `specsync change check --commit` (materialize).
- README unchanged (it does not describe schedule posts or the audit line).
  No CHANGELOG/STATUS edit (bug-fix slice).
