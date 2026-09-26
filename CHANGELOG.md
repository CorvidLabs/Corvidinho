# Changelog

All notable Corvidinho releases. Release workflow prefers the section matching the tag.

## 0.0.3

### Ops

- **Tag → GitHub Release** Action (`.github/workflows/release.yml`): on push tags `v*`, create a verbose release; body from this CHANGELOG section when present, else generated notes; idempotent if the release already exists.
- **Safe box updater** (`scripts/corvidinho-update.sh`): fetch, record previous SHA, checkout tag/main, `bun install`, optional doctor, stop bridge via `/tmp/corvidinho-discord-bridge.pid`, start with env from secrets file pattern, wait for logged-in / protocol OK, else rollback + restart. Failures log only — never Discord panic posts.
- Operator doc: `docs/UPDATE.md`.

## 0.0.2

### Dogfood polish

- Shared `src/version.ts` from `package.json` for CLI + Discord `/status`.
- Richer ephemeral `/status`: uptime, protocol, channels, sessions/work, LLM model+host (no key) / demo stub, slash names, optional git tip.
- Stack also includes LLM plugin tool loop (#31) behind `CORVIDINHO_LLM_*`.
