---
change: shell-exec-cd-pushd-clamp-skips-options-and-before-taking-the-target-so-cd-p-etc-cd-etc-and-cd-cannot-escape-the
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-341` | `tests/shell.plugins.test.ts` | "options and -- before an outside target still refuse": `cd -P /etc && pwd`, `cd -L /etc`, `cd -- /etc`, `cd -PL /etc`, `cd -e /etc`, `cd -@ /etc`, `cd -P -L -- /etc`, `cd "-P" /etc`, `cd -P ../../etc`, `cd -P ~/secrets`, `pushd -n /etc`, `pushd -- /tmp` return the outside target (all returned null on main). |
| `REQ-plugins-341` | `tests/shell.plugins.test.ts` | "lone - (OLDPWD) refuses in every position" (`cd -`, `cd -P -`, `cd -- -`, `pushd -` return `$OLDPWD`) and "options with no target are bare cd (home) and refuse" (`cd -P`, `cd --`, `pushd -n` return `$HOME`); both failed on main. |
| `REQ-plugins-341` | `tests/shell.plugins.test.ts` | "unparseable words (quoting / expansion the lexer cannot resolve) refuse": `cd ""/etc`, `cd ''/etc`, `cd \/etc`, `cd "$(echo /etc)"`, a backtick substitution, `cd {/etc,}`, `cd $OPT /etc` refuse (failed on main). |
| `REQ-plugins-341` | `tests/shell.plugins.test.ts` | "shell-exec refuses cd -P /etc and --command 'cd -- /etc' before spawn": `cd -P /etc && pwd`, `--command "cd -- /etc && pwd"`, `cd -L /etc && pwd` return ok=false, exit 2, SAFE-3, `/etc`, `data.refused` (on main they spawned and printed `/etc`). |
| `REQ-plugins-341` | `tests/shell.plugins.test.ts` | "options before a target inside root stay allowed" (`cd sub/dir`, `cd -P sub/dir`, `cd -L ./crates`, `cd -- sub`, `cd -- -P`, `cd -P /Users/x/proj/sub`, `cd "sub"`, `pushd -n sub` return null) and "shell-exec still runs cd -P sub inside the project" (ok, prints the marker). |
| `REQ-plugins-087` | `tests/shell.plugins.test.ts` | Existing clamp unit allow/refuse tests and the `cd /tmp`, `cd ..`, `cd sub` integration tests still pass unchanged. |
