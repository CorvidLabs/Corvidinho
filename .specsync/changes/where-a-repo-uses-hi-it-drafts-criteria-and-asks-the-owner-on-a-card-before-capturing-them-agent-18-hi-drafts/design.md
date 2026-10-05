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
  root `INTENT.md` is read as bytes and mode; any failure (a `hi` error, an id
  that did not come out as drafted, `hi check`) writes them back and removes
  what the CLI added, then throws so the transaction rolls back.
- **The guard's allowance is content-based.** Each approved capture records,
  per changed `hi/` path, a key of its content before and after (text and
  executable bit). The guard leaves a changed path out only when a chain of
  approved steps leads from its content at the base to its content now. An
  edit on top changes the end key (blocks); a mode-only change never matches
  (blocks); a leftover change before the capture makes the chain start
  elsewhere (blocks). Committing changes nothing, so a committed capture
  still passes, and a later capture extends the chain.
- **Re-create or fail closed.** A parked talk worktree is re-created at its
  path on its branch only when that branch still exists; otherwise the
  request stays open with a clear error (the owner can Deny or let it lapse).
