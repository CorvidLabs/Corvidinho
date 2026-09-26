---
change: allowlist-file-toml-reader-loads-multi-line-arrays-and-fails-closed-on-anything-it-cannot-parse-so-file-deny-lists-are
artifact: docs
---

# Docs

- `allowlist.example.toml`: the header now shows a multi-line `deny_repos` and says that a file which cannot be read or parsed is refused, never skipped. The bridge, watch and daemon do not start, and gates refuse.
- Doc comments on `parseSimpleToml` and `loadAllowlist` in `src/allowlist/load.ts` describe the subset and the fail-closed rule. `loadBridgeConfig` carries a one-line comment on the new `allowlist` refusal.
