---
module: plugins
change: plugin-4-language-runner-plugins-node-exec-python-exec-and-cargo-exec-register-when-node-python3-python-or-cargo-is-on
---

# Delta — plugins (PLUGIN-4 language runners)

## Added

### REQUIREMENT REQ-plugins-313

When `node`, `python3` (else `python`) or `cargo` resolves on an absolute
PATH entry at builtin load, the system SHALL register `node-exec`,
`python-exec` or `cargo-exec` respectively (PLUGIN-4), bound to the absolute
binary found. A relative PATH entry SHALL NOT be used to resolve a runner. Each
runner SHALL be `dangerous: true` and `minTier: 2` (PLUGIN-2), so a
non-interactive run that has not allowlisted it is denied (SAFE-1), every run
is audited (SAFE-5), non-ADMIN role sessions never see or run it
(ROLES-CHAT-2/3), and the tool catalog offers it only at code tier with
dangerous tools included. A runner SHALL spawn `[bin, ...argv]` with the
caller's argv verbatim (no shell, no expansion, its own flags kept) and SHALL
pin the child's cwd to the plugin cwd (project root / task worktree), with no
cwd option. The child SHALL get the verify lane's scrubbed env (no Discord
config, GitHub tokens, audit key, acting identity or LLM keys) without
`CDPATH` / `OLDPWD`, stdin closed, a timeout (exit 124), per-stream output
caps, and its process group killed on timeout or the calling run's abort (exit
130); output SHALL be secret-scrubbed (SAFE-6). A non-zero exit SHALL return
ok=false with that exit code; empty argv SHALL be a usage error (exit 1) that
spawns nothing. `shell-exec` is unchanged. No new slash command, env var or
config key.

Acceptance Criteria
- With stub `node`, `python3` and `cargo` on PATH, `node-exec`, `python-exec` and `cargo-exec` are registered with dangerous=true, mutating=true, minTier=2; a second load keeps the same commands.
- `python-exec` binds `python3` when both `python3` and `python` exist and `python` when only it exists; a toolchain only on a relative PATH entry is not resolved.
- `python-exec` with `` ["-c","x","$(id)","--json","a b","*","--","`id`"] `` reaches the binary as exactly those argv words, with cwd = the project root; a stub exit 3 returns ok=false, exitCode 3.
- The child env has no `GITHUB_TOKEN`, `DISCORD_TOKEN`, `OPENAI_API_KEY`, `CORVIDINHO_AUDIT_HMAC_KEY`, `CORVIDINHO_ACTING_*`, `CDPATH` or `OLDPWD`, and `CORVIDINHO_PROJECT_ROOT` is the project root.
- Non-interactive with an empty allowlist each runner is denied (exit 2, SAFE-1) and nothing is spawned; allowlisted, it runs.
- `buildOpenAiTools` lists the runners at code tier with dangerous tools for ADMIN only; not at tool tier, not without dangerous tools, not for a non-ADMIN session.
- An aborted calling run returns exit 130 and kills the runner's process tree; a run past the timeout returns exit 124 and kills the tree.
- Where real `node` / `python3` / `cargo` are installed, `node-exec -e 'console.log(process.cwd())'` and `python-exec -c 'import os; print(os.getcwd())'` print the project root and `cargo-exec --version` succeeds.

### REQUIREMENT REQ-plugins-314

A language runner whose toolchain is missing SHALL degrade cleanly (PLUGIN-4):
it SHALL NOT be registered, so it is never offered to the model and never
listed as a command; `corvidinho plugins list` SHALL still exit 0 and SHALL
print one line per missing runner naming the missing tool (`<name> not loaded:
<tool> not found on PATH`) next to the runners that loaded and their binary;
every other builtin (`shell-exec`, `files-*`, …) SHALL load unchanged. A
registered runner whose binary can no longer start SHALL return ok=false with
exit 127 and the reason instead of throwing.

Acceptance Criteria
- With an empty PATH (or no PATH) none of the three runners is registered, the load report lists each as missing, and `runnerStatusLines` prints `Language runners (PLUGIN-4): none loaded` and `node-exec not loaded: node not found on PATH`, `python-exec not loaded: python3 / python not found on PATH`, `cargo-exec not loaded: cargo not found on PATH`; `buildOpenAiTools({tier:"code",includeDangerous:true})` has no runner.
- With only `python3` on PATH, only `python-exec` loads and the other two are reported not loaded.
- `loadBuiltins()` with PATH lacking the toolchains still registers `shell-exec` and `files-*`; with only `node` on PATH it also registers `node-exec` alone.
- After a registered stub binary is deleted, calling the runner returns ok=false, exit 127 with `<name>: <tool> could not start`, and the promise does not reject.
- `corvidinho plugins list` with no toolchain on PATH exits 0, lists `shell-exec`, prints the `none loaded` and per-runner `not loaded` lines and lists no runner command; with only `cargo` on PATH it lists `cargo-exec  [dangerous, tier>=2]` and `cargo-exec (<bin>)`.
