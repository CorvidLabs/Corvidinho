---
id: the-second-model-review-sees-an-edit-made-in-the-same-second-as-the-last-index-write-its-index-copy-keeps-the-real
state: approved
type: bug_fix
base_commit: 5ea21feedeecd51e4058d2892d86ce30ec573959
---

# The second-model review sees an edit made in the same second as the last index write: its index copy keeps the real index's time (GITHUB-9)

## Intent

The second-model review sees an edit made in the same second as the last index write: its index copy keeps the real index's time (GITHUB-9)

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- reviewTree's temporary index copy keeps the real index's modification time, so a tracked file rewritten with the same size in the same second as the last index write (entry times and size equal the file's) is in the reviewed tree when the review runs a second later; with the pre-fix source that tree is still HEAD's tree (3 of 3 runs fail, 3 of 3 pass with the fix); the test fixture's fullWorkTree copy keeps the time too; tests/work.review.test.ts, work.pr, github.write.plugin and roles.chat.gates pass; the full suite and verify pass

## No-spec Rationale

Not applicable
