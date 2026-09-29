---
change: a-deny-listed-thread-under-an-allowlisted-parent-is-refused-silently-on-every-path-deny-wins-discord-5-req-plugins-005
artifact: context
---

# Context

W12 bug sweep (Leif's 2026-09-28 interview, Wave 0: "W12 bug sweep (2
confirmed seeds)"), verified defect `thread-deny-listed-still-served`
(severity major, security cross-cut). No new hi criteria: the fix enforces
already-captured ones. REQ-plugins-005: "Allowlists SHALL default-deny: …
Discord channel/role/user checks (ALLOW-1..5, GITHUB-6, DISCORD-5). Deny
overrides always win."; DISCORD-5: "It only listens and posts in channels I
allowlisted."; ALLOW-3; ADMIN-3.c ("As owner I can change deny lists").
REQ-discord-212 accepts "the thread's parent channel … or the thread itself",
but with REQ-plugins-005 an explicit deny on the thread has to win over its
allowed parent.

Before (origin/main 310861f; re-checked on 0f2e2c2 after #233 landed): with `channels = [parent-1]` and
`deny_channels = [thread-denied]`, `checkChannel("thread-denied")` refused
the thread, but `routeMessage` started a session for the owner's @mention in
it (the parent passed first), `componentChannelAllowlisted` accepted a press
there, restart recovery's `mayPost` ORed in the parent, and
`discord-send-file` gated only the parent. End to end the agent ran once and
the answer was posted in the denied thread. Slash (`gateChannel` on the
thread id) and `discord-post-message` (`checkChannel` on the channel given)
already refused the thread, so the gates disagreed.

Interview design calls for this slice: minimal fix per the record; deny
always wins over an allowlisted parent on chat, thread, slash, button and
schedule paths; silent refusal per DISCORD-DENY rules; fail-on-main tests;
kind bug-fix. Constraints kept: #232 / #233 scope untouched (#232 added the
actor and mute/rate gates to presses, not channel deny); v1 off-chain; no new
slash command, env var, config key, table or schema bump; `specs/` only
through SpecSync.
