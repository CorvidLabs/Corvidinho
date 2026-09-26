---
change: roles-chat-tool-gates-non-admin-read-chat-catalog-refuse-mutating-at-run-time-admin-still-behind-safe-tests-roles-chat
artifact: context
---

# Context

Leif confirmed ROLES-CHAT-1..7 (HI capture PR). Gap: Discord sets
NON_INTERACTIVE so `dangerous:true` tools are blocked, but
`files-write` / `files-edit` are `dangerous:false` with minTier=code —
non-ADMIN users can mutate files when tier is code.

Order: HI capture → this gates PR → then #43 ADMIN slash (do not start #43 yet).
