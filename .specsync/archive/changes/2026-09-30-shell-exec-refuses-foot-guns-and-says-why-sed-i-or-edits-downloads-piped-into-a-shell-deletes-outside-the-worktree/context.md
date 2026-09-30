---
change: shell-exec-refuses-foot-guns-and-says-why-sed-i-or-edits-downloads-piped-into-a-shell-deletes-outside-the-worktree
artifact: context
---

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
