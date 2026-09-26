---
change: safe-6-secret-scrub-before-persist-automatic-re-scrub-issue-66-captured-slice-scrub-vendor-key-looking-secrets-github
artifact: plan
---

# Plan

1. Add `src/store/scrub.ts` and call `ensureScrubbed` from `openCorvidinhoDb`.
2. Wrap write paths in session/work/schedule/memory stores.
3. `tests/store.scrub.test.ts`.
4. Spec delta REQ-discord-066; SpecSync check; fledge verify; PR.
