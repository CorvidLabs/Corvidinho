---
change: discord-send-file-serves-a-thread-allowlisted-by-its-own-id-like-the-bridge-and-re-checks-the-8-mb-cap-on-the-bytes
artifact: tasks
---

# Tasks

- [x] Tests: a thread allowlisted by its own id attaches without its parent; a deny on its parent or on the thread refuses; an unlisted thread under an unlisted parent refuses (fails on `main`).
- [x] Tests: a PNG whose stat reports its pre-growth size but whose bytes read are over 8 MB is refused, nothing checked or uploaded (fails on `main`).
- [x] Tests: an ask-button pick in a thread resumes with the thread and its parent (coverage; passes on `main`).
- [x] `send-file.ts`: gate through `isMonitoredConversation` on the bridge's channel set; re-check the cap after the read.
- [x] Specs: discord Invariants / Error Cases, testing companion; delta REQ-discord-476 (Modified).
- [x] Docs: `docs/discord.md` gate and cap wording; `docs/DISCORD-GO-LIVE.md` step 4 Attach Files.
- [x] SpecSync approve / check / audit / coverage, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
