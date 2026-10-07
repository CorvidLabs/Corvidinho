---
id: cover-github-7-a-merge-incidental-path-395-s-github-pr-merge-tests-folded-into-the-self-merge-suite
state: verifying
type: refactor
base_commit: 2a266292110511bbb8b551ea7664533b207f976e
---

# Cover GITHUB-7.a merge incidental path: #395's github-pr-merge tests folded into the self-merge suite

## Intent

Cover GITHUB-7.a merge incidental path: #395's github-pr-merge tests folded into the self-merge suite

## Affected Canonical Specs

- None

## Acceptance Criteria

- tests/github.merge.plugin.test.ts (#395) is gone and every one of its 12 cases runs in tests/github.self-merge.test.ts against the one GITHUB-7.a gate (kept where it still holds, updated where the stricter gate now refuses the PR); specsync change audit reports no uncovered meaningful path.

## No-spec Rationale

#395's tests/github.merge.plugin.test.ts is removed because its cases now run against the one GITHUB-7.a gate in tests/github.self-merge.test.ts; REQ-plugins-099 (modified by the it-can-merge-its-own-corvidinho-pr change in this PR) and specs/plugins/testing.md already say where they went, so no new acceptance criteria or living-spec prose.
