---
change: the-second-model-review-sees-an-edit-made-in-the-same-second-as-the-last-index-write-its-index-copy-keeps-the-real
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-092` | `tests/work.review.test.ts` "a same-size edit made in the same second as the last index write counts when the review runs a second later (racy git)" | The fixture is retried until `git ls-files --debug src/app.ts` shows the entry's whole-second ctime and mtime and its size equal to the edited file's; the test then waits into the next second and calls `reviewTree`. With the fix the tree differs from HEAD's and equals the tree a commit of the edit has. With the pre-fix `src/work/review.ts` (HEAD 5ea21fe) swapped in, 3 of 3 runs fail (`Expected: not` HEAD's tree); restored, 3 of 3 pass. |
| `REQ-plugins-092` | `tests/work.review.test.ts`, `tests/work.pr.test.ts`, `tests/github.write.plugin.test.ts`, `tests/roles.chat.gates.test.ts` | 83 of 83 pass with the fix (the fixture's `fullWorkTree` keeps the index time too). |
| `REQ-plugins-092` | full `bun test`, `fledge lanes run verify --non-interactive` | Run by the finalize step on this branch. |
