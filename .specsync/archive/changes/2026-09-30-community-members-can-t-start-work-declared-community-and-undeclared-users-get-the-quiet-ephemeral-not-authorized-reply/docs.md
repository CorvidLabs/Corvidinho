---
change: community-members-can-t-start-work-declared-community-and-undeclared-users-get-the-quiet-ephemeral-not-authorized-reply
artifact: docs
---

# Docs

- `docs/discord.md`: the slash table's `/work` row says owner and team
  only, community gets the ephemeral `not authorized` (IDENTITY-11.a); the
  Roles section's Community bullet says community can't start `/work`
  (quiet refusal before any worktree / branch / task / run / verify, role
  re-read per command, SAFE-13 still reports an injected one, `/session
  start` and chat stay open); the Deny behavior text lists a community
  `/work` among the ephemeral `not authorized` cases; the source map names
  `work.ts`; the criteria list names IDENTITY-11.a.
- `docs/DISCORD-GO-LIVE.md`: E.1 roles bullet (only owner and team start
  `/work`, so with no owner and no team nobody can) and E.6 (community can't
  start `/work`; the line that said `/work` runs read-only for community is
  replaced).
- `allowlist.example.toml`: the roles comment says community can't start
  `/work`.
- `specs/discord/discord.spec.md` prose and `files:`,
  `specs/discord/testing.md`.
- `README.md` and `STATUS.md` state nothing this changes. No operator knob,
  env var, slash command or CLI flag.
