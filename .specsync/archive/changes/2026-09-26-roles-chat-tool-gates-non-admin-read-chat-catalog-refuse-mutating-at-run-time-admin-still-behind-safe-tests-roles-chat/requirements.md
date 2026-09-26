---
change: roles-chat-tool-gates-non-admin-read-chat-catalog-refuse-mutating-at-run-time-admin-still-behind-safe-tests-roles-chat
artifact: requirements
---

# Requirements

- ROLES-CHAT-2: Non-ADMIN acting sessions catalog = read/chat only (no mutating).
- ROLES-CHAT-3: runPlugin refuses mutating for non-ADMIN with "not allowed for your role".
- ROLES-CHAT-4: ADMIN may use mutating still behind SAFE-1..9 / ALLOW / MEMORY-ACL.
- ROLES-CHAT-5: Mutating = dangerous:true OR write/edit/delete/post/merge/config (notably files-write/edit).
- ROLES-CHAT-6: Re-check ADMIN each call (env bit + owner).
- ROLES-CHAT-7: Automated tests for non-admin refuse, admin+SAFE reach, channel allowlist still required.
- Bump package to 0.0.13; verbose CHANGELOG.
