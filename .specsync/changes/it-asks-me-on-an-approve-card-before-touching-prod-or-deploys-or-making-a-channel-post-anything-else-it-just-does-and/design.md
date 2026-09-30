---
change: it-asks-me-on-an-approve-card-before-touching-prod-or-deploys-or-making-a-channel-post-anything-else-it-just-does-and
artifact: design
---

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
  `setMustAskNotifier` (a Text event in `task run`, stderr otherwise).
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
  commands. `git-push`: the remote's recorded default branch. Self-update
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
6. **Default branch not recorded.** When `refs/remotes/<remote>/HEAD` is not
   recorded, a push of a usual default name (`main`, `master`, `trunk`,
   `production`, `prod`, `live`, `release`, `stable`, `deploy`, `gh-pages`,
   `default`) asks; other branches don't (the m34 default says feature
   pushes never ask).
7. **`discord-send-file` is not gated here.** It attaches a file in the
   conversation's own channel, which reads as part of its reply; replies are
   the must-ask-public change. A dry-run post asks nothing (nothing is
   posted).
8. **Runner and Fledge-plugin checks are lexical.** Table words in argv,
   inline code and an in-root script; `cargo run` and imported modules are
   not followed (see leftover risk).
