---
change: harden-memory-plugin-acl-memory-acl-1-4-safe-4-issue-59-follow-up-acting-discord-user-and-admin-come-only-from-bridge
artifact: testing
---

# Testing

- `tests/memory.plugins.test.ts`: danger markings; `--user`/`--admin`/`--db`
  (incl. `=` forms) refused on all four commands; no actor env ⇒ refused;
  store/recall scoped to env actor (other actor sees nothing); empty admin
  lists + `CORVIDINHO_ACTING_IS_ADMIN=1` ⇒ forget/override refused; self-forget
  non-admin refused opaquely; admin two-phase: phase 1 token (no content),
  same-turn confirm refused, new-turn confirm ok, replay refused; token for a
  different id refused; override content change between phases refused;
  deny-listed admin refused; role-admin needs roles configured + env bit;
  `--include-deleted` non-admin refused, admin ok.
- `tests/memory.confirm.test.ts`: malformed, tampered, expired, same-turn,
  binding mismatch (actor / id / updatedAt / content), secret persisted once.
- `tests/memory.spawn-env.test.ts`: Discord spawn overwrites acting env even
  when the parent env carries a stale actor; WATCH spawn clears it.
- `bun test`, `bunx tsc --noEmit`, `specsync check`,
  `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-plugins-010 | `tests/memory.plugins.test.ts` — four commands, markings, env actor store/recall |
| REQ-plugins-011 | `tests/memory.plugins.test.ts` + `tests/memory.confirm.test.ts` — argv refusal, handler-time ADMIN, two-phase token |
| REQ-discord-021 | `tests/memory.spawn-env.test.ts` + `tests/memory.store.test.ts` — spawn env overwrite; store ACL unchanged |
| REQ-watch-008 | `tests/memory.spawn-env.test.ts` — WATCH spawn clears acting env |
