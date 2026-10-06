---
module: agent
change: where-a-repo-uses-hi-it-drafts-criteria-and-asks-the-owner-on-a-card-before-capturing-them-agent-18-hi-drafts
---

# Delta: agent (hi drafts and the approved-capture allowance — AGENT-18)

## Added

### REQUIREMENT REQ-agent-521

hi drafts (AGENT-18, captured on main from Leif's 2026-09-28 interview:
"… where it uses hi, it drafts criteria and asks before capturing, never
inventing them; …"; this builds the drafting half of the hi clause). In a
repo that uses hi (the run's ways, `repoWays.hi`), `createTaskExecute`
SHALL offer the agent-level tool `hi-draft` (`src/agent/hi-drafts.ts`,
intercepted by the tool loop like `ask-human`) only when `hiDraftGate`
allows it, re-read for every attempt and again at the call: the run is not
a delegate or council worker, not WATCH (`CORVIDINHO_WATCH_SESSION_ID` or the
`watch` surface) and not a schedule (`schedule_*` session or the `schedule`
surface); then either (a) a role session on the `chat`, `ask`, `session` or
`work` surface whose acting role, re-resolved now (`resolveActingRole`), is
owner or team, in a cwd that is this talk's own linked worktree
(`isOwnTalkWorktree` with the run's Discord session id: never a main checkout
or another talk's worktree) — mode `card`; or (b) no
role session, no Discord session id or surface stamp, and not started from
inside a tool (`CORVIDINHO_PROJECT_ROOT` unset) — the local CLI, mode `cli`.
Community runs SHALL never be offered it; a call to it there is refused as
not in the catalog. Once a tool result looked like an injection (SAFE-13) a
call SHALL be refused. A call (`{"drafts":[{"id","text"}]}`) SHALL carry
1–5 drafts, each text one line (whitespace collapsed; any other control
character refused) of at most 400 characters, not starting with `-` (it
would read as a flag); each draft SHALL be
validated against `hi export` in the cwd (`validateHiDrafts`): a hi-shaped
id whose family a hi file declares, not captured, not retired, not drafted
twice, a dotted id's parent captured (not retired) or drafted before it;
and a draft that SAFE-6 scrubbing would change SHALL be refused. Any
refusal SHALL go back to the model as a failed tool result
(`refused (AGENT-18): …`) and record nothing. In mode `card` a draft whose id
already waits in an open (pending, not expired) request of the same
repository SHALL be refused (`<ID> already waits on the owner's card
(request <id>); nothing new was drafted`), so the owner never gets a second
card that could only fail. In mode `card`, with an owner
configured and the cwd on a branch, it SHALL record a pending hi capture
request (`HiCaptureStore.request`, the module-owned `hi_capture_requests`
table in the shared data dir DB, created with `CREATE TABLE IF NOT EXISTS`,
no schema version bump): the drafts as validated, the session worktree's
real path, branch and HEAD, the repository's git common dir, a member-safe
project label, who asked (`CORVIDINHO_ACTING_DISCORD_USER_ID`), their role,
the surface, the session id and the conversation it came from, expiring in
24 h. In mode `cli` it SHALL record nothing. Either way the run SHALL end
blocked (`TaskResult.state` `blocked`, verify skipped, never done) with a
`clarify` ask that is never cut (an ask that would not fit is refused back
to the model instead): in `card` mode naming each draft (`• ID — text`), the
request id and that only the owner's Approve captures them and a reply does
not; in `cli` mode listing the exact `hi <ID> '<text>'` commands (the text as
one single-quoted shell word) for the person at the CLI. The run itself
SHALL never capture anything. No env var, config key or flag.

Acceptance Criteria
- The owner's and a team member's chat, ask, `/session start` and `/work` runs in a talk worktree get mode `card`; a local CLI run gets `cli`; community (also a declared team member the surface stamped community), WATCH, schedules, delegate workers, no surface, a repo without hi, a non-git cwd, the main checkout, another talk's worktree, a CLI run with a Discord session id and a run started from inside a tool get nothing.
- A second owner run drafting an id that already waits on the owner's card gets `refused (AGENT-18): AGENT-20 already waits on the owner's card (request …)` and no second request is recorded.
- Through `createTaskExecute` and a scripted model, the owner's chat offers `hi-draft` (its prompt says to draft with it), the call records one pending request with the drafts, branch, worktree, repository, requester, role, surface, session and channel, and the run ends with the clarify ask naming the drafts and the request; `hi/` is unchanged.
- Through `runTask` a team member's run ends `blocked`, not verified, and the lane is never called.
- A community run is not offered it (its prompt says this run can't draft) and a call is refused as not in the catalog; nothing is recorded. A delegate worker is not offered it.
- A secret-looking text, a captured id and an unknown family each come back to the model as `refused (AGENT-18)` with the reason (the secret never echoed); nothing is recorded.
- A local CLI run ends with the exact `hi AGENT-20 '…'` command (a single quote escaped) and records nothing.
- `tests/agent.hi-draft.test.ts` fails on the base (main) sources and passes after.

### REQUIREMENT REQ-agent-522

hi drafts, the guard's allowance (AGENT-18): the only `hi/` change the hi
guard (REQ-agent-520, REQ-discord-520, REQ-plugins-521) SHALL let through is
one approved captures made. When the owner's Approve captures a request
(REQ-discord-521), every `hi/` path the capture changed SHALL be recorded in
the module-owned `hi_capture_files` ledger (`src/agent/hi-capture-store.ts`)
with the repository (its git common dir) and a content key before and after
(`hiContentKey`: the UTF-8 text and the executable bit, hashed; a text with
a replacement character gets no key; a missing path is `absent`).
`hiChangesSince` and `hiChangesFromSnapshot` SHALL leave out a changed path
only when, among the ledger steps of requests whose status is `approved` in
that repository, a chain of one or more steps leads from the path's content
at the base (the blob and mode at the base commit; or the planning
snapshot) to its content now; a key that can't be read, a symlink, a path
that ends absent, a cwd with no git common dir, or a ledger that can't be
read SHALL leave it in (fail closed). So a run in the session worktree after
the capture (which the owner's Approve commits on the session's branch,
REQ-discord-521), with more commits on top or not, is verified and `/work`
opens its PR, while an
edit on top of a captured file, any other `hi/` file, and ledger steps of a
request that was not approved still block. No env var, config key or flag.

Acceptance Criteria
- After an approved capture of two drafts in a talk worktree (one commit on its branch changing only `hi/agent.md`; the main checkout untouched), `hiChangesSince` from the talk's base lists nothing (also with the run's own edit committed on top), and a run there that edits `src/` is verified with the lane run once and no `hi guard` note.
- An extra criterion added on top of the captured file is still listed; a new `hi/notes.md` beside an approved capture is still listed; a ledger step recorded for a request that is still pending allows nothing.
- `openWorkPr` for a tree whose only `hi/` change is an approved capture is not refused with `hi-changed`.
- `tests/agent.hi-draft.test.ts` fails on the base (main) sources and passes after.

## Modified

### REQUIREMENT REQ-agent-520

hi guard (AGENT-18, captured on main from Leif's 2026-09-28 interview: "It
works each repo's own way: …; where it uses hi, it drafts criteria and asks
before capturing, never inventing them; …"; this builds the guard half of the
hi clause). In a repo that uses hi (the start scan merged with a scan now,
`mergeScans`: a `hi/*.md` with `hi:` front matter in the session base, HEAD
or the working tree), when an attempt has something to verify, `runTask`
SHALL, beside the SpecSync coverage check (REQ-agent-518) and before the
lane, compare everything under `hi/` with the session base
(`hiRunChanges(cwd, run)` → `hiChangesSince(cwd, base)` in
`src/agent/repo-ways.ts`: `git diff --name-only base -- hi`, so committed and
uncommitted changes both count, plus `git ls-files --others -- hi`, ignored
files included; git never consults a configured fsmonitor there, and an
assume-unchanged or skip-worktree `hi/` index entry whose file on disk is not
its index blob SHALL count too, while a skip-worktree entry missing from disk
(a sparse checkout) SHALL not; for a run with no git session base,
`hiChangesFromSnapshot` against `hiSnapshot` taken at planning into the run
ledger's `hiStart`). Each changed `hi/*.md` SHALL be
parsed on both sides (`parseHiEntries`: `- **ID**  text` bullets and their
deeper-indented continuation lines, `## Retired` marking retired entries)
so the note names criteria added, removed or reworded and retired entries
changed (retiring a criterion included); every other changed `hi/` path, or
a changed file whose entries did not change, SHALL count as an other-file
change. A path whose change approved captures alone explain (REQ-agent-522)
SHALL be left out first; any change left in any of the three lists,
made by this run or left by an earlier one, SHALL make the attempt a failed
verify with no lane run: one Text note `hi guard: this repo's hi/ changed
since the session base (criteria …; retired entries …; other hi/ files …)
and no approved capture made the change, …; … only what approved captures
made passes …` (five ids or paths per kind,
then "…"; `hiGuardNote`), which SHALL tell the model to undo a hi/ change
this run made and to leave one that was already there for the owner and say
so (the run cannot tell who made it), a `VerifyResult` with `success: false`, the note
as the retry's whole feedback after its "Verification failed" head (joined
with a SpecSync gate note when both apply), and after the retries the failed
result with the stuck ask. A hi/ diff or snapshot that cannot be read SHALL
fail closed (`HI_GUARD_UNREADABLE_NOTE`). The tool loop's hi block
(`renderRepoWaysBlock`) SHALL also say that the file tools refuse every
write, edit and delete under `hi/`, that any hi/ change since the session
base that approved captures did not make keeps the run from being verified
and `/work` from opening a PR, and that criteria change only through a
capture the owner approves on a card — with, when the run is offered
`hi-draft`, how to draft one (REQ-agent-521), else that this run can't. A
run that changed nothing is
not checked. The guard runs only inside Corvidinho runs (this gate,
`github-pr-create` inside a run, REQ-plugins-521) and `/work`'s PR step
(REQ-discord-520): a capture made with the `hi` CLI outside any run that is
already in the session base (on the remote's default branch, or in HEAD at
planning when the repo has none) never blocks, but a `hi/` commit on the
run's own branch that is not yet on the remote's default branch counts as a
change whoever made it, since the run cannot tell.
No env var, config key, flag, NDJSON field or schema.

Acceptance Criteria
- `parseHiEntries` reads criteria, sub-criteria and retired entries (with their continuation lines) and no entries from front matter or prose.
- `hiChangesSince` sorts a reworded criterion (criteria), a retired one (retired), an intent-prose edit (files), a committed new criterion plus an untracked note and an ignored swap file, and a deleted hi file correctly; `hiChangesFromSnapshot` does the same for a non-git project.
- An attempt that edits `hi/agent.md` outside the file tools gets the `hi guard:` note, no lane call and a failed `VerifyResult`; the retry's feedback carries the note; once hi/ is put back the lane runs once and the run is verified.
- An assume-unchanged and a skip-worktree `hi/agent.md` edited on disk (which `git diff` no longer shows) still count; a skip-worktree hi file missing from disk does not.
- The `hi guard:` note says to undo a hi/ change this run made and leave one that was already there for the owner.
- A leftover dirty hi/ edit blocks a run that only touched `src/`; a criterion committed mid-run is still seen; a hi/ change that stays ends failed with the stuck ask; a non-git hi project is blocked the same way.
- No false block: hi/ untouched, a `hi/` without front matter, and a capture committed on main outside any run before the talk branched all end verified.
- `tests/agent.hi-guard.test.ts` fails on the base sources and passes after.
- The `hi guard:` note says only what approved captures made passes; the hi block names `hi-draft` only for a run that is offered it (`renderRepoWaysBlock(ways, { hiDraft })`).
- A `hi/` change that approved captures alone explain is left out of the comparison and the run is verified (REQ-agent-522); anything else under `hi/` still blocks.

