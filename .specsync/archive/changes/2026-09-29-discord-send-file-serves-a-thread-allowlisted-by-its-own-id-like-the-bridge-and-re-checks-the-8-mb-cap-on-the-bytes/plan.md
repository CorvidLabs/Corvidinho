---
change: discord-send-file-serves-a-thread-allowlisted-by-its-own-id-like-the-bridge-and-re-checks-the-8-mb-cap-on-the-bytes
artifact: plan
---

# Plan

1. Regression tests in `tests/discord.send-file.test.ts`: self-allowlisted
   thread (+ deny on parent / thread, unlisted), grown file (stale stat),
   ask-button pick in a thread, a file or folder swapped for a link after
   the path checks. Prove the gate, grown-file and swap tests fail with
   `main`'s `send-file.ts` swapped in.
2. `send-file.ts`: gate through `isMonitoredConversation`; read once from
   one descriptor (`O_NOFOLLOW`, opened path re-checked), capped at the
   limit + 1 byte.
3. Spec prose / Error Cases / testing; delta REQ-discord-476 (Modified,
   full text);
   `docs/discord.md`, `docs/DISCORD-GO-LIVE.md`.
4. `specsync change approve` → `specsync change check --commit` → audit,
   coverage 100, `hi check`, `bunx tsc --noEmit`, `bun test`,
   `fledge lanes run verify --non-interactive`.
