# Lesson bundle — specsync-read-and-specsync-brief-refuse-module-names-that-are-not-a-plain-module-name-and-never-read-a-file-whose-real

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Specsync-read and specsync-brief refuse module names that are not a plain module name and never read a file whose real path is outside the project specs dir; coverage, change-list and ship-status refuse --root
- **Kind**: BugFix
- **Specs**: plugins
- **Paths**: plugins/specsync/api.ts, plugins/specsync/commands.ts, tests/specsync.path-containment.test.ts
- **Acceptance**: specsync-read and specsync-brief accept only a plain module name (letters, digits, _ or -, the registry form; the optional name= prefix stays) and refuse with exit 1 and a clean one-line error, reading nothing, an absolute path, a .. segment, a path separator, a NUL byte or any other character. Every file they read (module spec, legacy flat spec, companions) must realpath inside the real project specs dir, which must itself realpath inside the project root, so a symlinked specs dir, module dir, spec file or companion that points outside the project is refused and its content is never returned (companions: the whole brief refuses). specsync-coverage, specsync-change-list and specsync-ship-status refuse a forwarded --root or --root=VALUE (exit 1, specsync not spawned) so they cannot report on another directory; specsync-list and specsync-check take no path input and are unchanged. Registered modules still read and brief as before. Regression tests for each vector (traversal, absolute, separator, NUL, symlink escape of spec, module dir, companion and specs dir, --root) fail on main and pass with the fix; tsc --noEmit and bun test green.

## Evidence

- Verification commit: `cf3aead0b9a7d2b513d753d147430a4e1242c5e8`
- Base commit: `642a843e0dee50df6cb9376f9e772dd28688ca2f`
- Verified by: `specsync check --spec plugins`

## From the change's context.md

# Context

An end-to-end check of `origin/main` (642a843) found that `specsync-read` and
`specsync-brief` — tier 0, `dangerous: false`, offered to the model in every
tool-tier catalog — read files outside the project:

- `echo X > $T/outside.md; bun src/cli.ts specsync read ../../../..$T/outside`
  printed `X` (through the legacy flat-spec fallback `specs/<name>.md`).
- `bun src/cli.ts specsync brief ../../../..$T` dumped every `*.md` in `$T`
  (companion scan of `specs/<name>/`).
- A mock-LLM `task run` whose model called `specsync-read` with such a name got
  the outside file back as the tool result.

Cause: `readModuleSpec` / `readCompanions` in `plugins/specsync/api.ts` join
the model-chosen module name onto `specs/` with no validation and no
containment check, and follow symlinks. `files-read` refuses the same path
("Path traversal denied"), so the SpecSync tools were a bypass of the file
tools' project clamp.

Captured HI: SPECSYNC-1 (`hi/specsync.md` — in a repo with `.specsync/` and
`specs/`, Corvidinho can list and read module specs), SPECSYNC-5 (companion
briefing files next to a spec), SPECSYNC-6 (local binary + project files are
enough; REQ-plugins-008 already says "project files only") and PLUGIN-1
(`hi/plugin.md` — SpecSync is available as typed plugin commands). Tools stay
inside the project. SAFE-2 (`hi/safe.md`) is about deleting or overwriting
protected infra, not reads, so it is not cited as the basis. No new criterion
was invented.

Checked every other SpecSync command for the same pattern:

- `specsync-list` reads the fixed `.specsync/registry.toml` and only emits
  names matching `[A-Za-z0-9_-]+`; no model path input. Unchanged.
- `specsync-check` spawns `fledge run spec-check` / `specsync check` with no
  forwarded args. Unchanged.
- `specsync-coverage`, `specsync-change-list`, `specsync-ship-status` forward
  model argv to the `specsync` binary. The binary's global `--root <ROOT>`
  points it at any directory: `specsync coverage --root <outside project>`
  listed the outside project's modules and files. Same pattern, fixed here.
  The binary already rejects a traversal change ID (`invalid change ID`) and
  does not infer abbreviated long flags (`--roo` is an error).

## From the change's design.md

# Design

