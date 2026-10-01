---
id: in-a-hi-repo-it-never-changes-the-criteria-itself-any-hi-change-no-approved-capture-made-blocks-done-and-the-pr-agent
state: approved
type: feature
base_commit: b84c75fc3e98ce9d51c30ea215f538d53c18ded8
---

# In a hi repo it never changes the criteria itself: any hi/ change no approved capture made blocks done and the PR (AGENT-18, hi guard)

## Intent

In a hi repo it never changes the criteria itself: any hi/ change no approved capture made blocks done and the PR (AGENT-18, hi guard)

## Affected Canonical Specs

- `agent`
- `plugins`
- `discord`

## Acceptance Criteria

- AGENT-18 (captured on main from Leif's 2026-09-28 interview; this builds the guard half of its hi clause, 'never inventing them'): in a repo that uses hi, any change under hi/ since the session base that no approved capture made blocks done and the PR, and since no run can make an approved capture yet, every hi/ change a run makes or leaves blocks. runTask's gate (next to the SpecSync coverage check, before the lane) compares hi/ at the session base (repoWaysBase; a planning snapshot when there is no git base) with the working tree: a criterion added, removed or reworded, a retired entry changed, or any other hi/ file (committed, dirty, untracked or ignored) is a failed verify with one 'hi guard:' note naming them and no lane run, the retry's feedback, then failed with the stuck ask; unreadable fails closed. openWorkPr refuses with reason hi-changed before commit, push and the fallback re-verify when hi/ differs from the merge-base. files-write, files-edit and files-delete refuse every path under hi/ in hi repos with 'refused (AGENT-18): ...' (reads unaffected), and the tool loop's hi block says so. Commits made outside a Corvidinho run are not checked. tests/agent.hi-guard.test.ts fails on the base sources and passes on the branch.

## No-spec Rationale

Not applicable
