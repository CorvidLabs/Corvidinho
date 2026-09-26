---
change: harden-child-process-lifetimes-and-fledge-scoping-issue-112-follow-up-to-154-157-167-fledge-plugin-argv-after-own
artifact: research
---

# Research

- fledge 1.8.0 `plugins run [OPTIONS] <NAME> [ARGS]...`: probed with a scratch
  plugin (isolated `FLEDGE_CONFIG_DIR`, removed afterwards).
  `plugins run echoargs --help` printed fledge's own help (exit 0);
  `plugins run echoargs -- --help` passed `--help` to the plugin;
  `-- --json x --ni` passed all three; `-- -- y` passed `--` and `y` (one
  `--` consumed); `a --json` after a positional already passed through. So a
  single `--` right after the command name is honoured; rejecting
  option-looking argv is not needed.
- Bun 1.4.2 `Bun.spawn({ detached: true })` calls `setsid()`: the child's
  pgid and sid equal its pid; `process.kill(-pid, 'SIGKILL')` killed a
  backgrounded grandchild in the same group.
- A grandchild that calls `setsid` leaves the group; only a `/proc` ppid walk
  (while its parent lives) finds it. Orphans re-parent to init, so the walk
  must be snapshotted before the parent dies.
- Linux keeps a pid reserved while any process uses it as a pgid, so signalling
  a dead leader's group is safe while a remembered member is still in it; a
  bare dead root pid is not trusted (could be recycled).
- Bun: removing the only signal listener and re-raising the signal kills the
  process by that signal (exit via SIGTERM, no `exit` event) — used to keep
  default Ctrl+C semantics once children are detached.
- `process.once` listeners are removed before later listeners run, so the
  forwarding hook must be prepended to count the bridge's handler.
- A signal listener replaces an inherited SIG_IGN, and removing the last
  listener restores SIG_DFL, not SIG_IGN. Reproduced: a Bun parent under
  `trap '' HUP` (as `nohup` sets up; docs/BOX-UPDATE.md restarts the bridge
  that way) survived SIGHUP with nothing tracked but died by SIGHUP with a
  child tracked, and after untracking. Bun reports the inherited ignore in
  `/proc/self/status` `SigIgn` (a `nohup … &` job: HUP, INT, QUIT plus Bun's
  own PIPE/XFSZ), so signals ignored at load are left out of the hook.
- Other spawn sites with timeouts (shell-exec, verify, protocol-version,
  WATCH client) are out of this change's scope; noted as follow-ups.
