---
change: strict-identity-2-admin-is-owner-only-issue-42-leif-decision-admin-user-role-env-lists-no-longer-grant-admin-no-owner
artifact: plan
---

# Plan

1. Remove admin-list ADMIN branches from `resolvePermissionLevel`.
2. Make the memory handler ADMIN re-check owner-only.
3. Add bridge start-up and doctor warnings for legacy admin lists / no owner.
4. Update fixture tests that used admin lists to use the owner; invert the
   tests that asserted lists grant ADMIN.
5. Update docs and spec requirements (REQ-discord-042, REQ-plugins-011,
   REQ-plugins-042, REQ-cli-042).
