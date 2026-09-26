---
change: allowlist-file-toml-reader-loads-multi-line-arrays-and-fails-closed-on-anything-it-cannot-parse-so-file-deny-lists-are
artifact: tasks
---

# Tasks

- [x] Regression tests fail on main: multi-line lists dropped, the file-denied repo admitted, git-push pushed, malformed files silently ignored, /admin lost multi-line entries.
- [x] `parseSimpleToml` reads multi-line arrays (trailing comma, `#` comments) and throws on anything it cannot parse in `[github]`, `[discord]` or the top level.
- [x] Single-line corpus (including `allowlist.example.toml`) parses the same as the previous reader.
- [x] `loadAllowlist` throws for an existing file it cannot load; `loadBridgeConfig` returns `code: "allowlist"`.
- [x] /admin round-trips multi-line lists and refuses a malformed file without rewriting it.
- [x] `allowlist.example.toml` documents multi-line lists and the fail-closed rule.
- [x] Deltas: Modified REQ-plugins-006 and REQ-discord-004; new test listed in the plugins spec.
