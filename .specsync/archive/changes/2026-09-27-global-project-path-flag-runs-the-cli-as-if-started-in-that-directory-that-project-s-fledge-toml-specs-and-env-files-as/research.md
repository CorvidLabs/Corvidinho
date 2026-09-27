---
change: global-project-path-flag-runs-the-cli-as-if-started-in-that-directory-that-project-s-fledge-toml-specs-and-env-files-as
artifact: research
---

# Research

Options considered for "loads that project's env":

1. **`process.loadEnvFile` / `util.parseEnv` on `<path>/.env`.** Bun has
   both, but they do not expand `$VAR`, do not pick `.env.<NODE_ENV>` /
   `.env.local`, and never override a key already set, so a key the start
   directory's `.env` set would shadow the project's. Not "as if started
   there".
2. **Re-exec the CLI with `cwd: <path>`.** Exact, but doubles the process,
   needs signal / stdin / exit-code forwarding for the bridge, watch and
   daemon, still inherits the start directory's `.env` values through the
   parent env, and would read the project's `bunfig.toml` (preload runs
   code) unless pinned.
3. **Chosen: probe + chdir in-process.** Read the exec-time env from
   `/proc/self/environ` (Linux-only target; Bun never writes there), run
   `bun --config=/dev/null -e <print env>` once with `cwd: <path>` and that
   env, adopt the result as `process.env`, then `process.chdir(<path>)`.
   Bun's own loader gives exactly the env `cd <path>` would, with no dotenv
   reimplementation; the config pin keeps the project's `bunfig.toml` out
   (same rule as `buildCorvidinhoArgv`).

Consumers already follow the cwd: `loadAgentConfig(cwd)` and the autonomous
gate read `<cwd>/fledge.toml`, Planning reads `<cwd>/specs` through the
SpecSync helpers, plugins / Fledge / SpecSync commands get
`cwd: process.cwd()`, and bridge / watch / daemon take
`projectRoot: process.cwd()`.
