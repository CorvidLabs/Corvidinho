---
change: specsync-module-listing-falls-back-to-the-specs-dir-when-specsync-registry-toml-is-absent-so-specsync-list-specsync
artifact: context
---

# Context

Captured HI (`hi/specsync.md`):

- **SPECSYNC-1** "In a repo that already has `.specsync/` and `specs/`,
  Corvidinho can list and read module specs before it edits code."
- **SPECSYNC-5** "Companion briefing files next to a spec are something it
  actually reads when starting work on that module."

Gap on `origin/main` (fbaa84b): `listRegisteredModules` in
`plugins/specsync/api.ts` returned `[]` whenever
`.specsync/registry.toml` was missing. SpecSync itself does not write that
file for a normal project: with specsync 6.0.0,
`git init; specsync init; specsync scaffold billing` leaves
`.specsync/{config.toml,sdd.json,version}` and
`specs/billing/{billing.spec.md,context.md,requirements.md,tasks.md,testing.md}`
and no `registry.toml`. In that project on main:

- `corvidinho specsync list` printed `0 spec(s) registered` /
  `(no specs registered)`, so the model's `specsync-list` ("call first when
  you don't know the module name") found nothing to read.
- `corvidinho task run --task "change the billing module" --no-verify --json`
  planned with `Planning: no SpecSync modules matched task tokens (or registry
  empty).`: `loadRelevantSpecs` (`src/agent/specLoader.ts`) lists through
  the same helper, so no spec constraints and no companions reached the model
  (SPECSYNC-5).
- `specsync-read billing` / `specsync-brief billing` did work when the
  name was already known; only the listing was empty.

Corvidinho's own repo keeps a hand-maintained `registry.toml` (and a
mirrored `[specs]` table in `config.toml`), which is why this did not show
up here.

Constraints: HI-first (no AC beyond SPECSYNC-1/5), no slash command, no env
var or config key, no SQLite schema bump, no package bump. The SpecSync tools
must stay inside the project (REQ-plugins-008 containment), so the fallback
must not list anything `specsync-read` would refuse. Open PRs #232 / #233
(ask-button gating, SAFE-3 clamp) and #246 (SAFE-2 `.specsync/` write
protection) are separate work and are not touched.