- **Name check.** `MODULE_NAME_RE = /^[A-Za-z0-9_-]+$/` — the same form
  `listRegisteredModules` parses from `.specsync/registry.toml`. It rules out
  absolute paths, `.`/`..`, `/` and `\`, NUL and anything else in one test.
  `invalidModuleName(name)` returns a one-line error with the name
  `JSON.stringify`-escaped (so a NUL shows as `\u0000`) and truncated at 80
  chars. `readModuleSpec` / `readCompanions` check it before touching disk.
- **Containment.** `realSpecsDir(cwd)` realpaths the project root and its
  `specs/`, and refuses when `specs/` resolves outside the root.
  `containedSpecFile` realpaths each candidate and requires it inside the real
  specs dir (`isInsideRoot`); the file is then read from its real path, so what
  was checked is what is read. Missing entries and non-files stay "missing"
  (not-found behaviour unchanged); an escape is an error naming only the
  in-project path, never the outside target.
- **Brief fails closed.** `readCompanions` realpaths the module dir and each
  companion (fixed list and extra `*.md`); any escape returns `error` with no
  files. `readModuleSpec` marks refusals `refused: true` so `specsync-brief`
  can fail on them instead of falling back to "no spec or companions found".
- **Spawned tools.** `refuseRootArg(args)` rejects `--root` and `--root=…`;
  `specsync-coverage`, `specsync-change-list` and `specsync-ship-status` call
  it before `spawnSpecsync`.
- Exit code 1 matches the existing "path escapes project cwd / symlink escape"
  row for file tools. No new command, flag, env var, tier or package version.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-008` (name validation) | `tests/specsync.path-containment.test.ts` | `invalidModuleName` passes `agent`, `cli`, `plugins`, `my-mod_2`, `A1`; refuses `""`, `.`, `..`, `../x`, `../../../../tmp/x`, `/etc/passwd`, `a/b`, `a\b`, `good/../good`, `good\0`, `good.md`, ` good`, `~`; a NUL shows as `\u0000`, never raw. |
| `REQ-plugins-008` (read traversal / absolute / separator / NUL) | `tests/specsync.path-containment.test.ts` | `specsync-read` with a relative traversal to an outside flat `.md` (plain and `name=` form), the reported `../../../../../../..<abs>/outside` repro, an absolute path, `good/../good`, `a\b`, `good\0` and `..` all fail exit 1 with `invalid spec module name`; the outside secret never appears in the result. |
| `REQ-plugins-008` (read symlink escape) | `tests/specsync.path-containment.test.ts` | `specs/evil/evil.spec.md` → outside file, `specs/outside` → outside dir, `specs/flat.md` → outside file, and a project whose `specs/` → outside dir all refuse (exit 1, `outside the project specs dir` / `specs dir resolves outside`); no outside content. |
| `REQ-plugins-008` (brief traversal / symlink escape) | `tests/specsync.path-containment.test.ts` | `specsync-brief` with a relative traversal dir, the `../../../../../../..<abs>` repro and an absolute dir refuse; a symlinked module dir, a fixed companion (`tasks.md`) and an extra `*.md` companion (`notes.md`) pointing outside each refuse the whole brief; `readCompanions` returns `error` and no files, `readModuleSpec` marks `refused: true`. |
| `REQ-plugins-008` (no regression) | `tests/specsync.path-containment.test.ts`, `tests/specsync.plugins.test.ts` | Registered modules read (`good`, `name=good`) and brief with companions; symlinks that stay inside `specs/` (`alias` dir, `linked.spec.md`) still read/brief; a missing module still says `spec 'nope' not found`; the existing `specsync list/read cli/brief agent` CLI tests pass. |
| `REQ-plugins-008` (`--root`) | `tests/specsync.path-containment.test.ts` | `refuseRootArg` catches `--root X` and `--root=X`, passes `--format json` and a change id; `specsync-coverage`, `specsync-change-list` and `specsync-ship-status` with `--root <outside>`, `--root=<outside>` and `--json --root <outside>` fail exit 1 with the refusal message (specsync not spawned). |
| `REQ-plugins-008` (Planning briefing) | `tests/specsync.path-containment.test.ts` | `loadRelevantSpecs` still briefs a registered module (`good` spec + `context.md`); a registered module whose spec (`specs/evil/evil.spec.md`) or module dir (`specs/outside`) links outside yields an empty briefing, and a companion (`specs/good/tasks.md`) linking outside never appears in it; no outside content. |
| `REQ-plugins-008` (CLI + tool loop repro) | `tests/specsync.path-containment.test.ts` | `bun src/cli.ts specsync read ../../../../../../..<outside>/outside` exits 1 with `invalid spec module name` and no secret; a mock-LLM `createTaskExecute` run whose model calls `specsync-read` with a traversal name sends the refusal (not the outside file) back to the model. |

## Automated coverage

- Regression proof: with `origin/main`'s `plugins/specsync/{api,commands}.ts`
  swapped in (helpers stubbed so the file links), the new test file fails 22 of
  27 — every escape vector, including the 3 Planning-briefing leaks — and only
  the 5 no-regression cases pass; with the fix all 27 pass. Restored after.
- `bun test tests/specsync.path-containment.test.ts tests/specsync.plugins.test.ts` — 28 passed, 0 failed.
- `bunx tsc --noEmit` — passed.
- `bun test` — 1337 passed, 1 optional live test skipped, 0 failed.
- `specsync change check --commit`, `specsync change audit`, `specsync check --require-coverage 100` — green.
- `fledge lanes run verify --non-interactive` — green (includes local `spec-check`).
- Manual re-run of the reported repro on the fix: `specsync read ../../../..$T/outside` and `specsync brief ../../../..$T` exit 1 with the refusal; `specsync coverage --root <outside project>` exits 1 with the refusal; `specsync read cli`, `specsync brief agent`, `specsync coverage` and `specsync change-list` still work.

## Where these lessons go

- `specs/plugins/context.md`
