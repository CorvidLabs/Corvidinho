---
change: req-agent-112-after-the-fledge-core-builtins-an-allowlist-with-no-fledge-entry-and-a-non-admin-role-session-offer-no
artifact: tasks
---

# Tasks

- [x] Rewrite REQ-agent-112 as one requirement: #261's allowlist and ADMIN
      gating plus #262's read-only core builtins, with no duplicated sentence.
- [x] In `tests/agent.allowlisted-dangerous.test.ts`, assert that the
      `github-pr-review` allowlist and the non-ADMIN role session offer
      exactly `fledge-lanes-list` and `fledge-lanes-validate` as `fledge-`
      tools, never `fledge-hello`, and start no fledge process.
- [x] Run tsc, `bun test`, `specsync check --require-coverage 100` and the
      verify lane.
