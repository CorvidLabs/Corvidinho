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

Review of this follow-up (a 4th test, same describe): through `shell-exec`,
`bash -c` with `{specsync,change} approve c1`, `env {specsync,change}
approve c1` or `specsync change {,} approve c1`, `xargs -I check specsync
check approve c1`, `xargs -I status specsync change status c1`,
`xargs --replace=show` / `-rI show` with `specsync change show c1`, and
`xargs -I X sh -c 'specsync X'`: exit 2, AGENT-18.a, nothing spawned;
`firstLifecycleStep` unit cases for brace splits (and past the caps), every
`xargs` replace-string spelling, a `-c` script it fills in, a path that
expands before its last `/`, and what still runs. On the first head
(109ec35) each of those `shell-exec` cases spawned the fake `specsync` with
`change approve c1`; with 109ec35's `sdd-lifecycle.ts` swapped in the new
test fails, and with main's two sources the 4 tests of the describe fail.
Restored: 15 of 15 pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-1818` (modified) | `tests/shell.sdd-lifecycle.test.ts` (4 new tests; the 11 earlier ones unchanged) | patterns and expanding / xargs subcommands refused with nothing spawned; read-only and never-run commands still run. Fail on base. |
| all | full `bun test`, `fledge lanes run verify --non-interactive` | run on this branch before push. |
