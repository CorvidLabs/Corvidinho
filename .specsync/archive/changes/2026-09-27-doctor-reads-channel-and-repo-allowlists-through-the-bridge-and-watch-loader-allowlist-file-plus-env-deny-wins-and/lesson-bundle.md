# Lesson bundle — doctor-reads-channel-and-repo-allowlists-through-the-bridge-and-watch-loader-allowlist-file-plus-env-deny-wins-and

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Doctor reads channel and repo allowlists through the bridge and watch loader (allowlist file plus env, deny wins) and names the source, warns when no LLM key is set (task run uses the demo stub) and checks the data dir is writable
- **Kind**: BugFix
- **Specs**: cli
- **Paths**: src/cli.ts, src/doctor.ts, tests/cli.doctor-truth.test.ts, specs/cli/cli.spec.md, docs/DISCORD-GO-LIVE.md, docs/BOX-UPDATE.md
- **Acceptance**: corvidinho doctor loads the Discord channel and GitHub repo allowlists through the same loader as the bridge and watch (allowlist file plus env overlays; a channel or repo that is also deny-listed does not count, deny wins): channels and repos only in the allowlist file give [ok] discord and [ok] github-watch naming the source (file, env or file + env) and exit 0 when everything else is set; every allowlisted entry deny-listed, or an allowlist file that does not load, gives [missing] with exit 1. Doctor prints [warn] llm naming the demo stub when neither CORVIDINHO_LLM_API_KEY nor OPENAI_API_KEY is set (exit code unchanged) and [ok] llm when one is. Doctor prints a data-dir line: [ok] when the data dir exists and is writable, [info] when it does not exist yet but can be created (doctor does not create it), [fail] with exit 1 when it is not a directory, cannot be created or is not writable. No token, key, channel id or repo name is printed. tests/cli.doctor-truth.test.ts covers each case, fails on main and passes with the fix.

## Evidence

- Verification commit: `3ad94241a8f6ed8541ed3cd03e20ac96e93abc34`
- Base commit: `9973a2753d922d3b9871c381d650e0374f0ee8d9`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

The CLI end-to-end check on `origin/main` (v0.0.24, re-verified on
`9973a27`, v0.0.26) found two false doctor results:

- **Defect 7.** With the channel and repo allowlists only in the allowlist
  file (`CORVIDINHO_ALLOWLIST_FILE` with `[discord] channels` and
  `[github] repos`), doctor printed `[missing] discord: token present but
  channel allowlist empty` and `[missing] github-watch: set
  CORVIDINHO_GITHUB_ALLOW_REPOS / ORGS` and exited 1, while `discord bridge`
  and `github watch` start with that file. The `discord` / `github-watch`
  checks in `src/cli.ts` only looked at env vars. The `allowlist-file` line
  (#203, REQ-cli-042) already parsed the file but its lists were not used.
  `docs/DISCORD-GO-LIVE.md` documented the false result as known behaviour.
- **Defect 8.** Doctor did not check the LLM key (`task run` silently uses
  the demo stub and reports `state=done`) or the data dir (a bad
  `CORVIDINHO_DATA_DIR` crashes the bridge and memory plugins while doctor is
  silent).

HI: CLI-4 (`hi/cli.md`): "`init` and `doctor` tell me what is missing
(keys, Fledge, SpecSync, project files) in plain language instead of failing
later mid-task." ALLOW-3 / ALLOW-4 (`hi/allow.md`): Discord listens only in
allowlisted channels; "Allowlists load from config on the bot VM (config file
and/or env)". ALLOW-1 / ALLOW-2 for GitHub repos / orgs. MEMORY-1
(`hi/memory.md`) for the local SQLite data dir. Secrets stay out of logs
(AGENTS.md, SAFE-6).

Constraints: no new env var, command, flag or config key; no
`package.json` / CHANGELOG edit; the `init` half of CLI-4 is out of scope
(no `init` command exists).

## From the change's design.md

# Design

- **New `src/doctor.ts`** holds the doctor checks that need the loaders, so
  `src/cli.ts` stays the command surface. `DoctorCheck` moves there.
