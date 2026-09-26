---
change: always-verify-issue-85-agent-4-agent-4-a-fledge-2-discord-and-watch-spawns-stop-passing-no-verify-so-chat-slash
artifact: requirements
---

# Requirements

Captured HI only: AGENT-4, AGENT-4.a, FLEDGE-2 (FLEDGE-3 unchanged: the lane
the agent runs is still `fledge lanes run verify --non-interactive`).

1. Discord (mention, `/session start`, `/work`, schedule) and WATCH spawn argv
   never contains `--no-verify` (FLEDGE-2).
2. The gate fires when a tool reported `filesChanged` OR the real worktree
   changed since the run began: new/untracked, edited, already-dirty-then-edited,
   deleted, renamed, or committed (HEAD moved) paths (AGENT-4).
3. Verify failure with retries left re-enters executing with the lane output
   (AGENT-4.a, unchanged, now reached from bridges).
4. Every non-cancelled result summary carries one fixed plain line: leading
   `Verified: …` (lane passed), leading `Verification FAILED: … — not done.`
   (retries exhausted), leading `NOT verified: …` (operator skip with a
   change), trailing `No files changed — nothing to verify.` (no real change).
5. Failed Discord / slash / schedule replies show `failed (exit N)` and, when
   the lane failed, the FAILED line rebuilt from the template — never model or
   lane text.
6. Not a worktree / git missing / probe error → tool-reported changes decide
   (no crash, no false verify).
7. Tests use temp repos, fake probes and fake bins only; no network, no tokens,
   no repo worktrees or `talk/*` branches.

Left for HI capture (drafts in #85, not built): AGENT-14 (remove every skip
path including operator `--no-verify`), AGENT-15 (diff replaces tool claims;
tests-ran count > 0; deleted-test detection).
