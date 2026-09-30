---
change: shell-exec-refuses-foot-guns-and-says-why-sed-i-or-edits-downloads-piped-into-a-shell-deletes-outside-the-worktree
artifact: testing
---

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
