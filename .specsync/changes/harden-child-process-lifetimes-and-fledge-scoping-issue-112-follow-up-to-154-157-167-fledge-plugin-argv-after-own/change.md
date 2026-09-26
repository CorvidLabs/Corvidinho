---
id: harden-child-process-lifetimes-and-fledge-scoping-issue-112-follow-up-to-154-157-167-fledge-plugin-argv-after-own
state: draft
type: bug_fix
base_commit: c69e0e2fefdf11d506f55c528035d422973e4f1a
---

# Harden child process lifetimes and Fledge scoping (issue #112 follow-up to #154, #157, #167): fledge plugin argv after --, own process group plus tree kill on timeout or abort for Fledge runs, delegate workers and schedule runs, daemon shutdown kills abandoned runs, Fledge commands scoped to the project root they were discovered for

## Intent

Harden child process lifetimes and Fledge scoping (issue #112 follow-up to #154, #157, #167): fledge plugin argv after --, own process group plus tree kill on timeout or abort for Fledge runs, delegate workers and schedule runs, daemon shutdown kills abandoned runs, Fledge commands scoped to the project root they were discovered for

## Affected Canonical Specs

- `plugins`
- `agent`
- `discord`
- `cli`

## Acceptance Criteria

- fledge-<command> runs fledge plugins run <command> -- <argv> so option-looking argv (--help, --json, --ni) reach the plugin verbatim; Fledge runs, delegate workers and spawned schedule/chat runs start in their own process group and a timeout or abort stops the whole tree (group plus /proc descendants) so a grandchild never outlives the limit; a lead killed by SIGINT/SIGTERM/SIGHUP with no other handler, or exiting, stops its tracked children first; daemon shutdown after the grace kills abandoned runs' process trees, not just records them failed; unused ScheduleStore.markRunStarted is removed; Fledge commands are bound to the project root they were discovered for, loading another root rebinds or removes them, and a command never runs a different root's plugin; SAFE-1 and ROLES-CHAT gates unchanged; fixture tests prove each regression with no network

## No-spec Rationale

Not applicable
