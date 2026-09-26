---
change: allowlist-file-toml-reader-loads-multi-line-arrays-and-fails-closed-on-anything-it-cannot-parse-so-file-deny-lists-are
artifact: docs
---

# Docs

- `allowlist.example.toml`: the header now shows a multi-line `deny_repos` and says that a file which cannot be read or parsed is refused, never skipped. The bridge, watch and daemon do not start, and gates refuse.
- Doc comments on `parseSimpleToml` and `loadAllowlist` in `src/allowlist/load.ts` describe the subset and the fail-closed rule. `loadBridgeConfig` carries a one-line comment on the new `allowlist` refusal.
- `corvidinho doctor` prints an `allowlist-file` line: `[fail]` with the loader's error (path, line, key; no values) when the file does not load.
- Doc comments on `scanSimpleToml`, `tryLoadAllowlist`, `parseAllowlistText`, `setTomlDiscordList` and the /admin safety net describe the line-aware reader, the gate refusal and the re-read before write.
