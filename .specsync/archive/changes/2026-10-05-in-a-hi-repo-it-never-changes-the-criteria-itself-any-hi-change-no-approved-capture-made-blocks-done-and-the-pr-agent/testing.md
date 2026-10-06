---
change: in-a-hi-repo-it-never-changes-the-criteria-itself-any-hi-change-no-approved-capture-made-blocks-done-and-the-pr-agent
artifact: testing
---

# Testing

`tests/agent.hi-guard.test.ts` (20 tests): temp git repos, temp non-git dirs
and a talk worktree from `ensureTalkWorkspace` with a bare `origin`, never
this checkout; stub verify runners; the real file tools through `runPlugin`;
`openWorkPr` with stub plugin calls. Imports come only from modules the base
has, plus `src/agent/repo-ways.ts`.

Fail-on-base proof: with b84c75f's `src/agent/loop.ts`, `src/work/pr.ts`,
`plugins/files/commands.ts` and `plugins/files/protectedPaths.ts` swapped in
(the new `src/agent/repo-ways.ts` kept so the file loads),
`bun test tests/agent.hi-guard.test.ts` gave 6 pass, 11 fail: all three
file-tool cases (the writes go through), all five gate cases (the run is
verified and the lane runs) and all three /work cases (the PR opens or the
run is verified). The 6 that pass are the repo-ways units, the prompt block
and the no-false-block case. With b84c75f's `repo-ways.ts` too, the file
does not load (`hiChangesFromSnapshot` not exported). Restored: 17 of 17
pass.

Review round (20 tests): with b84c75f's `src/agent/loop.ts`, `src/work/pr.ts`,
`plugins/files/commands.ts`, `plugins/files/protectedPaths.ts` and
`plugins/github/commands.ts` swapped in (the new `repo-ways.ts` kept),
8 pass and 12 fail — the 11 above plus the `github-pr-create` refusal; the 8
that pass are the five repo-ways units, the prompt block, the no-false-block
case and the no-run `github-pr-create` case. With the pre-review head
82630d9's `repo-ways.ts` and `loop.ts` (and the base `github/commands.ts`),
the hidden-edit test, the note-advice test and the `github-pr-create`
refusal fail. Restored: 20 of 20 pass.

`tests/agent.repo-ways.test.ts`, `tests/files.plugins.test.ts`,
`tests/work.pr.test.ts` and `tests/agent.verify-gate.test.ts` still pass
(82 of 82).

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-520` | `tests/agent.hi-guard.test.ts` "what changed under hi/ since the session base" (5 tests) | criteria / retired / files sorting for dirty, committed, untracked, ignored and deleted paths; assume-unchanged and skip-worktree edits git diff hides still count, a sparse gap does not; the non-git snapshot; the note text (undo only its own change). |
| `REQ-agent-520` | `tests/agent.hi-guard.test.ts` "the verify gate blocks done on any hi/ change since the session base" (7 tests) | `hi guard:` note, no lane call, retry feedback, verified once undone; stuck ask when it stays; leftover dirty; committed mid-run; non-git; no false block (untouched, no front matter, capture already on the base); prompt block. Fail on base: the five blocking cases. |
| `REQ-plugins-520` | `tests/agent.hi-guard.test.ts` "file tools refuse writes, edits and deletes under hi/ in hi repos" (3 tests) | write / edit / delete refused with `refused (AGENT-18)`, file unchanged, reads work, symlink judged where it lands, non-hi repo writable, non-git hi refused. Fail on base: all three. |
| `REQ-discord-520` | `tests/agent.hi-guard.test.ts` "/work opens no PR while hi/ differs from the merge-base" (3 tests) | `hi-changed` with no plugin call for a leftover dirty edit and a committed note (fallback re-verify never runs the lane); a /work run that edits hi/ fails and opens no PR; restored, the PR opens. Fail on base: all three. |
| `REQ-plugins-521` | `tests/agent.hi-guard.test.ts` "github-pr-create inside a run opens no PR while hi/ differs from the session base" (2 tests) | inside a run, a committed criterion makes a dry-run `github-pr-create` refuse with `refused (AGENT-18)` (exit 2) before any review; untouched hi/ is not refused by the guard; with no run in progress the guard does not apply. Fail on base: the refusal. |
| all | full `bun test`, `fledge lanes run verify --non-interactive` | Run on this branch before push. |
