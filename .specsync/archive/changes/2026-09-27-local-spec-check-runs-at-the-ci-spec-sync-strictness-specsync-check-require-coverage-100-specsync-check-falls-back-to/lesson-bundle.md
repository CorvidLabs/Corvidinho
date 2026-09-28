# Lesson bundle — local-spec-check-runs-at-the-ci-spec-sync-strictness-specsync-check-require-coverage-100-specsync-check-falls-back-to

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Local spec-check runs at the CI Spec Sync strictness (specsync check --require-coverage 100), specsync-check falls back to specsync check when the project defines no Fledge spec-check task, and a read-only specsync-score tool reports SpecSync spec scores (SPECSYNC-2/3, issue 89)
- **Kind**: Feature
- **Specs**: plugins, cli, agent
- **Paths**: fledge.toml, plugins/specsync/api.ts, plugins/specsync/commands.ts, src/cli.ts, tests/specsync.check-parity.test.ts, tests/specsync.plugins.test.ts, tests/specsync.path-containment.test.ts, README.md, STATUS.md
- **Acceptance**: The fledge.toml spec-check task (on the verify lane) runs specsync check with the same strictness as the CI Spec Sync Action in .github/workflows/spec-sync.yml: --require-coverage matching its require-coverage input (100) and --strict only when the Action sets strict (it does not), so a tree with an unspecced source file fails the local verify lane (verified=false) exactly as CI Spec Sync fails it; a parity test fails if fledge.toml and spec-sync.yml drift apart. specsync-check uses fledge run spec-check only when fledge is on PATH and the project fledge.toml defines a spec-check task (an unreadable or unparsable fledge.toml keeps the Fledge path, fail closed); otherwise it runs the local specsync check under the project's own .specsync config instead of failing with Unknown task spec-check. A new read-only specsync-score plugin (minTier 0, not dangerous, no API key) runs the local specsync score with the forwarded args (module filters, --explain, --format json) and returns its report; it refuses --root before spawning like specsync-coverage; corvidinho specsync score maps to it. No slash command, env var or config key is added. Regression tests fail on main and pass on the branch; tsc, bun test, specsync check --require-coverage 100 and the verify lane are green.

## Evidence

- Verification commit: `6abcbdbf58d76f34afde31055a1d5d29d5294700`
- Base commit: `fc0ed8da6e47dc1db452ee51044cde096db4e8bc`
- Verified by: `specsync check --spec agent --spec cli --spec plugins`

## From the change's context.md

# Context

Issue #89 asked for SpecSync to be a first-class part of the agent's done
gate. Against the captured HI in `hi/specsync.md`, SPECSYNC-4 is already met
and SPECSYNC-2 / SPECSYNC-3 are partial on `origin/main` (fc0ed8d):

- **SPECSYNC-2** ("run SpecSync's check (including the strictness we use in
  CI) and treat failures as real blockers for done"). Failures already block
  done: `spec-check` is on `[lanes.verify]`, a failed lane gives
  verified=false, and no PR is opened. The strictness did not match, though.
  `.github/workflows/spec-sync.yml` runs `CorvidLabs/spec-sync@v6` with
  `strict: false` and `require-coverage: "100"`, while the local
  `[tasks.spec-check]` was plain `specsync check`. Repro on a copy of main:
  add `src/zzz/orphan.ts` (`export const orphan = 1;`). Then
  `bun src/cli.ts specsync check` and `fledge run spec-check` exit 0, but
  `specsync check --require-coverage 100` exits 1 (`actual coverage is 99%
  (1 file(s) missing specs) ✗ src/zzz/orphan.ts`). The verify lane gave
  verified=true on a tree CI Spec Sync rejects.
  Also, `runSpecCheck` ran `fledge run spec-check` whenever fledge was on
  PATH. In a project with `.specsync/` + `specs/` but no Fledge
  `spec-check` task, `specsync-check` failed with `Unknown task
  'spec-check'` (or `no fledge.toml found`), which breaks REQ-plugins-008's
  "fledge task or `specsync check` fallback".
- **SPECSYNC-3** ("Coverage and score reports are available when I ask").
  Coverage is available (`specsync-coverage`). There was no score report:
  `corvidinho specsync score` printed the usage error,
  `plugins run specsync-score` gave `Unknown plugin command`, and the
  only way to run `specsync score` was `shell-exec` (dangerous, code tier,
  out of the tool-tier catalog, denied non-interactive unless allowlisted).

Constraints: HI-first (no new AC beyond SPECSYNC-2/3), no slash command, no
env var or config key, no schema bump, no package bump. SpecSync has no config
key or env var for `require_coverage` (checked: adding `require_coverage =
100` to `.specsync/config.toml` or `SPECSYNC_REQUIRE_COVERAGE=100` leaves
plain `specsync check` at exit 0), so the strictness has to be on the task's
argv. The Action's `action.yml` is not readable from this session; the
mapping `require-coverage` → `--require-coverage` and `strict` →
`--strict` is inferred from the matching specsync 6.0.0 CLI flags.

## From the change's design.md

# Design

- `fledge.toml`: `[tasks.spec-check] cmd = "specsync check --require-coverage 100"`
  with a comment tying it to `spec-sync.yml`. `strict: false` in the Action
  means no `--strict`. The verify lane (`lint`, `smoke`, `test`,
  `spec-check`) and `defaultVerifyRunner` argv are unchanged, so a
  spec-check failure keeps today's retry → verified=false path.
- `plugins/specsync/api.ts`: new `projectDefinesSpecCheckTask(cwd)` reads
  `<cwd>/fledge.toml` (fledge itself only reads the cwd file; checked with
  fledge 1.8.0, no parent search) with `Bun.TOML.parse` and looks for
  `tasks["spec-check"]` (both `[tasks.spec-check]` and
  `[tasks] "spec-check" = …` forms). No file or no task → false. Read or
  parse error → true, which keeps today's Fledge path, so a broken
  `fledge.toml` fails loudly instead of quietly running a laxer check.
  `runSpecCheck` uses `fledge run spec-check` only when fledge is on PATH
  **and** that returns true; otherwise the local `specsync check` (the
  project's own `.specsync` config decides its rules; no CI flags guessed
  for other repos).
- `plugins/specsync/commands.ts`: new `specsync-score` next to
  `specsync-coverage`, same shape: `minTier: 0`, `dangerous: false`,
  `refuseRootArg` before spawning, `spawnSpecsync(cwd, ["score", ...args])`,
  non-zero exit passes through with the report as the error. `specsync score`
  has no write flags. The `specsync-check` description now says it uses the
  Fledge task only when defined.
- `src/cli.ts`: `score: "specsync-score"` in the `specsync` subcommand map;
  help and usage lines list `score`.
- Alternative rejected: asking fledge (`fledge run --list --json`) whether
  the task exists. It costs a second spawn on every check and would still need
  a fail-closed rule; the TOML read matches what `fledge run` reads.
- Alternative rejected: deriving the flags at runtime from
  `spec-sync.yml`. That makes the verify lane parse CI YAML; a parity test
  guards drift instead.

## From the change's testing.md

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

## Where these lessons go

- `specs/plugins/context.md`
- `specs/cli/context.md`
- `specs/agent/context.md`
