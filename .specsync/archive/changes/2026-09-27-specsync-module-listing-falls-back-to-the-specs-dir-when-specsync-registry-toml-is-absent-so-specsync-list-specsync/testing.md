---
change: specsync-module-listing-falls-back-to-the-specs-dir-when-specsync-registry-toml-is-absent-so-specsync-list-specsync
artifact: testing
---

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
