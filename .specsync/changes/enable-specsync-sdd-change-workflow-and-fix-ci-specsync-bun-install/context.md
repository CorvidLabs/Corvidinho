---
change: enable-specsync-sdd-change-workflow-and-fix-ci-specsync-bun-install
artifact: context
---

# Context

PR #1 CI failed with `specsync: command not found` (install.sh 404). CoS/Leif
override for early Corvidinho CI (2026-09-26):

1. REQUIRED: SpecSync GH Action `CorvidLabs/spec-sync@v6` (version 6.0.0) —
   dedicated workflow. No curl|bash SpecSync.
2. Do NOT require Fledge in GitHub Actions yet.
3. CI = Bun smoke/tests/typecheck + SpecSync Action only.
4. Fledge verify stays in the local/agent SpecSync SDD change cycle.
5. Later: add pinned `CorvidLabs/fledge@` + `lanes run verify` when verify
   lane grows past spec-check.

`strict: false` on the Action because the bootstrap CLI spec is still
`status: draft` (draft warning would fail `--strict`).
