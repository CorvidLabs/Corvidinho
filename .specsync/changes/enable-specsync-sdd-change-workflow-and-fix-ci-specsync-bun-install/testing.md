---
change: enable-specsync-sdd-change-workflow-and-fix-ci-specsync-bun-install
artifact: testing
---

# Testing

- `bun test` exits 0
- `bun src/cli.ts --help` exits 0
- `bunx tsc --noEmit` exits 0
- `specsync check` exits 0
- `fledge lanes run verify --non-interactive` exits 0
- GitHub Actions `smoke` job green on PR #1 after push
