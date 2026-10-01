---
change: its-first-20-replies-in-public-threads-each-wait-for-my-ok-on-an-approve-card-even-text-i-dictated-and-replies-to-me
artifact: context
---

# Context

Issue #97 (M4 "Safe autonomy"), the replies half of AUTONOMY-10 / 10.a. Both
criteria are already captured in `hi/autonomy.md` (AUTONOMY-10 from Leif's
2026-09-28 interview; AUTONOMY-10.a from round 13 on 2026-09-30, captured in
#319), so this change captures nothing new. #319 built the channel-post half
(every `discord-post-message` waits for the `mustask-post` card); the
2026-09-30 rollup on #97 lists "each of its first 20 replies in public
threads" as the one missing piece of AUTONOMY-10 / 10.a.

What was wrong on main (b84c75f):

- A chat answer, an ask pick's answer, a restated question, a `/session
  start` or `/work` answer and a schedule's result or question went straight
  into a public thread (a forum post, an announcement thread) with no card,
  whatever the owner had approved so far.
- `discord-send-file` attached in a public thread with no card.
- The gateway had no way to say whether a channel is a public thread.

Constraints: specs only through SpecSync; no schema version bump (main is
v15; the count is a `schema_meta` key); no new env var or config key beyond
the bridge-to-run stamp; v1 is off-chain; #232/#233 and the parallel
safe3a-cli (`cli.ts`, `shell-gate.ts`) and repo-ways-3 (`loop.ts`,
`src/work/pr.ts`, `plugins/files`) slices are untouched. The Stop button
(#337), failed-run replies (#340, DISCORD-3.b) and the spend card must keep
working. Leif's 2026-09-26 comment on #97 ("the owner can revoke" the
automatic replies after 20) is not captured, so it is not built.
