---
id: specsync-module-listing-falls-back-to-the-specs-dir-when-specsync-registry-toml-is-absent-so-specsync-list-specsync
state: implementing
type: bug_fix
base_commit: fbaa84b7cda1bf2b462baea44cad20ef93e0df4f
---

# SpecSync module listing falls back to the specs dir when .specsync/registry.toml is absent, so specsync-list, specsync-read and the Planning spec briefing (with companions) work in a standard SpecSync project (SPECSYNC-1, SPECSYNC-5)

## Intent

SpecSync module listing falls back to the specs dir when .specsync/registry.toml is absent, so specsync-list, specsync-read and the Planning spec briefing (with companions) work in a standard SpecSync project (SPECSYNC-1, SPECSYNC-5)

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- With no .specsync/registry.toml in a project whose .specsync/ is a dir (the layout specsync init + specsync scaffold <name> leave), specsync-list and corvidinho specsync list return, sorted, each module with a specs/<name>/<name>.spec.md that specsync-read reads (plain module name, spec a file resolving inside the real specs/ dir); a listed name reads with specsync-read / specsync-brief, and the Planning spec briefing (loadRelevantSpecs) includes that module's constraint sections and its context.md / tasks.md companions (SPECSYNC-1, SPECSYNC-5). A registry.toml that exists stays the only source (one naming no module lists nothing). No .specsync/ dir, no specs/ dir, or a specs/ dir resolving outside the project lists nothing; a legacy flat specs/<name>.md, a dir without its spec, a spec that is a dir, a non-plain name, and a spec or module dir that links outside specs/ are not listed and never reach the briefing. No slash command, env var or config key is added; the SQLite schema is unchanged. Regression tests fail on main and pass on the branch; tsc, bun test, specsync check --require-coverage 100 and the verify lane are green.

## No-spec Rationale

Not applicable
