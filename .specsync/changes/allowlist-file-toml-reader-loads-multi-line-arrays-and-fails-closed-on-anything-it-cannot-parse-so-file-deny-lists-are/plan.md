---
change: allowlist-file-toml-reader-loads-multi-line-arrays-and-fails-closed-on-anything-it-cannot-parse-so-file-deny-lists-are
artifact: plan
---

# Plan

1. Reproduce on main: add `tests/allowlist.toml-multiline.test.ts` and a `git-push` case in `tests/git.plugins.test.ts`. Both fail on `e8bbd21` (31 of 37 new cases fail; git-push pushes the file-denied repo).
2. Rewrite `parseSimpleToml` so it reads multi-line arrays and fails closed in the allow/deny sections. Keep the lenient reading for other sections.
3. Make `loadAllowlist` throw for a file that exists but fails to load. Wrap `loadBridgeConfig` so it returns `code: "allowlist"`.
4. Update the /admin test fixture for a JSON file that broke after start, and document multi-line lists in `allowlist.example.toml`.
5. Deltas: Modified REQ-plugins-006 and REQ-discord-004. List the new test file in the plugins spec.
