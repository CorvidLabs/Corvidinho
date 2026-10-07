---
change: shell-exec-refuses-a-specsync-lifecycle-step-written-as-a-glob-or-brace-pattern-or-reached-through-an-expanding
artifact: testing
---

# Testing

`tests/shell.sdd-lifecycle.test.ts`, new describe "glob / brace patterns and
an expanding or xargs-fed subcommand refuse too" (3 tests), with the file's
fake `specsync` / `bunx` on PATH and temp repos only:

1. Through `shell-exec`, from a repo holding files named `specsync`,
   `change` and `approve`: `spec*ync`, `specsyn?`, `[s]pecsync`,
   `env spec*`, `bunx spec*` (literal step: step named), `specsync c?ange
   approve`, `specsync change appr*ve` / `appro?e` / `[a]pprove`,
   `bash -c '… {approve,} c1'` (step null), `bash -c '{specsync,} change
   approve c1'`: exit 2, AGENT-18.a, nothing spawned, tree unchanged.
2. Through `shell-exec`: a function forwarding `"$@"`, `set --` then
   `"$@"`, `change${IFS}approve`, `S='change approve'; specsync $S c1`,
   `… | xargs specsync`, `xargs -n3 specsync`, `xargs -I X specsync X
   approve c1`: exit 2, step null, nothing spawned.
3. `firstLifecycleStep` unit cases: every pattern form and reason, and the
   commands that still run (quoted pattern characters, `cp * "$dest"`,
   `ls * specsync`, `git ls-files | xargs grep -l specsync`,
   `grep -rn specsync "$f"`, `specsync change status "$ID"`,
   `xargs specsync change status` / `check`, `$X "$Y"`).

Fail-on-base proof (`origin/main` 54d6a6c): with main's
`plugins/shell/sdd-lifecycle.ts` and `plugins/shell/clamp.ts` swapped in,
the 3 new tests fail and the 11 earlier ones pass; run one by one through
`shell-exec` on the base, all 18 shell-exec cases exit 0 and spawn the fake
`specsync` with `change approve|review|finalize|ship c1` (or `bunx`).
Restored: 14 of 14 pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-1818` (modified) | `tests/shell.sdd-lifecycle.test.ts` (3 new tests; the 11 earlier ones unchanged) | patterns and expanding / xargs subcommands refused with nothing spawned; read-only and never-run commands still run. Fail on base. |
| all | full `bun test`, `fledge lanes run verify --non-interactive` | run on this branch before push. |
