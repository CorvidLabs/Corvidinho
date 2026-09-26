# Lesson bundle — cover-hear-5-go-live-docs-discord-go-live-env-allowlist-templates-and-bun-lock-from-discord-js

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Cover HEAR #5 go-live docs (DISCORD-GO-LIVE), env/allowlist templates, and bun.lock from discord.js
- **Kind**: Documentation
- **Paths**: bun.lock, docs/DISCORD-GO-LIVE.md, allowlist.example.toml, .env.example, docs/
- **Acceptance**: docs/DISCORD-GO-LIVE.md Developer Portal+VM checklist; .env.example + allowlist.example.toml (empty=deny-all); bun.lock includes discord.js; READY-FOR-SECRETS documented in STATUS; no secret values in repo

## Evidence

- Verification commit: `01cb0134f397dff0178b7422b975437ce200e4ce`
- Base commit: `8609cc16f73198c35f4a17c4d8a775900561ff77`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

Companion cover for HEAR #5 primary change. SpecSync audit required bun.lock + docs/DISCORD-GO-LIVE.md under an active change. Also covers allowlist.example.toml and .env.example templates (no secrets).

## From the change's design.md

# Design

No code design — documentation/templates/lockfile coverage only. Primary HEAR behavior lives in the sibling feature change.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
