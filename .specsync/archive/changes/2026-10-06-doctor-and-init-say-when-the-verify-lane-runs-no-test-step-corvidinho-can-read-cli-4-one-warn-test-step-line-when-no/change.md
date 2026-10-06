---
id: doctor-and-init-say-when-the-verify-lane-runs-no-test-step-corvidinho-can-read-cli-4-one-warn-test-step-line-when-no
state: implementing
type: feature
base_commit: 8bf4422f74d6a7d995300a48e302957ee2ef56da
---

# Doctor and init say when the verify lane runs no test step Corvidinho can read (CLI-4): one [warn] test-step line when no [lanes.verify] step visibly runs bun test, jest, vitest, cargo test, pytest or go test, since such a lane can never verify a run that changes files (AGENT-15)

## Intent

doctor and init say when the verify lane runs no test step Corvidinho can read (CLI-4): one [warn] test-step line when no [lanes.verify] step visibly runs bun test, jest, vitest, cargo test, pytest or go test, since such a lane can never verify a run that changes files (AGENT-15)

## Affected Canonical Specs

- `cli`

## Acceptance Criteria

- CLI-4 (captured on main, hi/cli.md; confirmed by Leif): for a project whose [lanes.verify] steps run no command naming bun test, jest, vitest, cargo test, pytest or go test (following steps through tasks as string or { cmd }, their deps, { run }, { task }, parallel items and .fledge/lanes/*.toml imports), corvidinho doctor and corvidinho init each print one plain-language [warn] test-step line naming those runners and saying that if the lane prints none of their summaries a run that changes files is never verified (AGENT-15); the exit code is unchanged (static detection: a wrapper like npm test may still print a recognised summary). No such line for this checkout (verify -> test = bun test), a lane with { run = "cargo test" }, a lane whose step task has deps running pytest, or a lane imported from .fledge/lanes/. When fledge.toml or [lanes.verify] is absent or broken, the existing verify-lane [missing] line stands alone. File contents and parser messages are never printed (SAFE-6); nothing is created or changed. README.md no longer says doctor skips the test step. No new flag, env var, config key or slash command. The runner names come from TEST_SUMMARY_RUNNERS in src/agent/test-evidence.ts. tests/cli.doctor-truth.test.ts's new warn test fails on the base sources and passes on the branch.

## No-spec Rationale

Not applicable
