---
change: shell-exec-safe-3-cd-clamp-skips-cd-options-prefix-words-and-quoting-refuses-cd-expansions-and-cdpath-jumps-and-drops
artifact: testing
---

# Testing

Before the fix, `bun test tests/shell.clamp-bypass.test.ts` gave 1 pass and 5 fail: `firstDisallowedCd` returned null for every reported form, `cd - >/dev/null && pwd` with an outside `OLDPWD`, `cd -P / && pwd` and `{ cd /; pwd; }` ran with ok=true, and an inherited `CDPATH` made `cd sub && pwd` print the outside `sub`. After the fix it gives 6 pass and 0 fail. `tests/shell.plugins.test.ts` stays green.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-087` | `tests/shell.clamp-bypass.test.ts` | `cd - && ls`, `cd -P / && ls`, `{ cd /; rm x; }`, `if true; then cd /; ls; fi` and `CDPATH=/ && cd tmp` are refused by `firstDisallowedCd`. |
| `REQ-plugins-087` | `tests/shell.clamp-bypass.test.ts` | option (`-L --`, `-LP`, `-- -`, `pushd -n`), keyword, `builtin` / `command -p` / `eval`, `X=1`, quoted and backslashed heads, quote-concatenated `..`, `$X`, backtick, glob and `export CDPATH` forms are refused; `cd -P sub`, `cd -- sub`, `{ cd sub; }`, `cd "sub dir"`, `cd ./tmp` with CDPATH and `command -v git` stay allowed. |
| `REQ-plugins-087` | `tests/shell.clamp-bypass.test.ts` | end to end, `cd -` with an outside `OLDPWD`, `cd -P /` and `{ cd /; }` return exit 2 with SAFE-3 before spawn; with an outside `CDPATH` in the bot env, `cd sub && pwd` prints the in-root `sub`. |
| `REQ-plugins-087` | `tests/shell.plugins.test.ts` | existing allow/refuse unit fixtures and the `cd /tmp`, `cd ..` and `cd sub` integration cases still pass. |
