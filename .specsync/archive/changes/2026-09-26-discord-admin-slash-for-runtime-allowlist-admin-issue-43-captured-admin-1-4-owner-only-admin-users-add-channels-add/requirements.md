---
change: discord-admin-slash-for-runtime-allowlist-admin-issue-43-captured-admin-1-4-owner-only-admin-users-add-channels-add
artifact: requirements
---

# Requirements

Captured HI (`hi/admin.md`), met by this change:

- ADMIN-1: approve/add users to the live allowlist Corvidinho already uses
  (file/env) without weakening empty=deny-all → `/admin users add`.
- ADMIN-2: add and remove channels → `/admin channels add|remove`.
- ADMIN-3: show and update safe config knobs already represented in
  allowlist/env with an audit-friendly reply → `/admin config show`; the
  updatable knobs are `[discord].users` and `[discord].channels` (via
  ADMIN-1/2); env values and other file keys are shown read-only.
- ADMIN-4 / DISCORD-7 / IDENTITY-2: dispatcher ADMIN floor plus a handler
  re-check; no owner ⇒ nobody ADMIN.
- DISCORD-DENY-2: the admin tip now names `/admin channels add`.
- SAFE-5: admin mutations leave audit rows; SAFE-6: replies never contain
  tokens or secrets.

Canonical requirements: Added REQ-discord-043; Modified REQ-discord-009
(nine commands incl. `/admin`). See `deltas/discord.md`.

Left for HI capture (not built): user removal / roles / deny-list edits,
repo allowlist growth (draft ALLOW-7), spend caps, Discord audit verify
(draft SAFE-17), re-scrub trigger, people/role declarations.
