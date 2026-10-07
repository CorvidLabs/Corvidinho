---
change: the-archived-review-for-the-autonomy-10-b-bridge-live-note-change-records-the-post-merge-review-that-actually-ran-not-a
artifact: tasks
---

# Tasks

- [x] Replace the #375 archive's `review.json` with the post-merge review
      (reviewer claim `claude-post-merge-review`, verdict pass, commit
      f0c12538, its own timestamp, no CI-check provenance, a note on what it
      replaces, that #406 recorded it and that #389 wrote the old record).
- [x] Replace its `review-attempts.json` with a `{schema_version: 1,
      reviews: [...]}` ledger whose last entry is that review.
- [x] Add `tests/specsync.archive-review.test.ts` and show it fails with
      main's records and passes on the branch.
- [x] Re-check the other archives that carry the provenance string and list
      the 13 tip-orphan-script archives in the test and the PR. They are not
      rewritten here: no review has been recorded that passes any of their
      merged commits (the post-merge reviews of #370, #372, #373 and #374
      found defects that follow-up PRs fix).
