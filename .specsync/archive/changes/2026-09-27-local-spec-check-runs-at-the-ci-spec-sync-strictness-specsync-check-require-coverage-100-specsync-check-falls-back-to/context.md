---
change: local-spec-check-runs-at-the-ci-spec-sync-strictness-specsync-check-require-coverage-100-specsync-check-falls-back-to
artifact: context
---

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
