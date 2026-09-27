---
id: local-spec-check-runs-at-the-ci-spec-sync-strictness-specsync-check-require-coverage-100-specsync-check-falls-back-to
state: archived
type: feature
base_commit: fc0ed8da6e47dc1db452ee51044cde096db4e8bc
---

# Local spec-check runs at the CI Spec Sync strictness (specsync check --require-coverage 100), specsync-check falls back to specsync check when the project defines no Fledge spec-check task, and a read-only specsync-score tool reports SpecSync spec scores (SPECSYNC-2/3, issue 89)

## Intent

Local spec-check runs at the CI Spec Sync strictness (specsync check --require-coverage 100), specsync-check falls back to specsync check when the project defines no Fledge spec-check task, and a read-only specsync-score tool reports SpecSync spec scores (SPECSYNC-2/3, issue 89)

## Affected Canonical Specs

- `plugins`
- `cli`
- `agent`

## Acceptance Criteria

- The fledge.toml spec-check task (on the verify lane) runs specsync check with the same strictness as the CI Spec Sync Action in .github/workflows/spec-sync.yml: --require-coverage matching its require-coverage input (100) and --strict only when the Action sets strict (it does not), so a tree with an unspecced source file fails the local verify lane (verified=false) exactly as CI Spec Sync fails it; a parity test fails if fledge.toml and spec-sync.yml drift apart. specsync-check uses fledge run spec-check only when fledge is on PATH and the project fledge.toml defines a spec-check task (an unreadable or unparsable fledge.toml keeps the Fledge path, fail closed); otherwise it runs the local specsync check under the project's own .specsync config instead of failing with Unknown task spec-check. A new read-only specsync-score plugin (minTier 0, not dangerous, no API key) runs the local specsync score with the forwarded args (module filters, --explain, --format json) and returns its report; it refuses --root before spawning like specsync-coverage; corvidinho specsync score maps to it. No slash command, env var or config key is added. Regression tests fail on main and pass on the branch; tsc, bun test, specsync check --require-coverage 100 and the verify lane are green.

## No-spec Rationale

Not applicable
