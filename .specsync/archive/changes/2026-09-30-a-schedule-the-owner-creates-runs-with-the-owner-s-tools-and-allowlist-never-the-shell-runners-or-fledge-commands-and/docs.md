---
change: a-schedule-the-owner-creates-runs-with-the-owner-s-tools-and-allowlist-never-the-shell-runners-or-fledge-commands-and
artifact: docs
---

# Docs

- `docs/discord.md`: the Roles bullet (the owner's own schedule runs as the
  owner, read live; others' schedules community; never team), the project
  memory line, the DISCORD-17 line (the owner's own schedule passes the
  role check for `discord-send-file` but has no conversation to attach in),
  a must-ask bullet "In a schedule you created" (the card, a no
  ends the run with a blocking question, the schedule waits, its own posts
  need no card) and the SAFE-13 schedule line.
- `docs/DISCORD-GO-LIVE.md`: E.3 catalog roles and Fledge discovery, E.4
  daemon bullet (owner schedules run as the owner, read at each run), E.5
  (`delegate` / `council` for the owner's schedule when the gate is on), E.6
  roles lines.
- `docs/DAEMON.md`: the owner is read at start for the creator gate and at
  each run for the owner stamp.
- Specs: `discord.spec.md` (files, REQ-discord-713 line, new paragraph),
  `plugins.spec.md` (roles paragraph), `agent.spec.md` (paragraph, scenario,
  two error rows), `cli.spec.md` (daemon line), and each module's
  `testing.md`.
- `plugins/memory/commands.ts`: the project-memory comment names the
  owner's own schedules among the roles that use it.
- Specs (review fixes): `REQ-plugins-101` (project memory: schedules other
  people create are community, the owner's own is the owner) and
  `REQ-discord-476` (the owner's own schedule passes the `discord-send-file`
  role check and is refused for want of a conversation channel) modified.
- No CHANGELOG / package.json edit (the release PR writes them).
