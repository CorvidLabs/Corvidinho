# Lesson bundle — shell-exec-refuses-foot-guns-and-says-why-sed-i-or-edits-downloads-piped-into-a-shell-deletes-outside-the-worktree

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Shell-exec refuses foot-guns and says why (sed -i or > edits, downloads piped into a shell, deletes outside the worktree, secret reads), env -C and symlinked cd can't leave the root, and the shell and language runners start without GitHub or git credentials (SAFE-21, SAFE-21.a, SAFE-3)
- **Kind**: Feature
- **Specs**: plugins, agent
- **Paths**: plugins/shell/clamp.ts, plugins/shell/commands.ts, plugins/shell/index.ts, plugins/shell/footguns.ts, plugins/runners/commands.ts, tests/shell.footguns.test.ts, tests/shell.clamp-bypass.test.ts, tests/shell.clamp-scripts.test.ts, tests/runners.plugins.test.ts, tests/agent.tool-loop.test.ts, specs/plugins/plugins.spec.md, specs/plugins/testing.md, specs/agent/testing.md, hi/safe.md, INTENT.md, docs/DISCORD-GO-LIVE.md, STATUS.md
- **Acceptance**: shell-exec refuses, before spawning anything and with exit 2 and 'shell-exec refused (SAFE-21): <why>; <what to do instead>', sed -i / --in-place and output redirections to files in the typed command (not /dev/null, stdout, stderr or fd dups); a download run as code (piped into a shell or interpreter, also through env / timeout / sudo / xargs, fed as $(...), <(...) or an expanded string, or saved and then run by the same command); deletes outside the worktree (rm, rmdir, unlink, shred, find -delete / -exec rm, xargs rm, mv, forced ln, git worktree remove / prune), with expanded or input-fed targets failing closed; and secret reads (isSecretPath, Corvidinho's env and allowlist files and config dir, gh / git credential stores, netrc, ssh keys, /proc/<pid>/environ, HEAD:.env, credential env vars, gh auth token, git credential fill, ssh-family commands, anything re-pointing git or gh at credentials); the download, delete and secret checks also read the in-root scripts the command runs; the SAFE-3 clamp also checks env -C / --chdir (and sudo -D / -R) like cd, refuses env -S / sudo -s strings it cannot read, follows symlinks that exist (cd / pushd through an in-root link that points out refuses) and refuses an ln whose target leads out; the shell-exec child and the node / python / cargo runners start without GitHub or git credentials (tokens, askpass, ssh agent dropped; git reads no global or system config, a repo credential.helper is reset, no prompts, ssh offers no key; gh reads an empty config dir), and shell-exec is spawned with the calling run's abort signal, a timeout and an output cap, with its output secret-scrubbed

## Evidence

- Verification commit: `ef2cf382e1facc925aa5855ab940854d859e4e27`
- Base commit: `4d84bd62c561926ebbdbf3a2b5c94f8e6066111b`
- Verified by: `specsync check --spec agent --spec cli --spec plugins`

## From the change's context.md

# Context

Issue #83 (M3 "Real dev teammate"). Leif confirmed SAFE-21 in the
2026-09-28 interview (round 3, "capture as written"; already on main in
`hi/safe.md`): "The shell refuses foot-guns (sed -i or > edits, piping
downloads into a shell, deleting outside the worktree, reading secrets) and
says why." Round 13 (2026-09-30) added the shell-login design call, captured
in this change with `hi` as SAFE-21.a: "The shell and language runners start
without my GitHub or git credentials, so pushes, PRs and merges only happen
through the checked GitHub tools." SAFE-3 ("Shell commands cannot `cd` their
way out of the project root to run elsewhere on my machine.") was only
partly met: read-only probes found `env -C / ls`, `env --chdir=/ ls` and a
`cd` / `pushd` through an in-root symlink to `/` (committed, or made by
`ln -s` in the same command) all passed the lexical clamp.

