---
change: identity-durable-owner-record-issue-42-captured-slice-identity-1-identity-3-admin-4-allow-4-owner-discord-snowflake
artifact: tasks
---

# Tasks

- [x] `src/identity/owner.ts` loader + matchers + status line
- [x] Bridge config / SlashContext carry the owner; every permission call passes it
- [x] Owner resolves to ADMIN unless muted or deny-listed; admin env lists unchanged
- [x] Ephemeral `/status` + `corvidinho doctor` owner line (display only)
- [x] Example config + go-live docs
- [x] Fixture tests (precedence, matching, ADMIN, deny/mute, empty owner, status/doctor)
- [x] Spec files list + SpecSync check + fledge verify
