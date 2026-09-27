---
change: specsync-read-and-specsync-brief-refuse-module-names-that-are-not-a-plain-module-name-and-never-read-a-file-whose-real
artifact: testing
---

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
