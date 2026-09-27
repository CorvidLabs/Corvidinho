---
change: global-project-path-flag-runs-the-cli-as-if-started-in-that-directory-that-project-s-fledge-toml-specs-and-env-files-as
artifact: context
---

# Context

Captured HI **CLI-5** (`hi/cli.md`, not retired with CLI-1/2/6/9): "I can point
it at another project path without `cd`, and it loads that project's env and
`fledge.toml`."

Gap on main (`1c7b6ce`): `parseGlobalFlags` has no project / cwd flag, and
every command reads `process.cwd()`. `corvidinho --project P doctor` exits 1
with `Unknown command: --project`; `corvidinho task run … --project=P` drops
the flag silently (unknown flags after the command fall into `rest` and are
ignored) and runs in the start directory: its `fledge.toml`, its specs, and
the `.env` Bun auto-loaded from there.

Constraints: HI-first (no invented AC; the only captured text is CLI-5); no
slash command, env var or config key; no SQLite schema change; spawned agents
keep `bun --no-env-file --config=/dev/null` (ALLOW-4 / SAFE-1, REQ-cli-085);
secrets never printed (SAFE-6); errors follow REQ-cli-419. Open PRs #232 and
#233 are unrelated and untouched. No open issue tracks CLI-5.

Bun facts checked on 1.4.2 (Linux): Bun auto-loads `.env`,
`.env.<NODE_ENV>` (development when unset) and `.env.local` (not under
`NODE_ENV=test`) from the cwd at start; set variables win; `$VAR`
expansion runs as each file loads. Values Bun adds live only in
`process.env`: `/proc/self/environ` still holds the exec-time env.
`Bun.spawn` without `env` passes the start env, not later `process.env`
edits.
