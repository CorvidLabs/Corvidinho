---
change: always-verify-issue-85-agent-4-agent-4-a-fledge-2-discord-and-watch-spawns-stop-passing-no-verify-so-chat-slash
artifact: design
---

# Design

## Bridges never skip

`src/discord/agent-client.ts` and `src/watch/agent-client.ts` drop `--no-verify`
from the spawn argv: `task run --task <prompt> --output ndjson`. Every Discord
entry point (mention, `/session start`, `/work`, scheduler) and WATCH goes
through these two clients, so one edit each covers them all.

## Real worktree delta (`src/agent/workspace-delta.ts`)

- `snapshotWorkspace(cwd)`: `rev-parse --show-toplevel` → root; `status
  --porcelain=v1 -z --untracked-files=all`; `rev-parse --verify -q HEAD`. Each
  listed path maps to `<XY>:<fingerprint>` (content hash ≤ 4 MiB, else size +
  mtime; symlink target; dir mtime; `absent`). Not a worktree → `null`.
- `workspaceChangedSince(before)`: re-snapshot; paths whose entry differs or
  vanished, plus `diff --name-only before.head after.head` when HEAD moved
  (committed work leaves a clean status).
- Content fingerprints catch an already-dirty file edited again (same porcelain
  line before and after).
- The runner strips `GIT_DIR` / `GIT_WORK_TREE` / `GIT_INDEX_FILE` / … (a hook
  env must not redirect the probe) and sets `GIT_OPTIONAL_LOCKS=0` so status
  never takes `index.lock`. Spawn errors → treated as "not a worktree".
- `WorkspaceProbe` is injectable via `RunTaskOptions.workspaceProbe`
  (default: real probe; `null` = off).

## Loop hook (`src/agent/loop.ts`)

Baseline snapshot once after Planning. After each execute: `changed =
filesChanged.length > 0 || delta.length > 0`; `wantVerify = verifyBeforeComplete
&& changed`. A delta with no tool report emits a `Text` event (AGENT-8). Probe
errors fall back to tool reports only. Retry/feedback flow is unchanged.

## Plain verification line (`src/agent/verify-report.ts`)

Fixed templates, never model or lane output:

| Outcome | Placement | Text |
|---|---|---|
| passed | leading | `Verified: the project verify lane passed (fledge lanes run verify).` |
| failed | leading (existing lane-output block kept after) | `Verification FAILED: the project verify lane did not pass after N retries — not done.` |
| gate off + change | leading | `NOT verified: the verify gate is off (--no-verify or verify_before_complete=false), so the changed files were not checked.` |
| no change | trailing | `No files changed — nothing to verify.` |

Leading placement survives the ~1800-char chat truncation; the no-change note
trails so a chat answer still reads first. `TaskResult` shape is unchanged
(`summary` carries the line), so `--json`, NDJSON `result` and
`summarizeTaskResult` need no edits.

`describeFailedRun({exitCode, summary})` returns `failed (exit N)` plus the
FAILED line rebuilt from the template when the summary carries it (regex on the
exact template; the retry count is the only captured value). Hooked into the
four failure bodies: bridge mention reply, `/session start`, `/work`, scheduler.

## Not changed

`--no-verify` and `verify_before_complete=false` stay as operator escape hatches
(removing them is draft AGENT-14). `filesChanged` in `TaskResult` stays
tool-reported (replacing it with the diff is draft AGENT-15). No schema, no new
env var, no new slash command.
