---
change: it-asks-me-on-an-approve-card-before-touching-prod-or-deploys-or-making-a-channel-post-anything-else-it-just-does-and
artifact: context
---

# Context

Issue #97 (M4 Safe autonomy, must-ask list). Leif confirmed the criteria in
his 2026-09-28 interview (round 4: "capture 4 as new ids AUTONOMY-8..11,
narrowed"); AUTONOMY-8..11 are captured on main in `hi/autonomy.md`:

- **AUTONOMY-9** "It asks before touching prod or deploys (VPS, secrets, env, DNS); updating itself to a tagged release is not a deploy."
- **AUTONOMY-10** "It asks before announcements it starts and before its first 20 replies in public threads; GitHub comments and social posts don't need asking."
- **AUTONOMY-11** "Anything else inside its guardrails, it just does and tells me."

Round 13 (2026-09-30) decided the two design calls captured with `hi` in this
change (first commit):

- **AUTONOMY-9.a** "Any contact with prod asks me first, read-only looks included, and every prod card needs the one-time code."
- **AUTONOMY-10.a** "Every channel post it makes, and each of its first 20 public-thread replies, waits for my OK, even text I dictated and replies to me."

Scope: AUTONOMY-9 / 9.a fully, the channel-post half of AUTONOMY-10 / 10.a
(every `discord-post-message`, the only way the model posts to a channel,
dictated text included) and AUTONOMY-11. The first-20 public-thread replies
are the later must-ask-public change; spend (AUTONOMY-8) stays with the SAFE-8
spend guard (spend-card / spend-caps changes).

What main had (156cfa9): the approvals engine from #316 (kind registry,
`approval_requests`, one-time codes, `storedApprovalKind`) with only the
forget kind registered; no must-ask class on any plugin command and no
policy table (the #97 progress comments say so); `discord-post-message`,
`git-push` of any branch, `shell-exec` / runners / Fledge runs with prod
commands ran with no ask once allowlisted.

Ruled out by the brief: touching `src/agent/execute.ts` (`createTaskExecute`,
tier / provider code — providers-1 builds in parallel) and the #232 / #233
scope. `shell-exec` and the runners are still not offered to any run on main
(SAFE-3.a pending); they are classified now so the gate is in place before
the shell grant (safe3a-gate lands after this).
