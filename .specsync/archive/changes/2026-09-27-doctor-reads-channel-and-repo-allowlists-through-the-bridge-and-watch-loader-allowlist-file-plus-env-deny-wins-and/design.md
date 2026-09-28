---
change: doctor-reads-channel-and-repo-allowlists-through-the-bridge-and-watch-loader-allowlist-file-plus-env-deny-wins-and
artifact: design
---

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
