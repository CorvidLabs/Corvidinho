# STATUS — Corvidinho

**As of:** 2026-09-26 (America/Denver)

| Item | State |
|------|--------|
| Repo | Bootstrap / HI capture |
| Default product | Linux-first Bun/TS agent runner (CLI stub) |
| HI | Captured under `hi/` (9 families) — see `hi check` |
| Fledge | `fledge.toml` with `smoke` + `verify` (includes `spec-check` note/task) |
| SpecSync | Minimal `.specsync/` + `specs/cli/` draft stub; SDD change workflow **ON** (require_change) |
| Trust / Augur / Attest | **Not** wired — do not re-add Trust thrash on this bootstrap |
| Merge policy | Merge when verify + SpecSync change cycle are green (Leif/CoS standing order) |

## Not inventing

ACCESS, bounty, MainNet product surfaces. No on-chain identity in v1.

## Next (for Corvidinho bot / follow-on PRs)

- Land issue #6 plugin host (dangerous/min_tier) — this PR; GH read extras if small
- Flesh agent loop beyond plugins CLI
- Wire Discord behind HI criteria (later)
- Turn draft specs active when behavior stabilizes
- Keep secrets out of repo; keep verify lane honest

## Verify locally

```bash
hi check
bun test
bun src/cli.ts --help
fledge lanes run verify --non-interactive
```
