# Lesson bundle — work-ships-a-pr-only-for-admin-owner-per-roles-chat-3-and-only-from-the-work-branch-never-the-base-or-a-switched

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: /work ships a PR only for ADMIN (owner) per ROLES-CHAT-3, and only from the work branch (never the base or a switched/detached HEAD)
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/discord/command-handlers/work.ts, src/work/pr.ts, tests/work.pr.test.ts
- **Acceptance**: non-owner /work never runs the PR step; push refused unless HEAD is the work branch and not the base

## Evidence

- Verification commit: `461d10b7bbc981cba4ee7872f41b5853c057427f`
- Base commit: `155f20af4346b11c10cdbe68526314962a1e09a2`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Review of #166 found /work had no ADMIN check before shipping a PR: any allowlisted non-admin could make the bridge commit, push and open a PR with the operator credentials, bypassing ROLES-CHAT-3. git-push also pushed whatever branch HEAD was on.

## From the change's design.md

# Design

Hoist the ADMIN resolution in the /work handler; non-ADMIN gets a plain line and the PR step never runs. In openWorkPr, before any mutating step, require `symbolic-ref HEAD` == work branch and != base (new skip reason `wrong-branch`).

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-088` | `tests/work.pr.test.ts` | non-owner /work never calls the PR step; switched or detached worktree HEAD returns wrong-branch with no plugin calls and nothing pushed; existing gate/ship tests pass. |

## Where these lessons go

- `specs/discord/context.md`
