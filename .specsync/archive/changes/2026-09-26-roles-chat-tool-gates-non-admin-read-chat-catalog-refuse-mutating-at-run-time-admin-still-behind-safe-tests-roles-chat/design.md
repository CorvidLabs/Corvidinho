---
change: roles-chat-tool-gates-non-admin-read-chat-catalog-refuse-mutating-at-run-time-admin-still-behind-safe-tests-roles-chat
artifact: design
---

# Design

- Add `mutating?: boolean` on PluginCommand; `isMutatingPlugin` = dangerous OR mutating flag.
- Mark `files-write` / `files-edit` as `mutating: true` (keep dangerous:false so SAFE-1 allowlist is not required for ADMIN file edits).
- Role session when `CORVIDINHO_ACTING_IS_ADMIN` is set (bridge always sets 0|1). Unset ⇒ local CLI, no role gate.
- Shared `resolveActingIsAdmin(env)` reuses owner re-check (IDENTITY-2); memory `actingIsAdmin` calls it.
- `buildOpenAiTools`: when role session && !admin ⇒ omit mutating.
- `runPlugin`: when role session && !admin && mutating ⇒ refuse exit 2 with role message (before SAFE-1).
- ADMIN + dangerous still SAFE-1 (non-interactive need allowlist).
