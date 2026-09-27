# Lesson bundle — specsync-module-listing-falls-back-to-the-specs-dir-when-specsync-registry-toml-is-absent-so-specsync-list-specsync

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: SpecSync module listing falls back to the specs dir when .specsync/registry.toml is absent, so specsync-list, specsync-read and the Planning spec briefing (with companions) work in a standard SpecSync project (SPECSYNC-1, SPECSYNC-5)
- **Kind**: BugFix
- **Specs**: plugins
- **Paths**: plugins/specsync/api.ts, plugins/specsync/commands.ts, tests/specsync.registry-fallback.test.ts, specs/plugins/plugins.spec.md, specs/plugins/requirements.md, specs/agent/agent.spec.md
- **Acceptance**: With no .specsync/registry.toml in a project whose .specsync/ is a dir (the layout specsync init + specsync scaffold <name> leave), specsync-list and corvidinho specsync list return, sorted, each module with a specs/<name>/<name>.spec.md that specsync-read reads (plain module name, spec a file resolving inside the real specs/ dir); a listed name reads with specsync-read / specsync-brief, and the Planning spec briefing (loadRelevantSpecs) includes that module's constraint sections and its context.md / tasks.md companions (SPECSYNC-1, SPECSYNC-5). A registry.toml that exists adds its [specs] names to those specs/ modules (sorted, each once), so a module scaffolded after specsync init-registry, which the registry does not name, is still listed and briefed. No .specsync/ dir, no specs/ dir, or a specs/ dir resolving outside the project lists nothing from specs/; a legacy flat specs/<name>.md, a dir without its spec, a spec that is a dir, a non-plain name, and a spec or module dir that links outside specs/ are not listed from specs/ and never reach the briefing. No slash command, env var or config key is added; the SQLite schema is unchanged. Regression tests fail on main and pass on the branch; tsc, bun test, specsync check --require-coverage 100 and the verify lane are green.

## Evidence

- Verification commit: `0c37952c9a6a9bb1317e924bde8cee815a24454c`
- Base commit: `fbaa84b7cda1bf2b462baea44cad20ef93e0df4f`
- Verified by: `specsync check --spec plugins`

## From the change's context.md

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

## From the change's design.md

# Design

- `plugins/specsync/api.ts`: `listRegisteredModules(cwd)` lists the union
  of the new private `listSpecsDirModules(cwd)` and, when
  `.specsync/registry.toml` exists, its `[specs]` names (sorted, each once).
  The registry is not the only source because SpecSync does not keep it in
  step with `specs/` (`specsync scaffold` does not add to the file
  `specsync init-registry` wrote). This repo's registry names exactly its five
  `specs/<name>/<name>.spec.md` modules, so its listing is unchanged.
  `listSpecsDirModules(cwd)`:
  - requires `<cwd>/.specsync` to be a directory (SPECSYNC-1 scopes this to
    "a repo that already has `.specsync/` and `specs/`"); otherwise `[]`;
  - resolves the specs dir with the existing `realSpecsDir` (must realpath
    inside the project root); missing or escaping → `[]`;
  - lists entries of the real specs dir whose name passes `MODULE_NAME_RE`
    and whose `<name>/<name>.spec.md` passes the existing
    `containedSpecFile` (a file resolving inside the real specs dir);
  - sorts like the registry path.
  No new export, error type or output shape: `specsync-list` still returns
  `{ count, modules }` and `N spec(s) registered`. A registry name with no
  spec on disk is still listed, as before.
- `plugins/specsync/commands.ts`: the `specsync-list` tool description
  says the list is the `specs/` modules plus the registry names.
- Not done (conservative choices, listed in the PR as pending Leif):
  - `specs_dir` from `.specsync/config.toml` is not honoured; the fallback
    lists the fixed `specs/` dir because `specsync-read` / `specsync-brief`
    only read there. Honouring it would change read/brief too.
  - Legacy flat `specs/<name>.md` files are not listed (read still accepts
    them with its warning); only the canonical module-dir layout is.
  - `config.toml` `[specs]` is not read as a second registry.
  - No marker in the output saying the names came from `specs/`.
