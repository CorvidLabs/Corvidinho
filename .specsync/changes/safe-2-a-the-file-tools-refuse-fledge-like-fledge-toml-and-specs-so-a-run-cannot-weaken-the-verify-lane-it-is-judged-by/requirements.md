---
change: safe-2-a-the-file-tools-refuse-fledge-like-fledge-toml-and-specs-so-a-run-cannot-weaken-the-verify-lane-it-is-judged-by
artifact: requirements
---

# Requirements

Captured HI (in this PR, from Leif's 2026-09-28 interview, round 12):

- **SAFE-2.a** (hi/safe.md, under SAFE-2): "Its file tools also can't change
  .fledge/, so a run can't weaken the checks it is verified by."
- Parent **SAFE-2** (already captured): "The agent cannot delete or overwrite
  protected project infra (env files, git metadata, fledge.toml, specs,
  keystores) through its file tools."

Canonical requirements changed (see deltas):

- Modified **REQ-plugins-083**: the protected set gains any `.fledge` path
  component (lane imports and config the verify gate runs; reads stay
  allowed); acceptance bullets for files-write / edit / delete of `.fledge/`
  in every spelling and through links, and for git-commit refusing to stage a
  `.fledge/` deletion.
- Modified **REQ-discord-476**: the send-file SAFE-2 list names `.fledge/`;
  acceptance bullet for a `.fledge/` file and a link to it being refused.
- REQ-plugins-182 (git-commit refuses staging the deletion of any
  `isProtectedPath` path) is unchanged; the new git test is evidence for it.
