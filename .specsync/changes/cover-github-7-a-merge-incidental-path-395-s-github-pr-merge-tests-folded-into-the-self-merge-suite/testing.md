---
change: cover-github-7-a-merge-incidental-path-395-s-github-pr-merge-tests-folded-into-the-self-merge-suite
artifact: testing
---

# Testing

- `bun test tests/github.self-merge.test.ts -t "carried over from #395"` —
  the 14 tests of the carried-over block pass (12 #395 cases, 2 new: the PR
  #395 would have merged is refused, and `--method` is squash-only).
- `specsync change audit` — no uncovered meaningful path from this PR.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| (no-spec cover) | `tests/github.self-merge.test.ts` "GITHUB-7 cases carried over from #395" | #395's cases run against the one GITHUB-7.a gate; REQ-plugins-099 is modified by the main change in this PR |
| all | `specsync change audit` | green on this branch |