- **Same loader.** `loadDoctorAllowlist(env)` resolves the file as
  `loadAllowlist` does for `loadBridgeConfig` / `loadWatchConfig`
  (`resolveAllowlistPath` + exists), reads it once with `loadAllowlistFile`
  (a broken file → `{ ok: false }`, where the bridge / watch refuse), and
  merges the env overlays through `loadAllowlist({ env, preloaded })`, so
  the merged set and the file-only half come from the same read (review:
  the first cut read the file twice). The env-only half is
  `configFromEnvOnly`.
- **Blank tokens.** Token / watch-login presence trims, as the bridge's and
  WATCH's `resolveToken` / `resolveUsername` do (review: `"  "` passed doctor
  while both refused to start).
- **Same sets, deny wins.** Discord: `mergeChannelIds` (the bridge's union
  with `DISCORD_CHANNEL_IDS`), filtered by `checkChannel` (deny first).
  GitHub: `expandWatchRepos` (WATCH's repo + `org/*` set), filtered by
  `isRepoAllowed` (deny orgs / repos first). The source is `file` / `env`
  when a usable entry is in that half. Only counts and sources are printed.
  `AllowlistUsage.denied` counts entries a deny list refuses; the failing
  `github-watch` line says "deny wins" only when every entry is denied, and
  otherwise says no entry is usable (review: a bare `name` repo entry was
  reported as deny-listed).
- **llm.** `loadLlmEnv(env).apiKey` — the same key resolution `task run`
  uses. `ok: true` always (`mark: "warn"` without a key), so it never flips
  the exit code or the box updater.
- **data-dir.** `resolveDataDir(env)` (same as `openCorvidinhoDb`). Existing
  dir: probe by `mkdtemp` + `rmdir` inside it. Missing: walk up to the
  nearest existing parent (what `mkdir -p` would start from) and probe
  there. A real probe instead of `access(W_OK)` because root passes
  `access` where `mkdir` still fails (e.g. `/proc/nope`). Nothing is left
  behind; the data dir itself is never created. Errors show the errno code
  only. A path (or missing ancestor) that `stat` reports missing but
  `lstat` finds is a symlink to nothing: `[fail]`, since `mkdir -p` fails
  on it with EEXIST (review: it read as `[info]` creatable).
- The go-live checklists print when the `discord` / `github-watch` check
  fails, as before.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-003` (allowlist file, defect 7) | `tests/cli.doctor-truth.test.ts` | "channels and repos only in the allowlist file pass, with source file, exit 0": `[ok] discord: token + 1 allowlisted channel(s) from file`, `[ok] github-watch: … 1 allowlisted repo/org entry from file`, no `[missing]`, `All checks passed.`, exit 0. On main: `[missing] discord: … channel allowlist empty` and `[missing] github-watch: set CORVIDINHO_GITHUB_ALLOW_REPOS / ORGS`, exit 1. |
| `REQ-cli-003` (source named) | `tests/cli.doctor-truth.test.ts` | "env-only entries say env; file + env entries say file + env": `DISCORD_CHANNEL_IDS` / `CORVIDINHO_GITHUB_ALLOW_REPOS` → `from env`; file + `CORVIDINHO_DISCORD_ALLOW_CHANNELS` / `CORVIDINHO_GITHUB_ALLOW_ORGS` → `2 … from file + env`. |
| `REQ-cli-003` (deny wins) | `tests/cli.doctor-truth.test.ts` | "deny wins": file channel + env `CORVIDINHO_DISCORD_DENY_CHANNELS`, and env repo + file `deny_repos` → both `[missing] … also deny-listed (deny wins)`, exit 1. |
| `REQ-cli-003` (broken file) | `tests/cli.doctor-truth.test.ts` | "a malformed allowlist file fails discord and github-watch even with env allowlists": `[fail] allowlist-file` plus `[missing] discord: … the allowlist file does not load … the bridge refuses to start` and `[missing] github-watch: … watch refuses to start`, exit 1 (main printed `[ok] discord` from env). |
| `REQ-cli-003` (empty lists unchanged) | `tests/cli.doctor-truth.test.ts` | "no allowlist anywhere still reports the empty channel / repo lists" passes on main and with the fix. |
| `REQ-cli-003` (llm, defect 8) | `tests/cli.doctor-truth.test.ts` | "no LLM key": `[warn] llm: no CORVIDINHO_LLM_API_KEY or OPENAI_API_KEY — task run uses the demo stub`, exit 0. "an LLM key (either name)": `[ok] llm: … present (value not shown)` for `CORVIDINHO_LLM_API_KEY` and `OPENAI_API_KEY`. |
| `REQ-cli-003` (data dir, defect 8) | `tests/cli.doctor-truth.test.ts` | `[ok] data-dir: <dir> exists and is writable`; missing dir under a writable parent → `[info] data-dir: … does not exist yet — created on first use`, exit 0, dir not created; under a regular file → `[fail] data-dir: … cannot be created (<file> is not a directory)`, exit 1; data dir is a file → `[fail] … is not a directory`, exit 1. |
| `REQ-cli-003` (default path) | `tests/cli.doctor-truth.test.ts` | "the default allowlist path … is read too": `HOME/.config/corvidinho/allowlist.toml`, no `CORVIDINHO_ALLOWLIST_FILE` → `[ok] discord … from file`, `[ok] github-watch … from file`, exit 0. |
| `REQ-cli-003` (blank token / login) | `tests/cli.doctor-truth.test.ts` | "a blank token or watch login is missing": `DISCORD_TOKEN="   "`, `GITHUB_TOKEN=" "` → `[missing] discord: missing DISCORD_TOKEN …`, `[missing] github-watch: WATCH needs GITHUB_TOKEN/GH_TOKEN`; blank `CORVIDINHO_WATCH_USERNAME` → `[missing] github-watch: set CORVIDINHO_WATCH_USERNAME`; exit 1. |
| `REQ-cli-003` (unusable repo entry) | `tests/cli.doctor-truth.test.ts` | "a repo entry WATCH cannot use (not OWNER/REPO) is not reported as deny-listed": `[missing] github-watch: no allowlisted repo/org entry is usable`, no "deny-listed" claim, the entry is not printed, exit 1. |
| `REQ-cli-003` (data dir edges) | `tests/cli.doctor-truth.test.ts` | Symlink to nothing (and a path under one) → `[fail] data-dir: … is a symlink to a path that does not exist`, exit 1. Non-root only (`skipIf` root): a `0555` data dir → `[fail] … is not writable (EACCES)`, exit 1, nothing left inside. "the writable probe leaves nothing behind": the data dir is empty after `[ok]`. |
| `REQ-cli-003` (no secrets) | `tests/cli.doctor-truth.test.ts` | Every run asserts the output holds none of the Discord / GitHub tokens, LLM key, channel ids, repo or org names. |
| `REQ-cli-042` (unchanged) | `tests/identity.owner.test.ts`, `tests/allowlist.toml-multiline.test.ts` | Owner, admin-lists and allowlist-file doctor lines and exit-code tests still pass. |
| `REQ-cli-098` (unchanged) | `tests/agent.spend.test.ts` | Doctor `spend` line tests still pass. |

## Automated coverage

- Regression proof: on `origin/main` 9973a27's `src/cli.ts` the new file
  fails 9 of 10 (only the empty-lists guard passes); with the fix all 10 pass.
- Review round (after merging `origin/main` cf8c676): on `origin/main`'s
  `src/cli.ts` the file fails 14 of 16 (empty-lists guard passes; the
  non-root EACCES test is skipped as root); with the first cut's
  `src/doctor.ts` the three review tests (blank token, bare repo entry,
  symlink to nothing) fail; with the review fix all 16 pass as an
  unprivileged user and 15 pass + 1 skip as root.
- Manual re-run of the report's repro (allowlist file with `[discord]
  channels` and `[github] repos`, fake tokens, `CORVIDINHO_WATCH_USERNAME`):
  `[ok] discord … from file`, `[ok] github-watch … from file`,
  `[warn] llm`, `[ok] data-dir`, exit 0. `CORVIDINHO_DATA_DIR=/proc/nope`
  → `[fail] data-dir: /proc/nope cannot be created (ENOENT)`.

## Where these lessons go

- `specs/cli/context.md`
