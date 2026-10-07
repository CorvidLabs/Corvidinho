---
change: after-a-move-to-a-stronger-model-the-model-it-moved-from-is-no-author-of-the-change-so-it-can-be-the-second-model
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-088` | `tests/agent.stall-escalate.test.ts` "GITHUB-9.a: the model it moved from changed nothing, so it is no author and reviews the change" | Two models (`fake-weak,fake-strong`) and the same order; the weak model says "Done." twice, the strong one calls a writer reporting README.md. With the fix `exec.review.authors()` is `["fake-strong"]` and `resolveReviewer` returns `fake-weak`. With origin/main's `src/agent/execute.ts` (54d6a6c) swapped in, it fails (`authors()` also has `fake-weak`); restored, it passes. |
| `REQ-agent-088` | `tests/agent.stall-escalate.test.ts` "GITHUB-9.a: a lead's author stays an author after the move (a worker's run)" | `CORVIDINHO_DELEGATE_DEPTH=1`, `CORVIDINHO_DELEGATE_AUTHORS=fake-weak`: after the same move `authors()` is `fake-strong, fake-weak` and there is no reviewer (guards the exception). |
| `REQ-agent-088`, `REQ-agent-092` | `tests/agent.stall-escalate.test.ts`, `tests/work.review.test.ts`, full `bun test`, `fledge lanes run verify --non-interactive` | All pass on this branch. |
