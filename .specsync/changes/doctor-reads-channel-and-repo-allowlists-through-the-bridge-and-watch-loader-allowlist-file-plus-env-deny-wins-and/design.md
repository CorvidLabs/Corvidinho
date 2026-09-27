---
change: doctor-reads-channel-and-repo-allowlists-through-the-bridge-and-watch-loader-allowlist-file-plus-env-deny-wins-and
artifact: design
---

# Design

- **New `src/doctor.ts`** holds the doctor checks that need the loaders, so
  `src/cli.ts` stays the command surface. `DoctorCheck` moves there.
- **Same loader.** `loadDoctorAllowlist(env)` calls `loadAllowlist({ env })`
  exactly as `loadBridgeConfig` / `loadWatchConfig` do (file resolved by
  `resolveAllowlistPath`, env overlays merged; a broken file throws →
  `{ ok: false }`). For the source it also keeps the file-only lists
  (`loadAllowlistFile(sourcePath)`) and the env-only lists
  (`configFromEnvOnly`).
- **Same sets, deny wins.** Discord: `mergeChannelIds` (the bridge's union
  with `DISCORD_CHANNEL_IDS`), filtered by `checkChannel` (deny first).
  GitHub: `expandWatchRepos` (WATCH's repo + `org/*` set), filtered by
  `isRepoAllowed` (deny orgs / repos first). The source is `file` / `env`
  when a usable entry is in that half. Only counts and sources are printed.
- **llm.** `loadLlmEnv(env).apiKey` — the same key resolution `task run`
  uses. `ok: true` always (`mark: "warn"` without a key), so it never flips
  the exit code or the box updater.
- **data-dir.** `resolveDataDir(env)` (same as `openCorvidinhoDb`). Existing
  dir: probe by `mkdtemp` + `rmdir` inside it. Missing: walk up to the
  nearest existing parent (what `mkdir -p` would start from) and probe
  there. A real probe instead of `access(W_OK)` because root passes
  `access` where `mkdir` still fails (e.g. `/proc/nope`). Nothing is left
  behind; the data dir itself is never created. Errors show the errno code
  only.
- The go-live checklists print when the `discord` / `github-watch` check
  fails, as before.
