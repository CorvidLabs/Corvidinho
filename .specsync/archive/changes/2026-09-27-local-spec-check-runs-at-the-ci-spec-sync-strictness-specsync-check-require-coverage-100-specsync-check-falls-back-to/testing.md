---
change: local-spec-check-runs-at-the-ci-spec-sync-strictness-specsync-check-require-coverage-100-specsync-check-falls-back-to
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-005` (CI strictness parity) | `tests/specsync.check-parity.test.ts` "fledge.toml spec-check carries the CI Spec Sync strictness (SPECSYNC-2)" | Parses `spec-sync.yml` (`Bun.YAML`) and `fledge.toml` (`Bun.TOML`): the spec-check cmd is `specsync check` with `--require-coverage` equal to the Action's `require-coverage` (`100`), `--strict` present iff `strict` is true (it is `false`), and the Action has no input the check does not know. Fails on main (`specsync check` has no `--require-coverage`). |
| `REQ-agent-005` (lane) | same file, "spec-check stays on the verify lane"; `tests/agent.loop.test.ts` "fledge.toml verify lane includes spec-check", "defaultVerifyRunner argv shape" | `[lanes.verify]` still includes `spec-check`; runner argv unchanged. |
| `REQ-agent-005` (unspecced file fails the lane) | same file, "real fledge + specsync (optional) › an unspecced source file fails the project's spec-check task" | Copies `.specsync`, `specs`, `src`, `plugins`, `fledge.toml` to a temp dir: `fledge run spec-check` exits 0; after adding `src/zzz/orphan.ts` it exits non-zero naming the file. Runs where both binaries are on PATH (this box, the verify lane); skipped on CI, which installs neither. Fails on main (plain `specsync check` exits 0 with the orphan). |
| `REQ-plugins-008` (check fallback) | same file, "specsync-check falls back to specsync check when Fledge has no spec-check task" / "… when the project has no fledge.toml" | Stub `fledge` (exit 1 `Unknown task 'spec-check'` / `no fledge.toml found`, like fledge 1.8) and stub `specsync` on PATH; `corvidinho specsync check [--json]` exits 0, `ok:true`, and only `specsync check` was called. Both fail on main (fledge called, exit 1). |
| `REQ-plugins-008` (Fledge path kept) | same file, "specsync-check still runs the project's Fledge spec-check task when defined", "a failing Fledge spec-check task fails specsync-check (blocks done)" | With `[tasks.spec-check]` (or `[tasks] "spec-check" = …`) only `fledge run spec-check` is called; a failing task exits 1 with `spec check failed`. Guards; pass on main and branch. |
| `REQ-plugins-008` (fail closed) | same file, "an unparsable fledge.toml keeps the Fledge path (fail closed)" | `projectDefinesSpecCheckTask`: unparsable file → true; no task (a comment naming it does not count) → false; no file → false; this repo → true. |
| `REQ-plugins-008` / `REQ-cli-089` (score) | same file, "specsync-score spawns local specsync score and returns its report", "a failing specsync score returns its exit code and report" | `corvidinho specsync score good --explain` calls `specsync score good --explain` and prints the report; `plugins run specsync-score --json -- --format json` returns `data.output` with it; `--min-score 90` (stub exit 3) exits 3 with the report on stderr. Fail on main (usage error / unknown plugin). |
| `REQ-plugins-008` (catalog) | same file, "specsync-score is a read-only tool offered in the default tool catalog" | `buildOpenAiTools({tier:"tool"})` (no dangerous tools) contains `specsync-score`. Fails on main. |
| `REQ-plugins-008` (list) | `tests/specsync.plugins.test.ts` "plugins list includes specsync-*" | Now also expects `specsync-score`. Fails on main. |
| `REQ-plugins-008` (`--root`) | `tests/specsync.path-containment.test.ts` "specsync-score refuses --root before spawning specsync" | `--root X`, `--root=X`, `--json --root X` → exit 1 with the refusal. Fails on main (unknown plugin). |

## Automated coverage

- Regression proof: with `origin/main`'s `fledge.toml`,
  `plugins/specsync/api.ts` (plus a proof stub `projectDefinesSpecCheckTask`
  returning true, which is main's behaviour: always the Fledge path when fledge
  is on PATH), `plugins/specsync/commands.ts` and `src/cli.ts` swapped in,
  `bun test tests/specsync.check-parity.test.ts tests/specsync.plugins.test.ts
  tests/specsync.path-containment.test.ts` → 34 pass, 10 fail (all 8 new
  behaviour cases in the parity file, the list test and the `specsync-score`
  `--root` test). With the branch sources restored: 44 pass, 0 fail.
- `bun test` — 1716 pass, 2 skip, 0 fail.
- `bunx tsc --noEmit` — passed.
- `specsync check --require-coverage 100` — 5 specs passed, 161/161 files.
- `specsync change check --commit`, `specsync change audit` and
  `fledge lanes run verify --non-interactive` — see the PR body.
- Manual: `bun src/cli.ts specsync score` on this repo prints
  `5 specs scored: average …/100`; `bun src/cli.ts specsync check` still
  passes; on a copy with `src/zzz/orphan.ts`, `fledge run spec-check` and
  `bun src/cli.ts specsync check` now exit 1 naming the orphan.
