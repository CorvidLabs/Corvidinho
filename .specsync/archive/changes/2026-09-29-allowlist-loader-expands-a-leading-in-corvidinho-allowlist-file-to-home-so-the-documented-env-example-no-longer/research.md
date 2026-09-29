---
change: allowlist-loader-expands-a-leading-in-corvidinho-allowlist-file-to-home-so-the-documented-env-example-no-longer
artifact: research
---

# Research

- Bun 1.4.2: a project `.env` line `CORVIDINHO_ALLOWLIST_FILE=~/.config/corvidinho/allowlist.toml`
  gives `process.env.CORVIDINHO_ALLOWLIST_FILE === "~/.config/corvidinho/allowlist.toml"`
  (no expansion). A shell `export` without quotes would expand it, which is why
  the bug only shows through `.env` / systemd `EnvironmentFile=` style config.
- `resolveAllowlistPath(env, home)` (`src/allowlist/load.ts`) is the single
  resolver. Callers: `loadAllowlist` / `tryLoadAllowlist` (bridge config,
  WATCH, `checkRepoGateAsync`, Discord plugins, `git-push`), `loadOwnerConfig`
  (`src/identity/owner.ts`), `resolveAdminAllowlistPath`
  (`src/discord/admin-allowlist.ts`), `loadDoctorAllowlist` (`src/doctor.ts`)
  and the `allowlist-file` doctor check (`src/cli.ts`). Each already passes the
  `home` it uses for the default path (`opts.home ?? homedir()`, or
  `env.HOME || homedir()` for `/admin`), so one fix covers all of them.
- Reproduced on `main` (0f2e2c2): temp HOME holding
  `~/.config/corvidinho/allowlist.toml` with `deny_repos = ["corvidlabs/secret"]`,
  project `.env` holding the uncommented `.env.example` line,
  `CORVIDINHO_GITHUB_ALLOW_ORGS=corvidlabs`: `loadAllowlist` returns
  `sourcePath: null`, `checkRepoGateAsync("corvidlabs/secret")` returns
  `{ ok: true }`. `corvidinho doctor` prints
  `[info] allowlist-file: ~/.config/corvidinho/allowlist.toml not found — env overlays only`;
  with the fix it prints `[ok] allowlist-file: <HOME>/.config/corvidinho/allowlist.toml loads`.
- `~user` would need a passwd lookup and is not what the documented example
  uses; Leif ruled it out. A relative value keeps its cwd-relative meaning.
