---
id: where-a-repo-uses-hi-it-drafts-criteria-and-asks-the-owner-on-a-card-before-capturing-them-agent-18-hi-drafts
state: implementing
type: feature
base_commit: 387dadab1f9bc11869a512e57dadd54a6e5cac6c
---

# Where a repo uses hi it drafts criteria and asks the owner on a card before capturing them (AGENT-18, hi drafts)

## Intent

Where a repo uses hi it drafts criteria and asks the owner on a card before capturing them (AGENT-18, hi drafts)

## Affected Canonical Specs

- `agent`
- `discord`
- `plugins`

## Acceptance Criteria

- AGENT-18 (captured on main from Leif's 2026-09-28 interview; this builds the 'drafts criteria and asks before capturing' half of its hi clause): in a repo that uses hi, hi-draft is offered only to the owner's and the team's own chat, ask-answer, /session start and /work runs in a git worktree and to a local CLI run nothing spawned, never to community runs, WATCH, schedules or delegate/council workers (role re-resolved at every attempt and call). A call's 1-5 drafts are validated with hi export (new id, declared family, not retired, dotted id under a captured or earlier-drafted parent) and refused when SAFE-6 scrubbing would change one; a refusal records nothing. In a Discord run it records a hi capture request in the module-owned hi_capture_requests table (no schema bump) and ends the run blocked with an ask naming the drafts; in the CLI it records nothing and ends with an ask listing the exact hi commands. The owner's DM card of kind hi on the approvals engine (cvok:hi, class plain) re-checks the owner on every press and again at Approve; Approve makes sure the session worktree is there (re-created on its branch, else fails closed with the request left open) and runs hi <ID> <text> for each draft there, all or nothing, with one SAFE-5 hi-capture-criterion row per criterion, a ledger of what changed under hi/, and one outcome post to the asker. Nobody else's press or reply captures anything; Deny or no answer in 24 h is a no. Cards go out after chat and /work runs and on the engine poll. The hi guard (#348) leaves out exactly what approved captures made (a chain of ledger steps from the base content to now), so a later done or /work PR is not blocked by it; every other hi/ change still blocks. tests/agent.hi-draft.test.ts and tests/discord.hi-card.test.ts fail on the stacked base sources and pass on the branch.

## No-spec Rationale

Not applicable
