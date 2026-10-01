---
change: a-team-member-s-failed-session-or-work-reply-and-someone-else-s-failed-schedule-post-is-checked-for-the-reason-s-401
artifact: context
---

# Context

CI (`smoke`, ubuntu-latest) failed on PR #342, run 36805663978 attempt 1
(job 110189320843); attempt 2 passed. The one failure:

```
(fail) /session start and /work (DISCORD-3.b) > /session: the owner's run shows the reason; a team member's says the owner was told (DMed once) [8.86ms]
613 |       expect(teamBody).not.toContain("401");
error: expect(received).not.toContain(expected)
Expected to not contain: "401"
Received: "Session `sess_e096e6401b2c480a` started.\nTopic: show me a gif of a dog\nWorktree: `/tmp/corvidinho-test-run-WI1eUE/.corvid-worktrees/scoped-talk-sess_e096e6401b2-2407563a166a31b2`\n\nThat didn't work — the owner has been told."
```

The reply is right: the reason never reached it. The `401` is inside the
session id `sess_e096e6**401**b2c480a` (and its worktree path). The check
`not.toContain("401")` was meant to prove the reason's
`401 Unauthorized` never reaches a team member, but the reply also carries
the run's own random ids: `sess_` and `work_` ids are the first 16 hex
digits of `crypto.randomUUID()` (`src/discord/session-store.ts`,
`src/discord/work-store.ts`), the worktree path holds the id's prefix and
a sha256 digest of it (`src/worktree/manager.ts`), and a schedule post
shows `sched_` plus 6 hex digits (`src/scheduler/store.ts`). A v4
UUID's 13th hex digit is always `4`, so a 16-digit id contains `401`
with about 1/256 + 13/4096 ≈ 0.7%; with the digest (and, for `/work`, the
work id) a team member's reply contains `401` by chance in roughly 1 run
in 100; a schedule post in about 1 in 1000.

Reproduced on main (b84c75f): `bun test tests/discord.failed-reply.test.ts
-t "/session start and /work" --rerun-each 600` → 13 of 1200 failed, all at
line 613 `not.toContain("401")`, each with a `sess_`, `work_` or
worktree digest containing `401` (4 `/session`, 9 `/work`). The file
alone passes 3/3 locally because each run draws fresh ids.

Ruled out: the owner-DM dedup map is per bridge (`createFailureOwnerDm`
in `startBridge`), never module-level, and every failure's reply and DMs
were correct (`That didn't work — the owner has been told.`, one DM); no
timer, unawaited promise or `Date.now` window is involved (the failures
show at 10-16 ms with the right body); AGENT-12's idle watchdog and
GITHUB-9's review gate are not on this path (stub agent, no model, no PR).
Chat's `contentEdits` check (line 459) is safe: a chat reply carries no
ids.

Constraints: test-only; no product surface change; no test skipped or
loosened: every byte of the reply other than the run's own ids is still
checked for `401`.
