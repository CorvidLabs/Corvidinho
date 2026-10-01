# Lesson bundle — the-second-model-review-sees-an-edit-made-in-the-same-second-as-the-last-index-write-its-index-copy-keeps-the-real

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: The second-model review sees an edit made in the same second as the last index write: its index copy keeps the real index's time (GITHUB-9)
- **Kind**: BugFix
- **Specs**: plugins
- **Paths**: src/work/review.ts, tests/fixtures/review-cycle.ts, tests/work.review.test.ts
- **Acceptance**: reviewTree's temporary index copy keeps the real index's modification time, so a tracked file rewritten with the same size in the same second as the last index write (entry times and size equal the file's) is in the reviewed tree when the review runs a second later; with the pre-fix source that tree is still HEAD's tree (3 of 3 runs fail, 3 of 3 pass with the fix); the test fixture's fullWorkTree copy keeps the time too; tests/work.review.test.ts, work.pr, github.write.plugin and roles.chat.gates pass; the full suite and verify pass

## Evidence

- Verification commit: `4adbacacde6bcb600ed1cd19a3a301052a930d5f`
- Base commit: `5ea21feedeecd51e4058d2892d86ce30ec573959`
- Verified by: `specsync check --spec plugins`

## From the change's context.md

# Context

CI (`smoke`, ubuntu-latest, git 2.55) failed on PR #341 at head 5ea21fe
(job 110195071921): `(fail) github-pr-create with a run model: bounded
rounds, then the PR lists them (GITHUB-9) > the branch on GitHub must be the
reviewed tree: unpushed edits refuse in one line; after the push it opens
[63.98ms]`; the other 3552 tests passed. The same test passed locally 3 of 3
and in the full local suite.

Cause: `makeReviewRepo` commits `src/app.ts` as `export const answer =
41;` and the test rewrites it as `… 42;` — the same size. When the write,
`git add` and the edit fall in one second, the index entry's whole-second
ctime and mtime and its size equal the edited file's (git compares seconds
only unless built with USE_NSEC). Git then trusts the entry unless it is
"racily clean": not older than the index file, which makes git re-read the
content. `reviewTree` staged into a `copyFileSync` copy of the index, and a
copy gets the time it was made: when the copy fell in a later second than
the index write, the entry was no longer racy against it, `git add
--update` skipped the edit and the reviewed tree was HEAD's. Then the
branch on GitHub matched that tree and the PR opened where the test expects
the unpushed-edit refusal. The 64 ms test only hits it when a second
boundary falls between the index write and the copy.

A shell reproduction (commit, same-size rewrite, wait 1.1 s, copy the index,
`git add --update`, `write-tree`) missed the edit 30 of 30 times with a
plain copy and 0 of 30 when the copy keeps the index's time (`touch -r`).

The same miss can happen for a real run: an edit of the same size made in
the same second as the last index write would not reach the reviewer, and
the review would be recorded for a tree that is not the one pushed later.
`tests/fixtures/review-cycle.ts` `fullWorkTree` (seeds /work reviews)
copied the index the same way.

Constraints: no product surface change; no test skipped or relaxed; the real
index still never changes.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-092` | `tests/work.review.test.ts` "a same-size edit made in the same second as the last index write counts when the review runs a second later (racy git)" | The fixture is retried until `git ls-files --debug src/app.ts` shows the entry's whole-second ctime and mtime and its size equal to the edited file's; the test then waits into the next second and calls `reviewTree`. With the fix the tree differs from HEAD's and equals the tree a commit of the edit has. With the pre-fix `src/work/review.ts` (HEAD 5ea21fe) swapped in, 3 of 3 runs fail (`Expected: not` HEAD's tree); restored, 3 of 3 pass. |
| `REQ-plugins-092` | `tests/work.review.test.ts`, `tests/work.pr.test.ts`, `tests/github.write.plugin.test.ts`, `tests/roles.chat.gates.test.ts` | 83 of 83 pass with the fix (the fixture's `fullWorkTree` keeps the index time too). |
| `REQ-plugins-092` | full `bun test`, `fledge lanes run verify --non-interactive` | Run by the finalize step on this branch. |

## Where these lessons go

- `specs/plugins/context.md`
