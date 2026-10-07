---
change: the-archived-review-for-the-autonomy-10-b-bridge-live-note-change-records-the-post-merge-review-that-actually-ran-not-a
artifact: testing
---

# Testing

`tests/specsync.archive-review.test.ts` reads the repository's own
`.specsync/archive` and `.github/workflows`:

1. The #375 archive's review is the post-merge review of the #375 squash
   (f0c12538), with verdict pass and a reviewer claim. It is not stamped in
   the finalization's second. `review-attempts.json` is a ledger (not a bare
   list) whose last entry equals `review.json`.
2. Every `required_check` named in either file is a job id or `name:`
   defined by some workflow. `SpecSync scoped review` is not.
3. No archive outside the 13 known pre-fix tip-orphan archives has a review
   stamped in its finalization's second.

Fail-on-main proof: with main's `review.json` and `review-attempts.json`
swapped into the archive, all 3 cases fail: the timestamp equals 1791306267,
the claimed check is not defined, and the #375 archive is flagged. With the
branch's files restored, all 3 pass.
