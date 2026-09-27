---
module: cli
change: doctor-reads-channel-and-repo-allowlists-through-the-bridge-and-watch-loader-allowlist-file-plus-env-deny-wins-and
---

# Delta — cli (doctor reports what the bridge, WATCH, task run and daemon will see)

## Modified

### REQUIREMENT REQ-cli-003

`bun src/cli.ts doctor` checks Discord token env presence, `gh auth status`, and whether `fledge` / `specsync` are on PATH, never printing secret values.

Doctor SHALL say what is missing before a long-running surface fails on it
(CLI-4). The `discord` and `github-watch` checks SHALL evaluate the channel
and repo allowlists through the same loader the Discord bridge and GitHub
WATCH use (allowlist file plus env overlays, ALLOW-1..4): the bridge's channel
set (`[discord].channels`, `CORVIDINHO_DISCORD_ALLOW_CHANNELS` and
`DISCORD_CHANNEL_IDS`) and WATCH's repo set (`[github]` repos / orgs and
`CORVIDINHO_GITHUB_ALLOW_REPOS` / `_ORGS`). An entry that is also
deny-listed (file or env) SHALL NOT count (deny wins). A passing line SHALL
name where the usable entries came from (`file`, `env` or `file + env`)
and the count, never the ids, repos or tokens. An allowlist file that exists
but does not load SHALL fail both checks, since the bridge and watch refuse to
start on it. Doctor SHALL print an `llm` line: `[ok]` when
`CORVIDINHO_LLM_API_KEY` or `OPENAI_API_KEY` is set (value not shown),
otherwise `[warn]` saying `task run` uses the demo stub; the `llm` line
SHALL NOT change the exit code. Doctor SHALL print a `data-dir` line for the
shared data dir (`CORVIDINHO_DATA_DIR`, default
`~/.local/share/corvidinho`, MEMORY-1): `[ok]` when it exists and is
writable, `[info]` when it does not exist yet but its nearest existing parent
is writable (doctor SHALL NOT create it), and a failing `[fail]` line (exit 1)
when it is not a directory, cannot be created or is not writable.

Acceptance Criteria
- With `[discord] channels` and `[github] repos` only in the allowlist file (`CORVIDINHO_ALLOWLIST_FILE`), plus token and `CORVIDINHO_WATCH_USERNAME`, doctor prints `[ok] discord` and `[ok] github-watch` naming source `file`, no `[missing]` line, and exits 0 when the other checks pass.
- Env-only entries name source `env`; entries in both name `file + env`; the line gives the usable count.
- A channel or repo that is allowlisted and also deny-listed (env deny over file allow, file deny over env allow) does not count: doctor prints `[missing]` naming deny wins and exits 1.
- A malformed allowlist file fails `discord` and `github-watch` (the bridge / watch refuse to start) even when env allowlists are set.
- No LLM key prints `[warn] llm` naming the demo stub without changing the exit code; `CORVIDINHO_LLM_API_KEY` or `OPENAI_API_KEY` prints `[ok] llm` without the value.
- A writable data dir prints `[ok] data-dir`; a missing one under a writable parent prints `[info] data-dir` and is not created; a data dir that is a file or sits under a file prints `[fail] data-dir` and doctor exits 1.
- Doctor output never contains the token, LLM key, channel ids or repo / org names.
