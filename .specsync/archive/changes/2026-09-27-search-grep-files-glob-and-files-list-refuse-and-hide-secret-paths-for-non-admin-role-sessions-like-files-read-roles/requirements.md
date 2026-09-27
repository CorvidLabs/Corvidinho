---
change: search-grep-files-glob-and-files-list-refuse-and-hide-secret-paths-for-non-admin-role-sessions-like-files-read-roles
artifact: requirements
---

# Requirements

ROLES-CHAT-8 (hi/roles.md: non-ADMIN community sessions refuse secret
paths), with SAFE-2 and SAFE-6 (hi/safe.md) as the reasons secrets stay out of
tool output. Added REQ-plugins-267 (search-grep, files-glob and files-list
apply the files-read secret-path gate). REQ-plugins-081 (files/search
builtins) and REQ-plugins-243 (argv) are unchanged and still hold; ADMIN and
CLI behaviour is unchanged (ROLES-CHAT-4).
