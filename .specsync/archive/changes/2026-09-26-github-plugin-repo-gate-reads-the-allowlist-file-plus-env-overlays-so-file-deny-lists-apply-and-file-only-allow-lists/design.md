---
change: github-plugin-repo-gate-reads-the-allowlist-file-plus-env-overlays-so-file-deny-lists-apply-and-file-only-allow-lists
artifact: design
---

# Design

Resolve the gate's allowlist through the same ALLOW-4 loader WATCH uses:

- `checkRepoGateForActingRole`: when no `cfg` is injected, use
  `await loadAllowlist({ env })` (file + env overlays) instead of
  `configFromEnvOnly(env)`. All GitHub plugin handlers (commands.ts,
  review.ts) already call it, so deny lists from the file now win for both the
  ADMIN/CLI allowlist path and the community public path (ROLES-CHAT-8).
- `githubDeny.ts`: add the promised `checkRepoGateAsync(repo, env)` =
  `checkRepoGate(repo, await loadAllowlist({ env }))`; fix the stale comment.
  The sync `checkRepoGate` keeps its signature (git-push passes a loaded cfg;
  tests pass env maps).
- `src/work/pr.ts`: default gate is `checkRepoGateAsync`; the injectable
  `repoGate` dep may return a promise and is awaited.

The file is re-read per gate call (no cache) so an admin allowlist edit
applies to the next call, like git-push and roles.ts. No new env var, config
key, slash command or plugin. Untrusted issue/PR text is not parsed; only the
explicit `--repo` is gated.
