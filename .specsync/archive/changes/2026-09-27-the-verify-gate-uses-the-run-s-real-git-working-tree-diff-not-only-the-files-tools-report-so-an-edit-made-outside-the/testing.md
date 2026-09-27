---
change: the-verify-gate-uses-the-run-s-real-git-working-tree-diff-not-only-the-files-tools-report-so-an-edit-made-outside-the
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-085` | `tests/agent.loop.test.ts` | "an edit made outside file tools (shell-exec) that reports no filesChanged is still verified": temp git repo, the attempt rewrites tracked `app.ts` and reports `[]`, failing lane → `failed`, `verifySkipped=false`, 2 verify calls (`maxRetries: 1`), `filesChanged: ["app.ts"]`, no `done`, Text note names `app.ts`. On main: `done`, 0 verify calls. |
| `REQ-agent-085`, `REQ-agent-002` | `tests/agent.loop.test.ts` | "the same unreported edit ends done verified=true only when verify passes". On main: `verified=false`, no verify. |
| `REQ-agent-085` | `tests/agent.loop.test.ts` | "a new untracked file and a deleted tracked file are detected" (`["app.ts", "src/new.ts"]`); "an edit to a file already dirty before the run is detected (status unchanged, content changed)"; "a commit made through a shell (HEAD moved, clean tree) is detected"; "the first commit on an unborn HEAD is detected". All fail on main. |
| `REQ-agent-085` (AGENT-4.a) | `tests/agent.loop.test.ts` | "a retry after a failed verify that edits via shell is verified again": 2 verify calls, attempt 2 gets the failure output, ends done verified. Fails on main. |
| `REQ-agent-085` | `tests/agent.loop.test.ts` | "an edit in the run's subdirectory of a repo is detected, relative to the cwd": `filesChanged: ["lib.ts"]`, the edit outside the cwd is not counted. Fails on main. |
| `REQ-agent-085` | `tests/agent.loop.test.ts` | "a diff git cannot read after a good snapshot fails closed: verify runs" (seam tracker returns null; Text note). Fails on main. |
| `REQ-agent-085` | `tests/agent.loop.test.ts` | "a huge real diff adds at most WORKSPACE_DIFF_MAX_FILES paths, so the streamed NDJSON result still says verification failed": seam tracker lists 30000 paths; `filesChanged` = 1 tool-reported + 1000, the note counts 30000, and the `result` line parsed in 64 KiB chunks keeps the "Verification failed" summary. Fails with the pre-review loop (30001 paths, line over the 1 MiB parser cap, result dropped). |
| `REQ-agent-085` | `tests/agent.loop.test.ts` | "an already-dirty file past the hash budget is compared by stat: untouched is quiet, edited is caught" (`startWorkspaceDiff(dir, { hashBudgetBytes: 0 })`). Guard. |
| `REQ-agent-085`, `REQ-agent-003` | `tests/agent.loop.test.ts` | Guards (pass on main and branch): "dirt present before the run and left untouched does not trigger verify", "a change only under a gitignored path does not trigger verify", "a non-git cwd falls back to tool-reported filesChanged", "with the gate off (--no-verify) no snapshot is taken and verify is skipped". |
| `REQ-agent-085`, `REQ-agent-008` | `tests/agent.tool-loop.test.ts` | "shell-exec `printf broken > app.ts` reports no filesChanged, yet verify runs and the run is never done": real `shell-exec` via the tool loop (code tier, allowlisted, mock provider) in a temp git repo; one verify call in the repo, `failed`, `filesChanged: ["app.ts"]`. On main: `done`, no verify. |
| `REQ-agent-242`, `REQ-agent-244`, `REQ-agent-002` | `tests/agent.loop.test.ts`, `tests/agent.ask.test.ts`, `tests/agent.tool-loop.test.ts` | Existing union, provider-error, abort, ask and retry tests still pass. |
| `REQ-discord-014` | `tests/spawn.argv.test.ts`, `tests/agent.ndjson-spawn.test.ts`, `tests/agent.loop.test.ts` | Spawn argv tests ("agent-client style argv for .ts (no --no-verify; AGENT-4 / #85)") still hold; the reworded skip clause is the agent loop's real-diff rule, proven by the REQ-agent-085 rows above (untouched pre-run dirt skips, an unreported edit verifies). |
| `REQ-discord-085`, `REQ-watch-085`, `REQ-watch-006` | `tests/discord.*`, `tests/watch.*` spawn argv tests | Spawn argv still has no `--no-verify`; the skip rule they cite is the agent loop's, proven above. |

Fail-on-main proof: with origin/main's `src/agent/loop.ts`, `types.ts` and
`index.ts` swapped in, the two files run 37 pass / 10 fail (the 10 listed
above); restored, 47 pass / 0 fail. Review pass: 49 pass / 0 fail with the
two tests above.

Full suite: `bun test`, `bunx tsc --noEmit`, `specsync check
--require-coverage 100` and `fledge lanes run verify --non-interactive`.
