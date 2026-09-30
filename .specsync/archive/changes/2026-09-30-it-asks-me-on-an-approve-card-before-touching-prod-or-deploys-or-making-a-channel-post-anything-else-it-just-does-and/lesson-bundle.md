# Lesson bundle — it-asks-me-on-an-approve-card-before-touching-prod-or-deploys-or-making-a-channel-post-anything-else-it-just-does-and

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: It asks me on an Approve card before touching prod or deploys or making a channel post; anything else it just does and tells me (AUTONOMY-9/9.a, AUTONOMY-10/10.a channel posts, AUTONOMY-11, #97)
- **Kind**: Feature
- **Specs**: plugins, discord, agent, cli
- **Paths**: src/plugins/must-ask.ts, src/plugins/run.ts, src/plugins/types.ts, plugins/shell/must-ask.ts, plugins/shell/commands.ts, plugins/runners/commands.ts, plugins/fledge/must-ask.ts, plugins/fledge/core.ts, plugins/fledge/commands.ts, plugins/git/commands.ts, plugins/discord/index.ts, src/discord/approval-cards.ts, src/discord/bridge.ts, src/agent/ask.ts, src/agent/events-ndjson.ts, src/cli.ts, tests/must-ask.gate.test.ts, tests/must-ask.classify.test.ts, tests/must-ask.boundary.test.ts, tests/must-ask.regression.test.ts, tests/fixtures/must-ask.ts, tests/agent.events-ndjson.test.ts, tests/discord.allowed-mentions.test.ts, tests/discord.requester-perms.test.ts, tests/git.plugins.test.ts, specs/plugins/plugins.spec.md, specs/plugins/testing.md, specs/discord/discord.spec.md, specs/discord/testing.md, specs/agent/agent.spec.md, specs/agent/testing.md, specs/cli/cli.spec.md, specs/cli/testing.md, hi/autonomy.md, INTENT.md, docs/discord.md, docs/DISCORD-GO-LIVE.md
- **Acceptance**: AUTONOMY-9, AUTONOMY-10, AUTONOMY-11 (captured on main from Leif's 2026-09-28 interview) and AUTONOMY-9.a, AUTONOMY-10.a (captured with hi in this PR from Leif's 2026-09-30 round 13 decisions) hold for this PR's scope: every plugin call goes through one must-ask gate in runPlugin (after the role gate and SAFE-1, before SAFE-5), and its class comes only from the command's own mustAsk class or classifier, never from model text. Prod (AUTONOMY-9/9.a): shell-exec commands that reach another host, run as root or look at or change the box's services, packages, containers, firewall or cron, use a secrets, cloud, hosting, cluster, infrastructure or DNS tool, gh on secrets/variables/workflows/releases or git push from the shell (through exec wrappers, npx, package scripts, make/just recipes and inline interpreter code; unreadable scripts and recipes ask), runner argv/code/scripts, fledge-run/fledge-lanes-run task and lane commands from fledge.toml (unreadable asks), discovered fledge commands by name/argv, and git-push of the remote's default branch or of a usual default or deploy branch name — read-only looks included — wait for the owner's mustask card (class destructive: Approve plus the SAFE-19 one-time code); updating itself with exactly CORVIDINHO_REF=v<X.Y.Z> <installed checkout>/scripts/corvidinho-update.sh for an existing tag runs with no ask. Public (AUTONOMY-10/10.a, channel-post half): every discord-post-message post waits for the plain mustask-post card showing the exact defanged text, dictated text and replies to the owner included; a dry run and a post the tool refuses anyway raise no card. SAFE-20: a deny, no answer within 5 minutes or a stopped run runs nothing and the model gets a refusal saying why; the same denied (tool, args, requester) is refused again with no new card; delegate and council workers get a no-card refusal; with no owner configured the call is refused at once; with no bridge the card lapses and the refusal says so; the run prints the wait as one Text event (task run) or stderr line, and the Discord live status shows it; notes and refusals are secret-scrubbed. AUTONOMY-11: every other builtin runs through runPlugin with no card (a builtin boundary test), and the model's system instructions carry one sentence telling it to just act and say what it did. The first-20 public-thread replies half of AUTONOMY-10/10.a is left to the later must-ask-public change. tests/must-ask.gate.test.ts, tests/must-ask.classify.test.ts and tests/must-ask.boundary.test.ts fail on main and pass here (REQ-plugins-097, REQ-discord-097, REQ-agent-097, REQ-cli-097).

## Evidence

- Verification commit: `a678d26bb3426e5d70d8a81a0bc9d5537bab417c`
- Base commit: `151e9baf38ef7e8d67ffa4271ee8c4af614c9ae6`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec plugins`

## From the change's context.md

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

## From the change's design.md

# Design

- **One gate, in `runPlugin`.** `mustAskGate` runs after the role gate and
  SAFE-1, before SAFE-5 `started` and the handler, for every caller. A
  command declares `mustAsk`: a class or a classifier over its args and the
  files and config they name. Nothing the model says reaches it; a throwing
  classifier asks as prod.
- **Verdicts.** null (run), `ask` (card), `refuse` (the command's own
  refusal, shared with its handler, so the owner is never asked about a call
  that would be refused and a refusal reads the same either way).
- **Cards on the #316 engine.** The engine binds one class per kind, so prod
  is kind `mustask` (destructive: Approve + one-time code, AUTONOMY-9.a) and a
  channel post kind `mustask-post` (plain). Both are `storedApprovalKind`s
  (`mustAskApprovalKinds`), registered by the bridge beside `forget`; Approve
  only records the decision, the waiting run consumes it once. The card shows
  `<tool>: <why>`, the target, an amount line, and the exact text or command
  sent first as quoted data; the title names where it was asked from.
- **Waiting.** In-process, polling the shared DB with the run's abort signal,
  up to `MUST_ASK_CARD_TTL_MS` (5 min, a code constant). One note line goes to
  `setMustAskNotifier` (a Text event in `task run`, stderr otherwise); the
  Discord live status shows it (`progressFromFrame` maps that one Text line to
  "waiting for the owner's OK on an Approve card"). Notes and refusals are
  secret-scrubbed; a run stopped just as the owner approves runs nothing.
- **No is no (SAFE-20).** Deny, lapse and abort run nothing and return a
  refusal that says why. A re-sent denied call (same kind + action hash +
  requester) is refused with no new card. Delegate / council workers: no-card
  refusal. No owner configured: refused at once.
- **Classifiers.** `shell-exec`: the clamp's walker (`forEachSimpleCommand` +
  `commandChain`) over a `PROD_COMMANDS` table, `rsync` / `gh` / `git push`
  special cases, `npx`-style runs, package scripts, `make` / `just` recipes
  (variables substituted), inline interpreter code, scripts by path;
  unreadable forms ask; SAFE-21 / clamp refusals are left to the handler.
  Runners and discovered Fledge commands: table words. `fledge-run` /
  `fledge-lanes-run`: the task / lane commands from the TOML, read like shell
  commands. `git-push`: the remote's recorded default branch, and a usual
  default or deploy branch name whatever default is recorded. Review fixes:
  git / gh subcommands are read past global options and their values, git
  aliases (repo config; `-c alias.…` asks), `bun <script>` / `bun x` / `bun
  exec` / `bun <file>`, `npx -c`, install lifecycle scripts, and
  package-manager options that pick another package.json or workspace (ask).
  Self-update
  exemption: exactly `CORVIDINHO_REF=v<X.Y.Z>` + the installed checkout's
  updater, for an existing tag.
- **AUTONOMY-11.** One sentence in `ASK_AGENT_SYSTEM_INSTRUCTIONS`; a builtin
  boundary test pins that only the must-ask builtins carry a class.

## Design choices pending Leif

1. **`plugins run` typed by hand asks too.** The gate is in `runPlugin`, so an
   operator's own `corvidinho plugins run discord-post-message …` (or a prod
   `shell-exec`) also waits for the DM card (like the GITHUB-9 default "the
   gate applies to every caller"); with no bridge it lapses. No terminal
   prompt (m34 default: SAFE-18 says DM card).
2. **A denied call stays denied.** The same tool + args + target by the same
   requester is refused with no new card for good (no expiry); any change to
   the call asks again, and a lapse never blocks.
3. **Card lifetime 5 minutes** (a constant, like the #316 code TTL): the run
   holds the call that long, then it is a no.
4. **"Prod" is the box and its hosts, by tool.** Any ssh-family contact, root,
   the box's services / packages / containers / firewall / cron, secrets
   tools, cloud / hosting / cluster / infrastructure CLIs, DNS tools, `gh` on
   secrets / variables / workflows / releases, and `git push` from the shell
   ask, read-only looks included (`systemctl status`, `docker ps`, `dig`,
   `terraform plan`). A `web-fetch` of your own site is not recognised as
   prod: there is no prod-host list, and adding one would be a new key.
5. **Unreadable asks.** A package script or recipe that doesn't exist, a
   `make -C` / `-f`, a command named by an expansion, a Fledge task or lane
   step it can't read: all ask. With no `fledge.toml` Fledge runs nothing, so
   nothing asks.
6. **Usual default and deploy branch names always ask.** A push of `main`,
   `master`, `trunk`, `production`, `prod`, `live`, `release`, `stable`,
   `deploy`, `gh-pages` or `default` asks whatever `refs/remotes/<remote>/HEAD`
   records (a git-flow repo's default is `develop` while `main` deploys, and
   the recorded HEAD is local metadata); the recorded default asks too; other
   branches don't (the m34 default says feature pushes never ask).
7. **`discord-send-file` is not gated here.** It attaches a file in the
   conversation's own channel, which reads as part of its reply; replies are
   the must-ask-public change. A dry-run post asks nothing (nothing is
   posted).
8. **Runner and Fledge-plugin checks are lexical.** Table words in argv,
   inline code and an in-root script; `cargo run` and imported modules are
   not followed (see leftover risk).

## From the change's testing.md

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
| `REQ-plugins-097` (classifiers; read-only looks; self-update) | `tests/must-ask.classify.test.ts` | 43 shell forms ask (services, packages, containers, cron, firewall, clusters, infrastructure, hosting, cloud, secrets, `gh` secrets / workflows / releases / api, DNS, `git push`, `npx` / `bunx`, package scripts, make / just recipes with variables, inline code, scripts, wrappers, substitutions, unreadable forms); 12 everyday commands don't; SAFE-21 / clamp refusals are left to the handler; the tagged self-update (typed and `bash`) runs with no ask while no tag, a branch, a missing tag, another override, an argument, another command and a worktree copy ask; runners, `fledge-run` / `fledge-lanes-run` (tasks, deps, npm scripts, lanes with `{ run }`, `{ task }`, `{ parallel }`, unknown forms, Corvidinho's own verify lane with no ask) and `git-push` (recorded default asks, feature doesn't; unrecorded: `main` asks, feature doesn't; `main` / `gh-pages` ask while another default is recorded). Review additions: options and their values before a git / gh subcommand, git aliases (command line and repo config), `bun <script>` / `bun x` / `bun exec` / `bun <file>`, `npx -c`, install lifecycle scripts, package-manager options that pick another package.json or workspace, SSH / cloud / secrets client-library names in free text. |
| `REQ-plugins-097` / `REQ-agent-097` (AUTONOMY-11 boundary) | `tests/must-ask.boundary.test.ts` | Only the must-ask builtins carry a class; every other builtin passes the gate with no card for three arg shapes; real files / search / git / memory / plugins-list calls raise none; each must-ask builtin's everyday call raises none. |
| `REQ-plugins-097` (regressions) | `tests/must-ask.regression.test.ts` | With no owner a real post is refused (`refused (AUTONOMY-10)`, exit 2) and nothing is sent; a push of `main` is refused (`refused (AUTONOMY-9)`) and the remote stays empty. Both fail on base. |
| `REQ-discord-097` | `tests/must-ask.gate.test.ts` ("the bridge's card engine answers the gate's cards"); `tests/discord.allowed-mentions.test.ts`; `tests/discord.requester-perms.test.ts` | On `createApprovalCards` with `mustAskApprovalKinds`, a prod card sends its command first as quoted data, Approve alone runs nothing, Approve + code runs it once; a post card is plain, one press runs the post, Deny runs nothing. The card's text is exactly the posted body; the DISCORD-8 checks run on an approved post. |
| `REQ-agent-097` | `tests/must-ask.boundary.test.ts` ("ASK_AGENT_SYSTEM_INSTRUCTIONS carries …", "tool loop: …") | The sentence is in the constant and in the loop's system message; a files-write runs with no card while the post waits and the owner's no reaches the model as `refused (AUTONOMY-10) … the owner denied it`. |
| `REQ-cli-097` | `tests/must-ask.gate.test.ts`; `tests/must-ask.boundary.test.ts` | The notifier gets the wait line (with the code for prod) and the approval line; with none set the wait line goes to stderr; a lapse's refusal says the bridge DMs the card. |

## Where these lessons go

- `specs/plugins/context.md`
- `specs/discord/context.md`
- `specs/agent/context.md`
- `specs/cli/context.md`
