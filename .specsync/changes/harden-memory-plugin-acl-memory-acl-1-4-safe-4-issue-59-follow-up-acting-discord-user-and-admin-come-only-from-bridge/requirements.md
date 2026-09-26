---
change: harden-memory-plugin-acl-memory-acl-1-4-safe-4-issue-59-follow-up-acting-discord-user-and-admin-come-only-from-bridge
artifact: requirements
---

# Requirements

1. Memory plugins SHALL NOT accept identity, ADMIN, or store-path from argv:
   `--user`, `--admin`, `--db` (and `--x=value` forms) are refused with a
   clear error. Acting user comes only from `CORVIDINHO_ACTING_DISCORD_USER_ID`
   (set by the bridge per spawn); missing ⇒ refuse (MEMORY-ACL-1).
2. ADMIN (forget, override, recall `--include-deleted`) SHALL be re-checked in
   the plugin handler at call time (ADMIN-4 / DISCORD-7):
   - both `CORVIDINHO_DISCORD_ADMIN_USERS` and `_ROLES` empty ⇒ nobody ADMIN,
     even if `CORVIDINHO_ACTING_IS_ADMIN=1` (MEMORY-ACL-4);
   - the bridge's per-dispatch `CORVIDINHO_ACTING_IS_ADMIN=1` is required on
     every path (scheduled runs spawn with it off ⇒ never ADMIN);
   - acting user in the Discord deny list or `DISCORD_MUTED_USER_IDS` ⇒ never ADMIN;
   - acting user id in `CORVIDINHO_DISCORD_ADMIN_USERS` ⇒ ADMIN;
   - otherwise ADMIN only via role: admin roles configured (roles are only visible to the bridge).
3. Self-forget stays ADMIN-only; non-admin refusals stay opaque (`not authorized`)
   and never include memory content (MEMORY-ACL-2).
4. Forget/override SHALL be two-phase (SAFE-4): phase 1 (no `--confirm`) returns
   a confirm token + expiry + target id/category/key/owner (no content).
   Phase 2 `--confirm <token>` succeeds only if the HMAC matches op + actor +
   memory id + the row's `updated_at` (+ override content hash), the token is
   unexpired (10 minutes), and it is confirmed from a different process/turn
   than the one that issued it. Tokens are single-use because the row's
   `updated_at` changes on forget/override. HMAC secret lives in the existing
   `schema_meta` table (no schema bump).
5. Discord spawn SHALL always set `CORVIDINHO_ACTING_DISCORD_USER_ID` (empty when
   no actor) and `CORVIDINHO_ACTING_IS_ADMIN`; WATCH spawn SHALL clear both.
6. Fixture tests cover every refusal above plus the happy two-phase path;
   `bun test`, `bunx tsc --noEmit`, `specsync check`, and
   `fledge lanes run verify --non-interactive` stay green.
