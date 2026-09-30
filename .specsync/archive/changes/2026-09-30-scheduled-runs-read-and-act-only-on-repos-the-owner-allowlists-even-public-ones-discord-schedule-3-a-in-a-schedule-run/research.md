---
change: scheduled-runs-read-and-act-only-on-repos-the-owner-allowlists-even-public-ones-discord-schedule-3-a-in-a-schedule-run
artifact: research
---

# Research

Every place a scheduled run can read or act on a remote repo:

| Path | Gate before | After (schedule env) |
|---|---|---|
| `github-*` commands (`plugins/github/commands.ts` `requireRepo`) | `checkRepoGateForActingRole`: community ⇒ confirmed public | allowlist first, no lookup; role rules on top |
| `github-pr-diff` / `github-pr-files` (`review.ts` `gateRepo`) | same gate | same |
| `github-docs-read` / `github-milestone-list` (`public-docs.ts`) | same gate | same |
| `web-fetch` | SAFE-7 per-hop rule; dangerous (never community) | + GitHub-host rule per hop |
| `git-push` | GITHUB-6 allowlist already (`plugins/git`) | unchanged |
| `git` fetch / clone | not built | — |
| files / search | clamped to the worktree | unchanged |
| shell / runners | never in schedules (SAFE-3.a) | unchanged |
| The schedule's project | root, inside root, allowlisted sibling | + nested checkout needs allowlisted origin |

The marker: the scheduler spawns with `sessionId: schedule_<id>`; the spawn
client writes it to `CORVIDINHO_DISCORD_SESSION_ID`. Chat ids are `sess_*`,
`/work` `work_*`, WATCH `wsess_*` (and WATCH does not set the key).
`buildDelegateSpawn` drops only `DISCORD_*`, `CORVIDINHO_ACTING_*` and token
keys, and council voices go through it, so workers keep the marker.

GitHub hosts that serve repo content: `github.com` (`/<owner>/<repo>`),
`api.github.com` (`/repos/<owner>/<repo>`), `codeload.github.com`
(`/<owner>/<repo>/…`), `raw.githubusercontent.com` (`/<owner>/<repo>/…`),
gists (`gist.github.com`, `gist.githubusercontent.com`, no repo) and the
signed release / LFS hosts under `*.githubusercontent.com`.

Existing tests that put a schedule's project in a checkout nested under a
plain bridge root with no origin: `tests/scheduler.worktree.test.ts`,
`tests/discord.session-worktree.test.ts` and one case of
`tests/scheduler.ask-outbox.test.ts`. The verify lane only runs when a run
changed files (or git cannot read the diff), and community schedule runs
have no file tools, so the lane rarely runs with the schedule marker today;
but it inherits `CORVIDINHO_DISCORD_SESSION_ID`, and the full suite run under
a `schedule_*` id fails 13 ROLES-CHAT-8 / team gate tests. The test preload
clears the key (REQ-cli-262), as it clears the other run settings.
