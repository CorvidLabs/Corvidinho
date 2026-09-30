---
change: shell-exec-refuses-foot-guns-and-says-why-sed-i-or-edits-downloads-piped-into-a-shell-deletes-outside-the-worktree
artifact: design
---

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
