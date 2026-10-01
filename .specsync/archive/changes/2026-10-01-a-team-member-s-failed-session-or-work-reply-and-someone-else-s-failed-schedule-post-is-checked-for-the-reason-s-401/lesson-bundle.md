# Lesson bundle — a-team-member-s-failed-session-or-work-reply-and-someone-else-s-failed-schedule-post-is-checked-for-the-reason-s-401

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: A team member's failed /session or /work reply, and someone else's failed schedule post, is checked for the reason's 401 with the run's own random ids masked, so an id that happens to contain 401 no longer fails the DISCORD-3.b test
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: tests/discord.failed-reply.test.ts
- **Acceptance**: tests/discord.failed-reply.test.ts checks that a team member's failed /session start and /work reply, and someone else's failed schedule post, never show the reason's 401 with the run's own random ids (session, work-task and schedule ids, and the worktree path) masked, so an id that happens to contain 401 no longer fails the test: with every crypto.randomUUID in those tests made to start with 401 the old bare check fails 90 of 90 runs and the new check passes; with natural random ids the /session and /work tests that failed 13 of 1200 runs on main (CI run 36805663978 failed on sess_e096e6401b2c480a) pass 1200 of 1200; no product code changes and the full suite passes

## Evidence

- Verification commit: `dc4d4a5e1813c88497a81f8d26d1fa85cc6b0f9d`
- Base commit: `b84c75fc3e98ce9d51c30ea215f538d53c18ded8`
- Verified by: `specsync check --spec discord`

## From the change's context.md

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

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-032` | `tests/discord.failed-reply.test.ts` "/session: the owner's run shows the reason; a team member's says the owner was told (DMed once)" and "/work: …" | Every `crypto.randomUUID` starts with `401` (`idsWith401`), so the team member's reply shows `sess_401…` (and `work_401…`); the reply with the run's own ids masked (`withoutRunIds`) contains no `401`, and the reply still contains `That didn't work — the owner has been told.` with one DM to the owner. With the old bare check and the pinned ids: 60 of 60 runs fail at that check (`--rerun-each 30`). With the new check: 1200 of 1200 pass pinned, and 1200 of 1200 pass with natural random ids where main failed 13 of 1200 (`--rerun-each 600`). |
| `REQ-discord-032` | `tests/discord.failed-reply.test.ts` "the owner's schedule posts the reason; someone else's says the owner was told (DMed), or only that it didn't work" | With the pinned ids someone else's post shows `sched_401…`; with the schedule id masked it contains no `401` and ends with the told line. Old bare check with the pinned ids: 30 of 30 fail; new check: 600 of 600 pass pinned and 600 of 600 with natural ids. |
| `REQ-discord-032` | the whole file and full `bun test` | All 22 tests of the file pass 30 of 30 runs (`--rerun-each 30`, 660 of 660); the spy is restored after each test. Full suite passes. |

## Where these lessons go

- `specs/discord/context.md`
