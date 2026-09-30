---
module: plugins
change: it-asks-me-on-an-approve-card-before-touching-prod-or-deploys-or-making-a-channel-post-anything-else-it-just-does-and
---

# Delta: plugins (the must-ask gate in runPlugin: prod and deploys, channel posts — AUTONOMY-9/9.a, AUTONOMY-10/10.a, AUTONOMY-11)

## Added

### REQUIREMENT REQ-plugins-097

It asks me before touching prod or deploys (VPS, secrets, env, DNS); updating
itself to a tagged release is not a deploy (AUTONOMY-9). Any contact with prod
asks me first, read-only looks included, and every prod card needs the
one-time code (AUTONOMY-9.a). It asks before announcements it starts
(AUTONOMY-10); every channel post it makes waits for my OK, even text I
dictated and replies to me (AUTONOMY-10.a, channel-post half). Anything else
inside its guardrails, it just does and tells me (AUTONOMY-11). AUTONOMY-9,
-10 and -11 were captured on main from Leif's 2026-09-28 interview; 9.a and
10.a are captured with `hi` in this change from his 2026-09-30 round 13
decisions. The first-20 public-thread replies half of AUTONOMY-10 / 10.a is a
later change.

`runPlugin` SHALL call `mustAskGate` (`src/plugins/must-ask.ts`) for every
caller, after the ROLES-CHAT role gate and the SAFE-1 deny and before the
SAFE-5 `started` row. A call's class SHALL come only from its command's
`PluginCommand.mustAsk` (a `prod` | `public` class, or a classifier over
its args and the files and config they name); nothing the model or a message
says changes it, and a classifier that throws SHALL ask as prod. A `refuse`
verdict (the command would refuse the call anyway) SHALL be returned with no
card. For an `ask` verdict:
- a delegate or council worker (`CORVIDINHO_DELEGATE_DEPTH` > 0) SHALL be
  refused with no card; with no owner configured the call SHALL be refused at
  once (nothing could approve it);
- the same call the owner denied (same card kind and action hash — tool,
  args and target — and the same requester) SHALL be refused with no new
  card (SAFE-20); a changed call asks again and a lapse does not block;
- otherwise one `approval_requests` row SHALL be recorded: kind `mustask`,
  class destructive (Approve plus the SAFE-19 one-time code) for prod, kind
  `mustask-post`, class plain for a channel post; action `<tool>: <why>`,
  the target, the amount (`1 call (no money)` / `1 message (N characters)`),
  the exact text or command as its text, the acting user (or `local`) as
  requester, this process as waiter, `MUST_ASK_CARD_TTL_MS` (5 min) to
  answer; the run SHALL note the wait once (`setMustAskNotifier`, stderr by
  default) and wait with its abort signal;
- only an approval it consumes (`approved` → `used`) SHALL run the call; a
  deny, no answer by the expiry or a stopped run (exit 130) SHALL run nothing
  and return a refusal naming the rule, the request id and why (with no
  bridge the lapse says the bridge DMs the card); every gate refusal SHALL
  append a SAFE-5 `denied` row.

Classes: `discord-post-message` is public for every post (the card's text is
the defanged text that would be posted; a dry run posts nothing and asks
nothing; its channel, requester-flag, token and strict checks run first and
refuse with no card). Prod: `shell-exec` when `shellProdWhy` names a reason —
over the SAFE-3 clamp's walker and every command an exec wrapper runs: the
`PROD_COMMANDS` table (ssh family; root; the box's services, packages,
containers, firewall and cron; secrets tools; cloud, hosting, cluster and
infrastructure CLIs; DNS tools), remote `rsync`, `gh` on secrets,
variables, workflows, releases (and `gh api` on those paths), `git push`,
`npx`-style runs of one, package scripts (with pre/post) from package.json,
`make` / `just` recipes with prerequisites and variables, inline
interpreter code and in-root or `#!` scripts an interpreter or path runs;
an unreadable script or recipe, a make / just file or dir option and a
command named by an expansion ask; a command SAFE-21 or the clamp refuses is
left to the handler. Exactly `CORVIDINHO_REF=v<X.Y.Z>` plus the installed
checkout's `scripts/corvidinho-update.sh` (or `bash` it), nothing else, for
a tag that checkout has, SHALL NOT ask (`isSelfUpdateToTag`); the updater in
any other form asks. The language runners ask on table words in argv and an
in-root script they run; `fledge-run` / `fledge-lanes-run` read the task and
lane commands from `fledge.toml` / `.fledge/lanes/*.toml` and ask for any
that do or can't be read (no fledge.toml: no ask, fledge refuses); a
discovered `fledge-<command>` asks on table words in its name or argv;
`git-push` asks for the remote's recorded default branch, or a usual default
name when none is recorded. Every other builtin SHALL have no class and run
with no ask. No env var, config key or schema change.

Acceptance Criteria
- An approved card runs the call once after it and the request ends `used`; prod is kind `mustask` class destructive, a post kind `mustask-post` class plain with the exact text.
- A deny runs nothing and says so; the same call again is refused with no new card; a changed call asks again.
- No answer by the expiry runs nothing (`expired`), says the bridge DMs the card, and a re-send asks again.
- A delegate worker and a run with no owner are refused with no card; an aborted wait is exit 130; a throwing classifier asks as prod; each refusal is a SAFE-5 `denied` row.
- `discord-post-message` text claiming it needs no OK still raises the card; a dry run and a refused post raise none.
- The shell, runner, Fledge and git-push classifiers ask for the table commands and forms above, read-only looks included, and not for everyday commands; the tagged self-update runs with no ask and every near-miss form asks.
- Only the must-ask builtins carry a class; every other builtin passes the gate with no card.
