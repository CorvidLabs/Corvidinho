---
change: safe-6-secret-scrub-before-persist-automatic-re-scrub-issue-66-captured-slice-scrub-vendor-key-looking-secrets-github
artifact: research
---

# Research

- Write paths: `src/discord/session-store.ts` persistSession,
  `src/discord/work-store.ts` persist, `src/scheduler/store.ts`
  persistInsert/persistUpdate/markRunFinished, `src/memory/store.ts`
  store/override.
- Merlin `redact.rs` pattern shapes; replacement keeps a kind label only.