This is the `safe3a-shell` slice's first split (`safe21-footguns`):
`plugins/shell` plus the runners' child env only. What the model is offered
does not change: `SAFE3_PENDING_TOOLS` still holds the shell, runners and
Fledge runs out of every catalog; the owner grant (SAFE-3.a) is the later
`safe3a-gate` PR. Today the shell runs only through operator
`corvidinho plugins run shell-exec` (and the `includeDangerous` test seam).

Before: `shell-exec` inherited the bot's full `process.env` (LLM, Discord and
GitHub tokens), spawned with `Bun.spawn` with no timeout, output cap or abort
signal, returned unscrubbed output, and refused only SAFE-3 `cd` escapes;
`curl x | sh` was refused by accident with a SAFE-3 "via cd/pushd" message.
The runners already used the verify lane's scrubbed env, but git's global
config (credential helpers), the ssh agent and gh's `hosts.yml` still
reached them.

Constraints kept: #232 / #233 scope untouched; v1 off-chain; no new env var,
config key, flag, slash command, table or schema bump; `specs/` only through
SpecSync; `isSecretPath` unchanged (ROLES-CHAT-8 file tools keep their
behaviour).

## From the change's design.md

# Design

- `plugins/shell/clamp.ts`:
  - The tokenizer records each redirection's operator (`>&2` is an fd dup,
    `> 2` a file) and, per fragment, whether it reads the previous one's
    output (`|`, `|&`; an empty fragment from `| (` passes it on).
  - One walker: the clamp's traversal gains a `strict` flag and an optional
    visitor. `firstDisallowedCd` walks strict (what cannot be checked
    refuses, as before); `forEachSimpleCommand(cmd, root, visit)` walks
    lenient (what cannot be read is skipped: the clamp, run after it, refuses
    it) and hands every simple command — words, redirections, command word,
    upstream pipeline, the in-root script it came from, the live list of
    dirs the shell may be in — to the visitor. Both walks read the same
    ground in the same order, so for a command the clamp accepts the visitor
    sees exactly what the clamp read.
  - Wrappers: `env`, `sudo` and `doas` options are read as getopt clusters
    (`-iC/`, `--ch=..`); `env -C` / `--chdir` and `sudo -D` / `-R` dirs are
    checked like a `cd` target and added to the dirs scripts are looked for
    in; `env -S` and `sudo -s|-i` with a command are opaque and refuse.
    `commandChain` returns each command a simple command runs with the word
    that runs it (a wrapper name, `find`), and follows wrappers behind
    `find -exec`.
  - `isCdEscape` keeps its lexical check and adds `landsOutside`: from the
    root and each dir the shell may be in, `physicalPath` walks the target
    component by component, following existing symlinks (and taking `..`
    after one from the link's target), and the result must stay inside the
    real root; an unwalkable path (dangling or looping link) fails closed.
  - `ln` (symbolic or hard) whose target leads out, expands or starts with
    `~` refuses (a relative symbolic target is read from the link's dir: the
    destination if it is a dir, else its parent; both checked).
  - The refusal message says `via cd/pushd/env -C or a symlink`.
- `plugins/shell/footguns.ts` (new): `firstFootgun(cmd, root, {env, home})`
  collects every simple command with the walker, then checks the families
  most serious first (download, delete, secret, edit) so the reason names
  the worst problem; `footgunRefuseMessage` formats
  `shell-exec refused (SAFE-21): <why>[ (in SCRIPT)]; <instead>`. The
  download family needs the whole command (a downloader anywhere), so the
  checks run after the walk; the delete and secret checks use each command's
  live dir list, so a later `cd` or a loop is covered. The edit family
  checks only commands with `script === null` (the typed text).
- `plugins/shell/commands.ts`: `firstFootgun` → `firstDisallowedCd` →
  `spawnCapped(["sh","-c",…])` with `runnerChildEnv(process.env, root)`,
  `ctx.signal`, the runners' timeout and cap; output through
  `scrubSecrets`; `data.rule` / `family` / `script` on refusals; exit 124 /
  130 / 127 like the runners.
- `plugins/runners/commands.ts`: `withoutGitCredentials` (drop credential
  keys, then `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, an empty
  command-line `credential.helper`, `GIT_TERMINAL_PROMPT=0`, a key-less
  `GIT_SSH_COMMAND`, an empty per-process `GH_CONFIG_DIR`,
  `CARGO_NET_GIT_FETCH_WITH_CLI=true`) inside `runnerChildEnv`, which the
  runners and now `shell-exec` use; `isCredentialEnvKey` is shared with the
  SAFE-21 secret family.
- Trade-offs: lexical checks cannot see what another interpreter does
  (stated residuals); the edit family is typed-text only (a project's own
  scripts redirect all the time); refusing every `>` to a file (and `[[ a > b
  ]]`, read as a redirection) is the conservative reading of "> edits";
  dropping global git config also drops the owner's identity and aliases in
  the shell (commits go through `git-commit`).

## From the change's testing.md

# Testing

Regression tests (fixtures only: temp projects, a temp outside dir, a temp
`HOME` with `~/.config/corvidinho/env` and `~/.netrc`, a local `Bun.serve`
answering 401 for the git credential test, stub runner binaries; no network,
no live tokens). Every refused command starts with `touch spawned`, and each
script writes the marker first, so a refusal that spawned anything fails.

- `tests/shell.footguns.test.ts` (13 tests, new).
- `tests/shell.clamp-bypass.test.ts` (4 new tests: env -C / sudo -D units,
  symlinked cd units, ln units, end to end).
- `tests/runners.plugins.test.ts` (1 new test: credential-free runner env).
- Adjusted: `tests/shell.clamp-scripts.test.ts` and
  `tests/agent.tool-loop.test.ts` write through `tee` instead of `>`.

Fail-on-base proof: the three test files above, copied into a worktree of
`origin/main` (5aaf7f0, `bun install`), give 16 failures — all 15 new shell
tests plus the new runner env test — and pass on this branch (the allowed-path
guards "deletes inside the worktree still run" and "ordinary reads still
run" pass on both, as they should). On this branch: `bunx tsc --noEmit`
clean, full `bun test` green, `fledge lanes run verify --non-interactive`
green.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-494` | `tests/shell.footguns.test.ts` › "SAFE-21 edits: sed -i and > redirections are refused" | `sed -i`, `-ni.bak`, `--in-place`, `find -exec sed -i`, `>`, `>>`, `>&`, a here-doc to a file, `>` inside `$(…)` and `sh -c` refuse (exit 2, `rule: SAFE-21`, family `edit`, reason names files-write / files-edit, nothing spawned); `2>&1`, `>/dev/null`, `>&2`, `1>&2`, `>/dev/stdout`, `2>/dev/stderr`, `&>/dev/null`, `3>&-` allowed; a script's own `>` runs (stated residual). |
| `REQ-plugins-494` | `tests/shell.footguns.test.ts` › "SAFE-21 downloads run as code are refused" | `curl | sh`, `| sudo bash`, `wget -qO- | python3`, `| env sh`, `| timeout 5 bash -s`, `| xargs sh -c`, `sh -c "$(curl …)"`, `eval "$(curl …)"`, `bash <(curl …)`, `. <(curl …)`, `curl -o i.sh && sh i.sh`, `wget …/install.sh && sh install.sh` and `sh dl.sh` (in-root script) refuse with family `download`; data uses (`| jq`, `| python3 -c` literal, braces in the program, `curl -o x.json && cat`) are not refused. |
| `REQ-plugins-494` | `tests/shell.footguns.test.ts` › "SAFE-21 deletes outside the worktree are refused" | `rm -rf` outside, outside globs, `../sibling`, `~/x`, `$TMPDIR/x`, `unlink`, `shred -u`, `find OUTSIDE -delete` / `-exec rm`, `xargs rm`, `mv OUTSIDE .`, `rm -rf .*`, `rm -rf .`, `git worktree remove ../sibling`, `git worktree prune`, `sh del.sh`, a delete through an in-root symlink to outside and through a later `cd` in a loop refuse (family `delete`); victims survive; `rm -rf build && rm -f *.o && find . -name f.txt -delete` runs. |
| `REQ-plugins-494` | `tests/shell.footguns.test.ts` › "SAFE-21 secret reads are refused" | `.env`, `HEAD:.env`, `~/.config/corvidinho/env`, `$CORVIDINHO_ENV_FILE`, `~/.netrc`, `$HOME/.git-credentials`, gh `hosts.yml`, `~/.ssh`, `/proc/self/environ`, `/proc/$PPID/environ`, `grep -r … ~`, `gh auth token`, `git credential fill`, `$GH_TOKEN`, `GIT_SSH_COMMAND=…`, `git -c credential.helper=…`, `ssh`, `sh sec.sh` refuse (family `secret`); `cat README.md && grep -r … .` runs. |
| `REQ-plugins-495` | `tests/shell.footguns.test.ts` › "SAFE-21.a: the child starts without GitHub / git credentials" | `printenv` has no LLM / Discord / GitHub keys, askpass or ssh agent, has `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_TERMINAL_PROMPT=0`, a key-less `GIT_SSH_COMMAND` and a `GH_CONFIG_DIR` outside `HOME` without `hosts.yml`; a marker-writing credential helper in `~/.gitconfig` and in the repo config never runs for `git ls-remote` against a local 401 server. |
| `REQ-plugins-495` | `tests/runners.plugins.test.ts` › "SAFE-21.a: the runners start without GitHub / git credentials" | The node runner's child env drops the token, askpass, agent, inherited git-config and gh-config keys and sets the git / gh / cargo values. |
| `REQ-plugins-495` | `tests/shell.footguns.test.ts` › "shell-exec spawn is bounded and scrubbed" | An aborted run stops `sleep 60` with exit 130 in well under 10 s; 200000 bytes come back truncated; a printed `ghp_…` token is scrubbed. |
| `REQ-plugins-495` | `tests/shell.clamp-bypass.test.ts` › "shell-exec SAFE-3: env -C and symlinked cd can't leave the root" | `env -C /`, `--chdir=/`, `--chdir /etc`, `-iC/`, `--ch=..`, `-C up`, `-C $D`, `sudo -D /`, `find -exec env -C /`, `env -S` refuse; `env -C sub` allowed; `cd up`, `pushd up`, `cd up/etc`, `cd sub && cd out`, `cd nothere/../up` refuse, `cd insub && cd deep` and `cd sub/deep/../..` allowed; `ln -s /`, `ln -sfn /etc`, `ln -s ../../x sub/l`, `ln /etc/hosts`, `ln -s $T` refuse, `ln -s ../sub sub/again` and `ln -s sub l` allowed; end to end the escapes return exit 2 SAFE-3 and spawn nothing, `env -C sub pwd && cd insub && pwd` runs. |
| `REQ-plugins-087` | `tests/shell.clamp-scripts.test.ts` › "shell-exec SAFE-3 scripts end to end" | The written-script case (`… | tee gen.sh >/dev/null; sh gen.sh`) still refuses with SAFE-3 and spawns nothing; the rest of the clamp suites (`shell.plugins`, `shell.clamp-bypass`, `shell.clamp-failclosed`, `shell.clamp-quoting`, `shell.clamp-scripts`) pass unchanged. |
| `REQ-plugins-313` | `tests/runners.plugins.test.ts` | Existing runner tests pass with the shared env; the new SAFE-21.a test covers the credential-free part. |
| `REQ-agent-085` | `tests/agent.tool-loop.test.ts` › "runTask: a real code-tier shell-exec edit reaches the verify gate" | `printf broken | tee app.ts >/dev/null` through the real `shell-exec` reports no `filesChanged`, verify runs once, the run ends `failed` with `filesChanged: ["app.ts"]`. |

## Where these lessons go

- `specs/plugins/context.md`
- `specs/agent/context.md`
