---
change: plugin-vcs-tools-status-diff-log-branch-commit-push-with-cwd-clamp-no-force-repo-gate-plugin-1-2-safe-1-2-3-github-2-6
artifact: plan
---

# Plan

1. SpecSync change + delta REQ-plugins-182 (plugins module); approve.
2. `plugins/git/exec.ts` (spawn, env, root clamp, scrub) and
   `plugins/git/parse.ts` (porcelain / name-status / push / remote slug).
3. `plugins/git/commands.ts` (seven commands) + `plugins/git/index.ts`;
   wire `loadGitPlugins` in `src/plugins/builtins.ts`.
4. `tests/git.plugins.test.ts` with temp repos (`git init` in mkdtemp),
   isolated git config, a local bare remote and an env/file repo allowlist.
5. Spec: add files to `specs/plugins/plugins.spec.md`, update Purpose /
   Invariants / Error Cases / Change Log and companion testing/context.
6. `bunx tsc --noEmit`, `bun test`, `specsync check --require-coverage 100`,
   commit, `specsync change check --commit`, `specsync change audit`,
   `fledge lanes run verify --non-interactive`; PR (not merged, not
   finalized).
