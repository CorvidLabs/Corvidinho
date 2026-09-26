---
change: bump-corvidinho-to-0-0-4-for-discord-schedule-that-landed-on-main-62-7d81edc-without-a-version-bump-verbose-changelog
artifact: plan
---

# Plan

1. Bump `package.json` 0.0.3 → 0.0.4 (presence/CLI read this via `src/version.ts`).
2. Rewrite CHANGELOG: new verbose 0.0.4 for `/schedule` + SESSION durable (#61); restore 0.0.3 Ops-only body.
3. Update STATUS.md, `docs/UPDATE.md` REF example, presence comment, and version-asserting tests.
4. `fledge lanes run verify --non-interactive`; open PR; squash-merge when CI green; annotated tag `v0.0.4` (release Action creates Release).
