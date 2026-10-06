---
module: discord
change: where-a-repo-uses-hi-it-drafts-criteria-and-asks-the-owner-on-a-card-before-capturing-them-agent-18-hi-drafts
---

# Delta: discord (the owner's hi card — AGENT-18 hi drafts)

## Added

### REQUIREMENT REQ-discord-521

hi drafts, the owner's card (AGENT-18): a hi capture request a run recorded
with `hi-draft` (REQ-agent-521) SHALL reach Corvidinho's configured owner as
the `hi` kind of the Approve/Deny card engine (`src/discord/hi-card.ts`,
`hiCaptureApprovalKind`; buttons `cvok:hi:<decision>:<id>`, routed by the
bridge like every card kind; class `plain`, so no one-time code). The card
SHALL show, before it, the exact `hi <ID> '<text>'` commands verbatim as
quoted data, then the action (capture N drafted criteria into hi/, exactly as
the commands say), the target (the member-safe project label, the session's
branch, and whose run on which surface drafted them — never a host path), the
amount (the ids), notes that only the owner can approve and no reply
captures anything, the request id, the action hash (request, repository,
worktree, branch, HEAD, every draft, requester and role) and the expiry
(24 h). Every press SHALL count only from the configured owner (the bridge's
`mayDecide`, re-checked on every press: not muted or deny-listed), and Approve
SHALL check again, inside the engine's transaction, that the presser is the
owner configured now; anyone else's press SHALL capture nothing. Deny, no
answer by the expiry, or a late press SHALL be a no: nothing captured.
An `ApprovalKind` MAY declare `prepare(req)`, which the engine SHALL await on
Approve after the hash (and any code) check and before the SAFE-5 `started`
row, outside its transaction; a throw SHALL leave the request open, write an
`-approve` `error` row and run nothing. The `hi` kind's `prepare` SHALL make
sure the session worktree is the one the drafts were made in
(`ensureHiCaptureWorktree`): there, a linked git work tree top of the same
repository (never its main checkout), on the same branch; when its directory
is gone (the talk ended and was parked) it SHALL be re-created at the same
path on the same branch from the main checkout (`git worktree add`), and when
parking also deleted that branch (a talk with no commits of its own) the
branch SHALL be re-made at the commit the drafts were made on (the request's
recorded HEAD, `git worktree add -b`); when that can't be done — that commit
is gone too, the folder is on another branch or belongs elsewhere, a bare
repository — it SHALL fail closed. Then, inside the transaction
(`runHiCapture`), with the `hi` CLI on the bridge's PATH and only PATH and
HOME in its env: the worktree and the drafts SHALL be checked again (`hi
export`, the scrub check), `hi/` SHALL hold nothing uncommitted (no staged,
unstaged or untracked change) and no symlink, `hi <ID> <text>` SHALL run for
each draft in the worktree, `hi export` SHALL then show each id with exactly
its text and `hi check` SHALL pass, and exactly the `hi/` paths the capture
changed SHALL be committed on the session's branch (`git commit --only`,
hooks off, the host's git identity; message `hi: capture <ids> (AGENT-18;
approved on the owner's hi card, request <id>)`; local only, never pushed),
so the capture outlives the talk (parking force-removes a worktree and
deletes a branch with no commits of its own). A worktree `prepare` re-created
only for this capture SHALL be removed again after the approval commits
(`releaseHiCaptureWorktree`: only while it is still that worktree at exactly
the capture's commit with nothing in it but a root `INTENT.md` the CLI made);
the branch keeps the commit. On any failure the commit and
what it staged SHALL be undone, `hi/` (and a root `INTENT.md` the CLI
created) SHALL be put back as it was and nothing SHALL count as captured (the
transaction rolls back; the request stays open). On success each criterion
SHALL write a SAFE-5 `hi-capture-criterion` row (digest of the request, id
and text), the ledger SHALL record what changed under `hi/`
(REQ-agent-522), the request SHALL record the captured ids and the commit,
and the card SHALL close with `Approved by you — captured <ids> into hi/ on
branch <branch>, commit <12 hex> (AGENT-18).` The asker SHALL get one outcome
post naming the ids, the branch and the commit only (never the drafted
text), mentioning only them, in the conversation they asked in while it is
still allowlisted, else by DM, retried for a day.
The engine's delivery pass SHALL send the card after each chat run and ask
answer, when a `/work` run ends (`SlashCtx.deliverApprovalCards`), on
scheduler ticks and on its own poll. No env var, config key or flag.

Acceptance Criteria
- The owner gets the commands DM first and then the card with the action, `widget on branch …`, the team member's `/work` run, `2 criteria: AGENT-20, AGENT-18.b`, Approve and Deny buttons and no Enter code.
- A stranger's press answers "Only the owner can answer this card." and captures nothing; the owner's Approve captures exactly the drafts in one commit on the session's branch that changes only `hi/agent.md` (leaving `hi/` clean), records the ids and the commit, writes `hi-capture-card`, `hi-capture-approve` `started`, two `hi-capture-criterion` and `hi-capture-approve` `ok` rows, and posts one outcome to the asker's channel naming the ids, branch and commit, not the text; a second press finds it closed.
- With the owner config changed after the card went out, Approve fails ("only Corvidinho's configured owner can approve a capture") and nothing is captured.
- Deny and a lapsed card capture nothing and tell the asker.
- A removed worktree whose branch has a commit is re-created on that branch and captured into; a talk parked with `parkWorktree` (worktree removed, branch deleted) is re-made at the recorded commit and captured into, the capture on the re-made branch; with that commit gone too, Approve fails closed ("so are its branch … and the commit the drafts were made on"), nothing is created and the request stays open.
- An approved capture outlives its talk: after `parkWorktree` the branch is kept and its tip is the capture's commit; a worktree re-created only for a capture is gone again afterwards, its branch holding the commit.
- A worktree switched to another branch, a request naming the main checkout, an id captured by hand since the draft, a capture that fails on its second draft, a failing `hi check`, a failing `git commit`, an uncommitted `hi/notes.md`, and a `hi/agent.md` that is a symlink each capture nothing, leave `hi/` (and `INTENT.md`), HEAD and the index as before, and never write through the link.
- Through the bridge with a fake gateway, the `hi` card is delivered, a stranger's `cvok:hi:approve` press is refused, the owner's captures, and the hi guard then lists nothing for the talk.
- `tests/discord.hi-card.test.ts` fails on the base (main) sources and passes after.

## Modified

### REQUIREMENT REQ-discord-520

AGENT-18 hi guard: in a repo that uses hi (`scanRepoWays(cwd, mergeBase)`:
the merge-base, HEAD and the work tree), `openWorkPr` (`src/work/pr.ts`)
SHALL, after the SpecSync coverage check (REQ-discord-518) and before the
pre-push verify re-run, `git-commit` and `git-push`, compare `hi/` with the
merge-base (`hiChangesSince`: committed on the branch or left in the tree,
untracked and ignored files included, and an assume-unchanged or
skip-worktree entry edited on disk; a `hi/` commit on the branch counts
whoever made it, since the PR would carry it), leaving out a path whose
change approved captures alone explain (REQ-agent-522). When anything else
differs it SHALL not open the PR, with reason `hi-changed` and the line `PR: not opened — this
repo's hi/ changed since the branch left <base> (criteria …; retired
entries …; other hi/ files …) and no approved capture made the change; the
agent never changes a repo's criteria itself: they change only through a
capture the owner approves on a card …, and only what approved captures
made passes (AGENT-18). The changes stay
on branch <branch>.`; a hi/ diff that cannot be read SHALL refuse the
same way ("could not read what changed under hi/ …"). Because the check
comes before the fallback re-verify, a run result trusted from its frame and
a verify re-run here both hold to it; nothing is committed or pushed.

Acceptance Criteria
- A leftover dirty hi/ edit with a verified run: `hi-changed`, the line names `criteria AGENT-19`, no plugin call.
- A hi/ note committed on the branch with no result frame: `hi-changed` naming `other hi/ files hi/notes.md`, and the verify runner is never called.
- A `/work` run that edits hi/ ends failed and opens no PR; the tree it left is refused even with a trusted verified result; once hi/ is restored the next run is verified and the PR opens.
- `tests/agent.hi-guard.test.ts` fails on the base sources and passes after.
- A tree whose only `hi/` change is a capture the owner approved on the `hi` card opens its PR (REQ-agent-522).