- Security: the fallback enumerates only the project's own real `specs/`
  dir; a module dir or spec symlinked outside is skipped, so no outside name or
  content is listed or briefed. It spawns nothing and reads no file contents.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-008` (list, SPECSYNC-1) | `tests/specsync.registry-fallback.test.ts` "listRegisteredModules lists specs/<name>/<name>.spec.md modules, sorted", "specsync-list returns the specs-dir modules" | Temp project with the `specsync init` + `scaffold` layout and no `registry.toml`: `listRegisteredModules` → `["auth","billing"]`; `runPlugin("specsync-list")` → `{count:1, modules:["billing"]}`. Fail on main (`[]`). |
| `REQ-plugins-008` (CLI) | same file, "`corvidinho specsync list` in a registry-less SpecSync project prints the module" | Spawns `bun src/cli.ts specsync list` with cwd = the temp project: exit 0, `1 spec(s) registered`, `billing`. Fails on main (`0 spec(s) registered`). |
| `REQ-plugins-008` (read / brief by listed name, SPECSYNC-1/5) | same file, "a listed module reads and briefs with its companions (SPECSYNC-5)" | The name from `listRegisteredModules` reads with `specsync-read` and briefs with `specsync-brief` (companion text present). Fails on main (nothing listed). |
| `REQ-plugins-008` (Planning briefing, SPECSYNC-5) | same file, "the Planning spec briefing loads the module and its companions" | `loadRelevantSpecs({task:"change the billing module"})` contains `# Spec: billing`, its Purpose text and `# Companion: billing/context.md` / `tasks.md`. Fails on main (`""`). |
| `REQ-plugins-008` (real SpecSync layout) | same file, "real specsync init + scaffold (no registry.toml) lists and briefs the module" | Runs the real `specsync init` + `scaffold billing` in a temp git repo (skipped when `specsync` is not on PATH, e.g. CI): no `registry.toml`, `billing` listed and briefed. Fails on main. |
| `REQ-plugins-008` (registry adds names) | same file, "a stale registry naming only some modules still lists every specs/ module", "a registry with no [specs] entries still lists the specs/ modules", "registry names are kept (even without a spec on disk), once each, sorted", "real specsync: a module scaffolded after init-registry is listed and briefs" | With a `registry.toml` naming only `auth`, `["auth","billing"]` is listed and a billing task briefs `# Spec: billing` with its companion; an entry-less registry lists `["billing"]`; a registry name with no spec stays listed, once. The real binary run (`init`, `scaffold billing`, `init-registry`, `scaffold auth`) leaves a registry naming only `billing`, and `auth` is still listed and briefed. The stale and entry-less cases and the real-binary case fail on main and on the first draft (registry-only); the kept-names case is a guard. |
| `REQ-plugins-008` (only what read reads) | same file, "skips flat specs, dirs without a spec, a spec that is a dir, and non-module names", "a symlinked spec or module dir that stays inside specs/ is listed" | Flat `specs/legacy.md`, `specs/empty/`, a dir named `dirspec.spec.md`, `bad.name`, `other/wrong.spec.md` and `README.md` are not listed; in-`specs/` symlinks (`alias`, `mirror`) are. Fail on main (nothing listed). |
| `REQ-plugins-008` (containment) | same file, "a spec or module dir that links outside specs/ is not listed and never briefs", "a specs dir that resolves outside the project lists nothing", "not a SpecSync project (no .specsync/ dir)…", "no specs dir: nothing listed" | Symlinked-out module dir / spec is skipped (only `billing` listed, no outside text in the `specsync-list` result, empty briefing); a `specs` symlink out of the project, no `.specsync/` dir (or a `.specsync` file) and no `specs/` dir list nothing. The first fails on main (`billing` not listed); the rest are guards. |

## Automated coverage

- Regression proof: with `origin/main`'s `plugins/specsync/api.ts` and
  `plugins/specsync/commands.ts` swapped in,
  `bun test tests/specsync.registry-fallback.test.ts` → 4 pass, 12 fail (every
  new behaviour case, including both real-binary ones). With the first
  draft's registry-only sources (b1c6961) swapped in: 13 pass, 3 fail (the
  stale-registry cases). With the branch sources restored: 16 pass, 0 fail.
- `bun test` — 1855 pass, 2 skip, 0 fail (145 files).
- `bunx tsc --noEmit` — passed.
- `specsync check --require-coverage 100` — 5 specs passed, 166/166 files.
- `specsync change check --commit`, `specsync change audit` and
  `fledge lanes run verify --non-interactive` — see the PR body.
- Manual: in a scratch `git init; specsync init; specsync scaffold billing`
  project, `bun <branch>/src/cli.ts specsync list` prints
  `1 spec(s) registered` / `billing` (main: `0 spec(s) registered`), and
  `task run --task "change the billing module" --no-verify --json` plans with
  `Planning: SpecSync briefing` + `# Spec: billing` +
  `# Companion: billing/context.md` (main: `no SpecSync modules matched`).
  After `specsync init-registry` + `specsync scaffold auth` in that project
  (registry naming only `billing`), `specsync list` prints `2 spec(s)
  registered` / `auth` / `billing` and a task on the auth module briefs
  `# Spec: auth` with `auth/context.md` and `auth/tasks.md` (first draft:
  `1 spec(s) registered`, `no SpecSync modules matched`). This repo's
  `specsync list` is unchanged (5 modules).
  Existing `tests/specsync.plugins.test.ts`,
  `tests/specsync.path-containment.test.ts` and `tests/specLoader.test.ts`
  (this repo, which has a registry) pass unchanged.

## Where these lessons go

- `specs/plugins/context.md`
