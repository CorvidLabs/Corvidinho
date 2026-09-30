---
id: shell-exec-refuses-foot-guns-and-says-why-sed-i-or-edits-downloads-piped-into-a-shell-deletes-outside-the-worktree
state: verifying
type: feature
base_commit: 4d84bd62c561926ebbdbf3a2b5c94f8e6066111b
---

# Shell-exec refuses foot-guns and says why (sed -i or > edits, downloads piped into a shell, deletes outside the worktree, secret reads), env -C and symlinked cd can't leave the root, and the shell and language runners start without GitHub or git credentials (SAFE-21, SAFE-21.a, SAFE-3)

## Intent

shell-exec refuses foot-guns and says why (sed -i or > edits, downloads piped into a shell, deletes outside the worktree, secret reads), env -C and symlinked cd can't leave the root, and the shell and language runners start without GitHub or git credentials (SAFE-21, SAFE-21.a, SAFE-3)

## Affected Canonical Specs

- `plugins`
- `agent`

## Acceptance Criteria

- shell-exec refuses, before spawning anything and with exit 2 and 'shell-exec refused (SAFE-21): <why>; <what to do instead>', sed -i / --in-place and output redirections to files in the typed command (not /dev/null, stdout, stderr or fd dups); a download run as code (piped into a shell or interpreter, also through env / timeout / sudo / xargs, fed as $(...), <(...) or an expanded string, or saved and then run by the same command); deletes outside the worktree (rm, rmdir, unlink, shred, find -delete / -exec rm, xargs rm, mv, forced ln, git worktree remove / prune), with expanded or input-fed targets failing closed; and secret reads (isSecretPath, Corvidinho's env and allowlist files and config dir, gh / git credential stores, netrc, ssh keys, /proc/<pid>/environ, HEAD:.env, credential env vars, gh auth token, git credential fill, ssh-family commands, anything re-pointing git or gh at credentials); the download, delete and secret checks also read the in-root scripts the command runs; the SAFE-3 clamp also checks env -C / --chdir (and sudo -D / -R) like cd, refuses env -S / sudo -s strings it cannot read, follows symlinks that exist (cd / pushd through an in-root link that points out refuses) and refuses an ln whose target leads out; the shell-exec child and the node / python / cargo runners start without GitHub or git credentials (tokens, askpass, ssh agent dropped; git reads no global or system config, a repo credential.helper is reset, no prompts, ssh offers no key; gh reads an empty config dir), and shell-exec is spawned with the calling run's abort signal, a timeout and an output cap, with its output secret-scrubbed

## No-spec Rationale

Not applicable
