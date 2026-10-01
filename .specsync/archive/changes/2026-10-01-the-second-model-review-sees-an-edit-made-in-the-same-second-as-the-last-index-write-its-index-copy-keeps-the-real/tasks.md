---
change: the-second-model-review-sees-an-edit-made-in-the-same-second-as-the-last-index-write-its-index-copy-keeps-the-real
artifact: tasks
---

# Tasks

- [x] Read the failing CI job: only the unpushed-edit test failed, in 64 ms.
- [x] Reproduce the miss outside the suite: a same-size edit in the index write's second is skipped by `git add --update` on a later-stamped index copy (30 of 30), kept when the copy keeps the index's time (0 of 30).
- [x] `src/work/review.ts` `reviewTree`: after copying the index, set the copy's atime and mtime to the real index's (`utimesSync`).
- [x] `tests/fixtures/review-cycle.ts` `fullWorkTree`: the same.
- [x] `tests/work.review.test.ts`: a deterministic regression test (retry the fixture until the entry's whole-second times and size equal the edited file's, wait into the next second, then `reviewTree`).
- [x] Prove it fails with the pre-fix `src/work/review.ts` and passes with the fix; run the review test files, `tsc`, the full suite and verify.
