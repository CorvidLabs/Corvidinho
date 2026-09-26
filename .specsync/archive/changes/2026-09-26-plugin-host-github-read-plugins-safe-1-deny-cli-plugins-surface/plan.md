---
change: plugin-host-github-read-plugins-safe-1-deny-cli-plugins-surface
artifact: plan
---

# Plan

1. `src/plugins/{types,registry,run,env,builtins}.ts`
2. `plugins/github/` + `plugins/meta/` builtins
3. CLI plugins list/run + non-interactive + doctor count
4. `specs/plugins/` + update `specs/cli`; register in SpecSync
5. Tests: deny-dangerous, fixtures, list smoke; optional live gh gated
6. Local bun test + fledge verify; SpecSync check/audit; draft PR; merge when green
