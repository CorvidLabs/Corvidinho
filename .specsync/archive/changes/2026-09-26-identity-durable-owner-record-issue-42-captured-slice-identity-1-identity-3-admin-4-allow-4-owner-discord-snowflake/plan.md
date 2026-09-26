---
change: identity-durable-owner-record-issue-42-captured-slice-identity-1-identity-3-admin-4-allow-4-owner-discord-snowflake
artifact: plan
---

# Plan

1. `src/identity/owner.ts` + barrel; add both to `specs/discord/discord.spec.md` files.
2. Wire `BridgeConfig.owner` (config), `SlashContext.owner` (bridge), and
   `owner` into every `resolvePermissionLevel` call.
3. `/status` owner line; `corvidinho doctor` owner line.
4. Docs: `allowlist.example.toml` `[owner]`, `.env.example`,
   `docs/DISCORD-GO-LIVE.md`, `docs/discord.md`, go-live checklist.
5. Fixture tests: `tests/identity.owner.test.ts`, `tests/discord.owner.test.ts`.
6. Delta REQ-discord-042; `specsync check --require-coverage 100`; fledge verify; PR.
