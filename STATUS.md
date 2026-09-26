# STATUS — Corvidinho

**As of:** 2026-09-26 (America/Denver)

| Item | State |
|------|--------|
| Repo | Bootstrap / HI capture |
| Default product | Linux-first Bun/TS agent runner (CLI stub) |
| HI | Captured under `hi/` (9 families) — see `hi check` |
| Fledge | `fledge.toml` with `smoke` + `verify` (includes `spec-check` note/task) |
| SpecSync | Minimal `.specsync/` + `specs/cli/` draft stub; change workflow **off** |
| Trust / Augur / Attest | **Not** wired — do not re-add Trust thrash on this bootstrap |
| Merge policy | Agents never merge unless Leif explicitly asks |

## Not inventing

ACCESS, bounty, MainNet product surfaces. No on-chain identity in v1.

## Next (for Corvidinho bot / follow-on PRs)

- Flesh CLI beyond `help` / `doctor` / `version`
- Wire Discord + GitHub plugins behind HI criteria
- Turn draft `specs/cli` active when behavior stabilizes
- Keep secrets out of repo; keep verify lane honest

## Verify locally

```bash
hi check
bun test
bun src/cli.ts --help
fledge lanes run verify --non-interactive
```
