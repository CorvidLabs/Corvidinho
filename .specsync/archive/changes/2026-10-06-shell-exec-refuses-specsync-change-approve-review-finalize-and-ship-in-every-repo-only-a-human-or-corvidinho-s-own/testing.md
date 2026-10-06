---
change: shell-exec-refuses-specsync-change-approve-review-finalize-and-ship-in-every-repo-only-a-human-or-corvidinho-s-own
artifact: testing
---

# Testing

`tests/shell.sdd-lifecycle.test.ts` (11 tests): temp dirs only, never this
checkout; a fake `specsync` on PATH that logs its argv and changes the change
folder like the real one (approve writes `approvals.json`, review
`review.json`, finalize / ship archive it) and fake `bunx` / `npx`; every
refused command starts with `touch spawned`. Imports come only from modules
the base has; the new module is imported inside its unit test.

Fail-on-base proof: with e1a24ed2's `plugins/shell/commands.ts` and
`plugins/shell/must-ask.ts` swapped in and `plugins/shell/sdd-lifecycle.ts`
removed, `bun test tests/shell.sdd-lifecycle.test.ts` gave 2 pass, 9 fail:
the three every-repo cases, the wrapped / nested, the wrapper / path / runner,
the unreadable-step and the in-root-script cases (the fake ran: marker,
approvals / review written, folder archived), the Approve-card case
(`shellProdWhy` asked) and the unit test (module missing). The 2 that pass
on both are the read-only case and the settle-path case. Restored: 11 of 11
pass.

`tests/agent.repo-ways.test.ts` (the `runTask` settle cases, REQ-agent-519),
`tests/shell.*.test.ts`, `tests/agent.safe3a-owner-shell.test.ts` and
`tests/cli.safe3a-shell.test.ts` still pass unchanged (237 of 237).

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-1818` | `tests/shell.sdd-lifecycle.test.ts` "in a SpecSync repo", "in a plain folder", "on Corvidinho, even for this run's own change right after a green lane" | approve / review / finalize / ship refused with exit 2, `shell-exec refused (AGENT-18.a)` and `HUMAN_LIFECYCLE_LINE`, `data.rule` / `step`; no marker, no specsync call, `.specsync/` byte-for-byte unchanged, no `approvals.json` / `review.json`, no archive; with no repo check (plain folder) and even when `selfLifecycleRefusal` would allow the plugin. Fail on base: all three. |
| `REQ-plugins-1818` | `tests/shell.sdd-lifecycle.test.ts` "through sh -c / bash -c, eval, $(…)…", "behind env / timeout / nohup / xargs / sudo…", "a step it cannot read refuses", "in an in-root script…" | `-c`, `eval`, `$(…)`, backticks, function, `if`, pipeline, quote removal, `$'…'`; `env`, `timeout`, `nohup`, `xargs`, `sudo -u`, `exec`, `command`, `find -exec`, absolute / relative path, symlink, `bunx`, `npx -y specsync@6.0.0`, options before the step, an expanding command word; `"$S"`, `$(echo approve)`, xargs-supplied steps; `sh x.sh`, `bash ./x.sh`, `. ./x.sh`, `./y.sh` named in the message. Fail on base: all four. |
| `REQ-plugins-1818` | `tests/shell.sdd-lifecycle.test.ts` "read-only steps still run", "the owner gets no Approve card…", "the settle path is untouched" | status / list / show / check / ship-status / `specsync check` run with their argv logged and the tree unchanged; mentions of a step run; `shellProdWhy` null for a refused command with `kubectl` (non-null alone); `specsync-change-approve` on Corvidinho with the verified ledger spawns `change approve c1 --actor corvid-agent`. Fail on base: the Approve-card case. |
| `REQ-plugins-1818` | `tests/shell.sdd-lifecycle.test.ts` "firstLifecycleStep reads the step past options and fails closed" | option values, `--root change change review`, `cargo run --bin specsync --`, `pnpm dlx @corvidlabs/specsync@6`, expanding steps and command words, `specsync check change approve`, `echo specsync change approve` (fails closed), separate commands, the `bun -e` residual. Fail on base: module missing. |
| all | full `bun test`, `fledge lanes run verify --non-interactive` | Run on this branch before push. |
