---
id: always-verify-issue-85-agent-4-agent-4-a-fledge-2-discord-and-watch-spawns-stop-passing-no-verify-so-chat-slash
state: draft
type: feature
base_commit: 8011a5595fe9cbd065a01b98d1829c6ee381fd8a
---

# Always verify (issue #85, AGENT-4 / AGENT-4.a / FLEDGE-2): Discord and WATCH spawns stop passing --no-verify so chat, slash, schedule and GitHub-started changes run the project verify lane; the gate also fires on a real worktree delta so edits no tool reported cannot skip it; every task result carries a plain verification line and failed Discord and schedule replies surface the FAILED line instead of only an exit code

## Intent

Always verify (issue #85, AGENT-4 / AGENT-4.a / FLEDGE-2): Discord and WATCH spawns stop passing --no-verify so chat, slash, schedule and GitHub-started changes run the project verify lane; the gate also fires on a real worktree delta so edits no tool reported cannot skip it; every task result carries a plain verification line and failed Discord and schedule replies surface the FAILED line instead of only an exit code

## Affected Canonical Specs

- `agent`
- `cli`
- `discord`
- `watch`

## Acceptance Criteria

- Discord (mention, slash session, slash work, schedule) and WATCH spawn argv never contains --no-verify; a run whose tool reported filesChanged OR whose worktree really changed (untracked, edited, already-dirty-then-edited, committed) runs fledge lanes run verify and retries with the failure output; a run with no real change skips the lane and its summary ends with 'No files changed — nothing to verify.'; passed runs lead with 'Verified: ...', exhausted retries lead with 'Verification FAILED: ... — not done.', operator --no-verify or verify_before_complete=false with a change leads with 'NOT verified: ...'; failed Discord, slash and schedule replies show 'failed (exit N)' plus the rebuilt FAILED line; probe outside a repo or on probe failure falls back to tool reports; fixture tests use temp repos only; SpecSync check, tsc, bun test and fledge verify green

## No-spec Rationale

Not applicable
