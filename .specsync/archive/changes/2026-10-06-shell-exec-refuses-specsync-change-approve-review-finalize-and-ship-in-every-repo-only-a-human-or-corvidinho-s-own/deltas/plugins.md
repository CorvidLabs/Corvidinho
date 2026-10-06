---
module: plugins
change: shell-exec-refuses-specsync-change-approve-review-finalize-and-ship-in-every-repo-only-a-human-or-corvidinho-s-own
---

# Delta: plugins (shell-exec never approves, reviews or finalizes a SpecSync change — AGENT-18.a)

## Added

### REQUIREMENT REQ-plugins-1818

AGENT-18.a in the shell (captured on main, `hi/agent.md`, from Leif's
2026-09-28 interview, round 13: "On Corvidinho it may approve and archive
its own SpecSync change once verify is green; in other repos a human
approves, reviews and finalizes."). `shell-exec` SHALL refuse
`specsync change approve|review|finalize|ship` in every repo, with no repo
check and synchronously, before the SAFE-21 check (REQ-plugins-494), the
SAFE-3 clamp and any spawn: ok=false, exit 2, `data.refused` true with
`rule: "AGENT-18.a"`, `step` (`approve`, `review`, `finalize` or
`ship`; null when it can't be read) and the in-root `script` it was found
in (null for the typed command), and the message
`shell-exec refused (AGENT-18.a): <invocation> would <step> a SpecSync change
from the shell[ (in SCRIPT)], which the shell never does in any repo;
<HUMAN_LIFECYCLE_LINE without "refused: ">, through its own settle step and
never the shell`. The check (`lifecycleRefusal` / `firstLifecycleStep`,
`plugins/shell/sdd-lifecycle.ts`) SHALL read every simple command over the
SAFE-21 ground through the same walker (`forEachSimpleCommand`: the dash
and bash readings, `eval` / `trap` / shell `-c` strings, command
substitutions, and the in-root scripts the command runs in a shell). An
invocation SHALL start at any word named `specsync` (by basename; an
npm-style `specsync@<version>` or `@scope/specsync` too), so every exec
wrapper (`env`, `timeout`, `nohup`, `xargs`, `sudo`, `exec`,
`find -exec`) and package runner (`bunx`, `npx`) in front of it is
covered; at a command word (`commandChain` link) that is a path to an
existing link whose target is named `specsync`; and at a command word that
expands, where only a literal step refuses. Its step SHALL be the first word
past SpecSync's options after `change` (every `change` the subcommand scan
reaches past options and what may be their values is read); a word right
after an option (no `=`) may be that option's value or the step, so a
lifecycle step there SHALL count. A step that expands SHALL refuse, and
under `xargs` a missing step, or one that is not another `specsync change`
subcommand, SHALL refuse (xargs supplies it). `shellProdWhy` (AUTONOMY-9)
SHALL classify no command this check refuses, so no Approve card is raised
for it. Read-only `specsync change status|list|show|check|ship-status` and
`specsync check` SHALL still run. `runTask`'s settle after a green lane
(REQ-agent-519) is unchanged: on Corvidinho the SpecSync plugin's approve and
finalize tools (REQ-plugins-519) spawn `specsync` themselves, never through
the shell. Residual (stated, not checked): code an interpreter runs
(`bun -e`, `node -e`, `python -c`, a script handed to `node` /
`python`, the `node-exec` / `python-exec` / `cargo-exec` runners) that
spawns specsync itself is not parsed; neither are package-manager scripts,
`make` / `just` recipes and git aliases, nor a copy of the binary under
another name or a link the same command makes. No new command, env var,
flag, config key or schema.

Acceptance Criteria
- In a SpecSync repo, a plain folder and on Corvidinho with the run's own change right after a green lane, `specsync change approve|review|finalize|ship c1` through `shell-exec` returns exit 2 with `shell-exec refused (AGENT-18.a): …` and `HUMAN_LIFECYCLE_LINE`; nothing is spawned, `state.json` is unchanged, no `approvals.json` / `review.json` is written and nothing moves to `.specsync/archive`.
- The same through `sh -c` / `bash -c`, `eval`, `$(…)`, backticks, a function, `env` / `timeout` / `nohup` / `xargs` / `sudo` / `exec` / `find -exec`, an absolute or relative path or a link to the binary, `bunx` / `npx`, options before the step, an expanding step or command word, and an in-root script run with `sh x.sh`, `. ./x.sh` or `./y.sh` (naming it).
- `specsync change status|list|show|check|ship-status` and `specsync check` still run; `shellProdWhy` returns null for a refused lifecycle command.
- On Corvidinho the `specsync-change-approve` tool still spawns `change approve c1 --actor corvid-agent`; `tests/agent.repo-ways.test.ts` passes unchanged.
- `tests/shell.sdd-lifecycle.test.ts` fails on the base sources and passes after.
