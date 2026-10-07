---
change: the-archived-review-for-the-autonomy-10-b-bridge-live-note-change-records-the-post-merge-review-that-actually-ran-not-a
artifact: context
---

# Context

Follow-up to #375 (AUTONOMY-10.b: the fixed bridge-live note is system text
and posts without the owner's OK). The post-merge review of #375 found its
archived SpecSync review false. `review.json` / `review-attempts.json` in
`.specsync/archive/changes/2026-10-06-the-fixed-bridge-live-note-...` said
reviewer `corvid-agent` passed commit f0c12538 in the GitHub Actions check
`SpecSync scoped review`. No workflow here defines that check
(`.github/workflows` has `ci.yml` job `smoke`, `spec-sync.yml` job
`spec-sync` and `release.yml`), the PR had no GitHub review, and
`specsync change review` never ran for it. The record came from the
tip-orphan script (`land-one.sh`, added by accident in #368 and deleted by
#375): the review has the finalization's timestamp (1791306267), the ledger is
a bare JSON list rather than SpecSync's `{schema_version, reviews}`, and
`lesson-bundle.md` is the script's one-line template.

Constraints found while fixing it:

- SpecSync 6.0 cannot write the record this fix needs. `specsync change
  review` stamps `provenance: {provider: github_actions_check,
  required_check: "SpecSync scoped review"}` on every review it writes,
  locally included (specsync-6.0.0 `src/change.rs`
  `record_scoped_review_with_verdict`), and it only runs on a change in
  `verifying`. This change is archived. The honest record is therefore
  written by hand, with SpecSync's field names but no provenance and a
  `note` that says what happened, who recorded it (#406) and where the
  replaced record came from (#389). SpecSync's default `change audit` does
  not load archive integrity. This archive's `finalization.json` already
  failed SpecSync's own review digest check before this fix
  (`review_digest` is the execution digest).
- That provenance string is in all 331 archived reviews because SpecSync
  writes it. 318 of them came from `specsync change review` (ledger format,
  own timestamp). 14 were written by tip-orphan scripts with the review in
  the finalization's second: 13 as a bare list, and #370's ledger rewrapped
  by #397. This change corrects only #375's record, whose post-merge review
  passed the merged commit. The other 13 keep their records and are listed
  in the test as known pre-fix archives until each is corrected on its own:
  the post-merge reviews of #370, #372, #373 and #374 found defects that
  follow-up PRs fix (#401, #403, #402, #398), so a pass for those merged
  commits would not be true, and for the others no review is recorded in
  this repository.
- The tip-orphan script is not in this repository; #375 deleted
  `land-one.sh`. The repo-side guard is the test: a new archive whose
  review is stamped in its finalization's second fails `bun test`.
