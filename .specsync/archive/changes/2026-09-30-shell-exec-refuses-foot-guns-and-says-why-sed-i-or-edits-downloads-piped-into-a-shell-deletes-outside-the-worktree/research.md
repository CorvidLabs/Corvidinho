---
change: shell-exec-refuses-foot-guns-and-says-why-sed-i-or-edits-downloads-piped-into-a-shell-deletes-outside-the-worktree
artifact: research
---

# Research

- Probes on the base (read-only, `firstDisallowedCd`): `env -C / ls`,
  `env -C /etc sh -c 'pwd'` and `env --chdir=/ ls` returned null (the
  wrapper was read as unreadable, so its dir was never checked); with
  `root/up -> /`, `cd up && ls`, `pushd up`, `cd up/etc` and
  `ln -s / up && cd up` returned null. `env -S 'sh -c "cd /"'` also passed.
- `isSecretPath` does not match `~/.config/corvidinho/env` / `daemon.env`
  (the secrets env file named in docs/UPDATE.md, docs/BOX-UPDATE.md and
  docs/DAEMON.md), gh's `hosts.yml`, `~/.git-credentials`, `~/.netrc`,
  `/proc/self/environ`, `HEAD:.env` or `--env-file=.env`, so the shell needs
  its own host-secret matcher; `isSecretPath` stays unchanged.
- git: `GIT_CONFIG_GLOBAL=/dev/null` (git >= 2.32) and
  `GIT_CONFIG_NOSYSTEM=1` skip the files where credential helpers and URL
  rewrites live; `GIT_CONFIG_COUNT` / `KEY_n` / `VALUE_n` are read at
  command-line level, after the repo's config, and an empty
  `credential.helper` clears the helper list built so far (URL-scoped
  helpers included, since they feed the same list);
  `GIT_TERMINAL_PROMPT=0` makes a missing credential fail instead of
  prompting; `GIT_SSH_COMMAND` wins over `core.sshCommand`.
- gh reads `hosts.yml` from `GH_CONFIG_DIR` (else `$XDG_CONFIG_HOME/gh`,
  else `~/.config/gh`); an empty dir means logged out.
- cargo fetches git dependencies with libgit2 unless
  `CARGO_NET_GIT_FETCH_WITH_CLI=true`, which makes it use the git CLI (and so
  the env above).
- Bun's piped stdout is not reopenable through `/dev/stdout` in a child (a
  socket), so `ls >/dev/stdout` fails at run time; the redirect is still
  allowed lexically and the tests use `1>&2` end to end.
- Reused: `spawnCapped` (process group, timeout, cap, abort), `buildVerifyEnv`,
  `scrubSecrets`, `isSecretPath`, `resolveAllowlistPath`,
  `isVerifyEnvDropped`, the clamp's tokenizer / readings / script reader.
