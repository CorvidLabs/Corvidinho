---
change: where-a-repo-uses-hi-it-drafts-criteria-and-asks-the-owner-on-a-card-before-capturing-them-agent-18-hi-drafts
artifact: design
---

# Design

- **Agent-level tool, like `ask-human`.** `hi-draft` is not a plugin: the tool
  loop intercepts it, so it never goes through `runPlugin`'s allowlist and
  must-ask gate, and its offer is decided by `hiDraftGate` per attempt and
  again at the call (role re-resolved from the live config, IDENTITY-12).
  It only records; it never touches the repo.
- **Two endings.** A Discord run records a request and ends blocked with a
  clarify ask (no new ask reason, so every bridge path that shows asks works
  unchanged; the ask avoids list markers the button parser would read as
  choices). The local CLI records nothing: the person at the terminal is the
  one who would run `hi`, so the ask hands them the exact commands.
- **Module-owned tables, no schema bump.** `hi_capture_requests` is the `hi`
  kind's store (the same shape as `forget_requests`); `hi_capture_files` is
  the ledger. Both are `CREATE TABLE IF NOT EXISTS` on first use, like
  `pr_change_authors`.
- **The card.** Class `plain` (capture is not destructive or money, so no
  one-time code). The engine's `mayDecide` is the owner check on every press;
  `onApprove` checks the owner configured now once more. The engine gains an
  optional `prepare(req)` step, awaited after the hash check and before the
  `started` row, so re-creating the worktree (`git worktree add`, slow) runs
  outside the IMMEDIATE transaction; the capture itself (`hi` is fast) runs
  inside it, synchronously, so the decision, the ledger, the audit rows and
  the captured ids commit together or not at all.
- **All or nothing on disk.** Before the capture every file under `hi/` and a
  root `INTENT.md` is read as bytes and mode (a symlink there is refused: the
  `hi` CLI replaces a link with a plain file the undo could not put back);
  any failure (a `hi` error, an id that did not come out as drafted, `hi
  check`, `git commit`) undoes the commit and what it staged, writes the
  files back and removes what the CLI added, then throws so the transaction
  rolls back.
- **Committed on the session's branch (review fix).** Parking a talk
  (`parkSessionWorktree` after the 45-minute idle TTL, `/session end`)
  force-removes its worktree, uncommitted changes and all, and deletes a
  branch with no commits of its own. An uncommitted capture was therefore
  lost when the talk ended, and an Approve after the talk ended always failed
  (branch gone). Approve now refuses a `hi/` with anything uncommitted, then
  commits exactly the `hi/` paths the capture changed (`git commit --only`,
  hooks off, the host's identity, never pushed): the branch keeps the capture
  after parking, and a later run or a person can ship it. The capture only
  ever lands in a linked talk worktree (the gate needs the talk's own
  worktree; the capture refuses a main checkout), so it never commits on a
  person's checkout.
- **The guard's allowance is content-based.** Each approved capture records,
  per changed `hi/` path, a key of its content before and after (text and
  executable bit). The guard leaves a changed path out only when a chain of
  approved steps leads from its content at the base to its content now. An
  edit on top changes the end key (blocks); a mode-only change never matches
  (blocks); a leftover change before the capture makes the chain start
  elsewhere (blocks). Committing changes nothing, so a committed capture
  still passes, and a later capture extends the chain.
- **Re-create or fail closed.** A parked talk worktree is re-created at its
  path on its branch; when parking deleted the branch (no commits of its
  own), the branch is re-made at the commit the drafts were made on (the
  request's recorded HEAD, still in the object store). Only when that commit
  is gone too does the request stay open with a clear error (the owner can
  Deny or let it lapse). A worktree re-created only for the capture is
  removed again after the approval commits (only while it is at exactly the
  capture's commit with nothing else in it), since no talk would ever park
  it; the branch keeps the commit.
- **One open card per id.** A draft whose id already waits in an open request
  of the same repository is refused at the call, so the owner never gets a
  second card for it (the second could only fail once the first is
  captured).
