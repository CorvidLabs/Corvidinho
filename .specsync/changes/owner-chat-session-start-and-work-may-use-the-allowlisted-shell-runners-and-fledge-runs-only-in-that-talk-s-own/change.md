---
id: owner-chat-session-start-and-work-may-use-the-allowlisted-shell-runners-and-fledge-runs-only-in-that-talk-s-own
state: approved
type: feature
base_commit: 507d97b75b08ebe86c5e0c5ab19322ea82d683cb
---

# Owner chat, /session start and /work may use the allowlisted shell, runners and Fledge runs only in that talk's own worktree; non-owners, WATCH, schedules, workers and the local CLI never get them (SAFE-3.a)

## Intent

Owner chat, /session start and /work may use the allowlisted shell, runners and Fledge runs only in that talk's own worktree; non-owners, WATCH, schedules, workers and the local CLI never get them (SAFE-3.a)

## Affected Canonical Specs

- `agent`
- `discord`
- `watch`

## Acceptance Criteria

- createTaskExecute offers the allowlisted shell-exec, node-exec, python-exec, cargo-exec, fledge-lanes-run and fledge-run (SAFE3A_TOOLS, renamed from SAFE3_PENDING_TOOLS) at code tier only when shellToolsGate grants the attempt: delegate depth 0, a role session, no WATCH or schedule marker, a surface stamp (CORVIDINHO_ACTING_SURFACE) of chat, ask, session or work, the acting role re-resolved now as owner (not muted or deny-listed), and a cwd that is the top of the linked talk worktree made for this session (talk-<id>, git admin dir pointing back at it); the owner's chat in its own worktree runs shell-exec there, and a prod command still raises the must-ask Approve card and a deny runs nothing; anywhere else (main checkout, another talk's worktree, a non-git scoped dir, team or community, WATCH, schedules, delegate workers, the local CLI) the tools stay out, the model's call is refused, and one [operator] SAFE-3.a Text line per run says why (never reply text); the gate is re-read every attempt; the Discord spawn client always overwrites CORVIDINHO_ACTING_SURFACE with the caller's surface (chat message chat, ask pick or Answer form ask, /session start session, /work work, schedule tick schedule, none empty) and the WATCH client with watch; workers and the verify lane drop it

## No-spec Rationale

Not applicable
