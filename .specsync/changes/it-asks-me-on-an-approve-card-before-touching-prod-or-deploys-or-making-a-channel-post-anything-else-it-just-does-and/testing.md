---
change: it-asks-me-on-an-approve-card-before-touching-prod-or-deploys-or-making-a-channel-post-anything-else-it-just-does-and
artifact: testing
---

# Testing

Fixture tests only: a temp data dir per test (the preload's scratch dir
otherwise), a configured owner from env, registered test commands, the real
approvals store and card engine with recording DMs, temp projects, git repos
and bare remotes, a fake provider for the tool loop and a stubbed `fetch` for
Discord; no token, no network.

Fail on base: with this change's tests copied onto the base sources (151e9ba,
main plus the `hi` capture), `tests/must-ask.gate.test.ts`,
`tests/must-ask.classify.test.ts` and `tests/must-ask.boundary.test.ts` cannot
load (no `src/plugins/must-ask.ts`), and both tests of
`tests/must-ask.regression.test.ts` (which imports only modules main has)
fail on what they check: the real post is sent (`fetch` called) and the push
of `main` lands on the remote. On the branch all pass (full suite: see
verify).

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-097` (AUTONOMY-9/9.a: prod asks, card + code) | `tests/must-ask.gate.test.ts` ("approved: the call runs once …", "a classifier that throws asks as prod …") | An approved `mustask` card (class destructive, requester `local`) runs the call once, after it, and the request ends `used`; the wait note names the one-time code; a throwing classifier raises a prod card. |
| `REQ-plugins-097` (SAFE-20) | same file ("denied: …", "no answer in time …", "a delegate or council worker …", "with no owner configured …", "a run stopped while waiting …", "a refusal is on the audit trail") | Deny runs nothing and says so; the same call again is refused with no new card (`resent`), a changed call asks again; a lapse is `expired`, says the bridge DMs the card and does not block a re-send; a worker and a no-owner run get no card; an abort is exit 130 and closes the card; a refusal is a SAFE-5 `denied` row. |
| `REQ-plugins-097` (class from code only) | same file ("discord-post-message text that says it needs no OK …", "the policy table …") | Text claiming the owner already approved still raises the `mustask-post` card with the defanged text; spend / prod / public map to AUTONOMY-8 / -9 / -10, only prod and public raise cards. |
| `REQ-plugins-097` (classifiers; read-only looks; self-update) | `tests/must-ask.classify.test.ts` | 43 shell forms ask (services, packages, containers, cron, firewall, clusters, infrastructure, hosting, cloud, secrets, `gh` secrets / workflows / releases / api, DNS, `git push`, `npx` / `bunx`, package scripts, make / just recipes with variables, inline code, scripts, wrappers, substitutions, unreadable forms); 12 everyday commands don't; SAFE-21 / clamp refusals are left to the handler; the tagged self-update (typed and `bash`) runs with no ask while no tag, a branch, a missing tag, another override, an argument, another command and a worktree copy ask; runners, `fledge-run` / `fledge-lanes-run` (tasks, deps, npm scripts, lanes with `{ run }`, `{ task }`, `{ parallel }`, unknown forms, Corvidinho's own verify lane with no ask) and `git-push` (recorded default asks, feature doesn't; unrecorded: `main` asks, feature doesn't). |
| `REQ-plugins-097` / `REQ-agent-097` (AUTONOMY-11 boundary) | `tests/must-ask.boundary.test.ts` | Only the must-ask builtins carry a class; every other builtin passes the gate with no card for three arg shapes; real files / search / git / memory / plugins-list calls raise none; each must-ask builtin's everyday call raises none. |
| `REQ-plugins-097` (regressions) | `tests/must-ask.regression.test.ts` | With no owner a real post is refused (`refused (AUTONOMY-10)`, exit 2) and nothing is sent; a push of `main` is refused (`refused (AUTONOMY-9)`) and the remote stays empty. Both fail on base. |
| `REQ-discord-097` | `tests/must-ask.gate.test.ts` ("the bridge's card engine answers the gate's cards"); `tests/discord.allowed-mentions.test.ts`; `tests/discord.requester-perms.test.ts` | On `createApprovalCards` with `mustAskApprovalKinds`, a prod card sends its command first as quoted data, Approve alone runs nothing, Approve + code runs it once; a post card is plain, one press runs the post, Deny runs nothing. The card's text is exactly the posted body; the DISCORD-8 checks run on an approved post. |
| `REQ-agent-097` | `tests/must-ask.boundary.test.ts` ("ASK_AGENT_SYSTEM_INSTRUCTIONS carries …", "tool loop: …") | The sentence is in the constant and in the loop's system message; a files-write runs with no card while the post waits and the owner's no reaches the model as `refused (AUTONOMY-10) … the owner denied it`. |
| `REQ-cli-097` | `tests/must-ask.gate.test.ts`; `tests/must-ask.boundary.test.ts` | The notifier gets the wait line (with the code for prod) and the approval line; with none set the wait line goes to stderr; a lapse's refusal says the bridge DMs the card. |
