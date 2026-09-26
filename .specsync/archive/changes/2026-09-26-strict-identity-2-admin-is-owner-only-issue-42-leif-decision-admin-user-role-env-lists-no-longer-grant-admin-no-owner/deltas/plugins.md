---
module: plugins
change: strict-identity-2-admin-is-owner-only-issue-42-leif-decision-admin-user-role-env-lists-no-longer-grant-admin-no-owner
---

# Delta — plugins (memory ADMIN is owner-only)

## Modified

### REQUIREMENT REQ-plugins-011

Memory plugins SHALL take the acting user and ADMIN status only from the
environment the Discord bridge sets per spawn, never from argv (argv is
model-controlled in the tool loop). `--user`, `--admin`, and `--db`
(including `--flag=value` forms) SHALL be refused. A missing
`CORVIDINHO_ACTING_DISCORD_USER_ID` SHALL refuse (MEMORY-ACL-1).

ADMIN for `memory-forget`, `memory-override`, and `memory-recall
--include-deleted` SHALL be re-checked inside the handler at call time
(ADMIN-4 / DISCORD-7). The bridge's per-dispatch
`CORVIDINHO_ACTING_IS_ADMIN=1` is required on every path (a scheduled run
spawned with it off never gets ADMIN), and the live config must agree: ADMIN
is owner-only (IDENTITY-2) — the acting user must be the configured owner;
no owner ⇒ nobody is ADMIN even when `CORVIDINHO_ACTING_IS_ADMIN=1`
(IDENTITY-3 / MEMORY-ACL-4); `CORVIDINHO_DISCORD_ADMIN_USERS` / `_ROLES`
never grant ADMIN; deny-listed or muted users are never ADMIN. Self-forget
stays ADMIN-only.
Refusals stay opaque and never include memory content (MEMORY-ACL-2).

Forget and override SHALL be two-phase (SAFE-4). Phase 1 (no `--confirm`)
returns a confirm token, expiry, and target id/category/key/owner — no
content. Phase 2 (`--confirm <token>`) SHALL succeed only when the token's
HMAC matches op + actor + memory id + the row's `updated_at` (+ override
content hash), it is unexpired (10 minutes), and it is confirmed from a
different process/turn than the one that issued it, and the token appears in
the human's own message for this run (bridge-extracted into
`CORVIDINHO_ACTING_CONFIRM_TOKENS`) so the model cannot confirm from its own
memory. Tokens are single-use
because the row changes. The HMAC secret lives in `schema_meta` (no schema
version bump).

Acceptance Criteria
- `--user` / `--admin` / `--db` refused on all memory commands.
- No acting user env ⇒ refused; other actors never see a user's memories.
- No owner + `CORVIDINHO_ACTING_IS_ADMIN=1` ⇒ forget/override refused.
- Owner id without the bridge bit (scheduled runs) refused; deny-listed or muted owner refused; admin user/role lists + env bit refused.
- Phase 1 returns a token without content; same-turn confirm refused; a token the human did not supply refused; new-turn human-supplied confirm succeeds; replay refused.
- Token for another memory, another actor, or changed override content refused; expired token refused.
- `--include-deleted` refused for non-admins; `--include-deleted=false` is off.
- `--user` / `--admin` / `--db` are only refused in flag position; text after `--` or in `--content=` is data.

### REQUIREMENT REQ-plugins-042

The memory plugins' handler-time ADMIN re-check (REQ-plugins-011) SHALL treat
only the configured owner (IDENTITY-1/2; matched by Discord snowflake from the
owner env or the allowlist `[owner]` section) as ADMIN, under the same
conditions as the bridge: the per-dispatch `CORVIDINHO_ACTING_IS_ADMIN=1` bit
is still required, and a muted or deny-listed owner is not ADMIN. With no
owner nobody is ADMIN; the admin user/role lists are ignored.

Acceptance Criteria
- Owner + bridge bit may run memory forget phase 1.
- Owner without the bit, a non-owner id, a muted owner, and an admin-list user or role holder are refused.
