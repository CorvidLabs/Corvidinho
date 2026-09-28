---
change: docs-operator-guide-for-shipped-go-live-knobs-in-discord-go-live-md-owner-only-admin-protocol-2-restart-together-safe-1
artifact: docs
---

# Docs

## Changed files

- `docs/DISCORD-GO-LIVE.md`: new section E "Operator guide (shipped knobs)".
  - E.1 owner = the only ADMIN (IDENTITY-1..3, ADMIN-4): env vs `[owner]`, snowflake rule,
    muted/deny-listed owner, ignored `CORVIDINHO_DISCORD_ADMIN_USERS` / `_ROLES`, what is
    owner-only, owner ping when no owner is set.
  - E.2 protocol 2 restart-together (DISCORD-10): bridge and daemon start probe, WATCH frame
    mismatch notice, restart bridge + `github watch` + `corvidinho daemon` together.
  - E.3 SAFE-1 `CORVIDINHO_ALLOWLIST`: which runs are non-interactive, where to set it, a table
    of every dangerous tool with dangerous/minTier/mutating from the registry, the mutating
    non-dangerous tools, and what an entry unlocks today.
  - E.4 `corvidinho daemon` under systemd (CLI-8, AUTONOMOUS-4), pointing to `docs/DAEMON.md`.
  - E.5 AUTONOMOUS-1 gate in the project's `fledge.toml` and what it unlocks (`delegate`).
  - E.6 ROLES-CHAT for non-owner users (catalog, run-time refusal, ROLES-CHAT-8 public Q&A).
  - E.7 where the audit chain, WATCH spawn JSONL, daemon, bridge and run history live.
  - Sections B to D gain `CORVIDINHO_ALLOWLIST`, `CORVIDINHO_AUDIT_HMAC_KEY`, the LLM env, a
    doctor caveat, and a table of the long-running processes.
- `docs/BOX-UPDATE.md`: doctor runs before the env file is sourced; the three restart modes
  (pidfile default, systemd unit, command) with all their env knobs; the script restarts only
  the bridge; schema v7 and owner-only memory forget/override; the full `/status` line list;
  the nine slash command names.
- `.env.example`: "six commands" is now "nine commands"; commented `CORVIDINHO_ALLOWLIST` and
  `CORVIDINHO_AUDIT_HMAC_KEY` template lines.

## Verification

- Registry flags: throwaway script over `loadBuiltins()` + `loadFledgePlugins()`.
- Names and literals: throwaway script (51 env names, 26 literals; none missing).
- `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test`,
  `fledge lanes run verify --non-interactive`.
