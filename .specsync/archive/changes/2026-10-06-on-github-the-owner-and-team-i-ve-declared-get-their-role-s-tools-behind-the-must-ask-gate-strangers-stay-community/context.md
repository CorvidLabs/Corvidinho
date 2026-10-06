---
change: on-github-the-owner-and-team-i-ve-declared-get-their-role-s-tools-behind-the-must-ask-gate-strangers-stay-community
artifact: context
---

# Context

- Issue #65 (roles). #285 built owner / team / community in the tool layer
  (`src/plugins/roles.ts`, IDENTITY-8..12) but every WATCH run was stamped
  `CORVIDINHO_ACTING_IS_ADMIN=0` with no role, so the recognised owner and
  declared team got community tools on GitHub. The v0.0.35 rollup on #65
  listed this as #285 design choice 3, pending Leif.
- Leif answered in round 16 of the 2026-09-28 interview (2026-10-06):
  "role tools + must-ask — recognised owner/team (stable GitHub id) get their
  role's tools on GitHub (WATCH) too, behind the same must-ask gate;
  strangers stay community." Captured in this PR with `hi` as IDENTITY-12.a
  (its own commit), then built.
- Found while building: an owner-triggered WATCH run would have become the
  first WATCH run that discovers Fledge plugin commands (owner-only
  discovery); SAFE-3.a says WATCH never gets runs of project code, so the
  schedule rule (REQ-agent-741) now covers WATCH too (REQ-agent-1201).
- Constraints kept: specs only through SpecSync; v1 off-chain; owner admins,
  team works; WATCH-only limits stay (event repo allowlist, SAFE-3.a no
  shell / runners / Fledge runs on WATCH); delegate / council workers keep
  today's community role (not part of this decision); #232 / #233 scope not
  touched; no new env var, config key, table or schema version.
