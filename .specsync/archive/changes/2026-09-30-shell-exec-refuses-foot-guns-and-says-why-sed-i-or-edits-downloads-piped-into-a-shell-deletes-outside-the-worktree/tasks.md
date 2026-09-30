---
change: shell-exec-refuses-foot-guns-and-says-why-sed-i-or-edits-downloads-piped-into-a-shell-deletes-outside-the-worktree
artifact: tasks
---

# Tasks

- [x] `hi SAFE-21.a "…"` captured from the 2026-09-28 interview (round 13) in its own commit; `hi check` passes.
- [x] Regression tests: `tests/shell.footguns.test.ts` (13 tests), 4 new tests in `tests/shell.clamp-bypass.test.ts`, 1 in `tests/runners.plugins.test.ts`; on the base 16 of them fail (the rest are allowed-path guards that hold trivially).
- [x] `clamp.ts`: redirection operators and pipes recorded; one walker with strict (clamp) and lenient (visitor) modes, `forEachSimpleCommand`; `env -C` / `--chdir` / `sudo -D|-R` checked like `cd`; `env -S` / `sudo -s` refused; `sudo` / `doas` wrappers; symlink-aware `isCdEscape` (`physicalPath`, `landsOutside`); `ln` targets; message names env -C and symlinks.
- [x] `footguns.ts`: `firstFootgun` / `footgunRefuseMessage` — download, delete, secret and edit families, in-root scripts for the first three, reasons plus what to do instead.
- [x] `commands.ts`: SAFE-21 before SAFE-3, runners' credential-free env, `spawnCapped` with `ctx.signal`, timeout and cap, scrubbed output, refusal data.
- [x] `runners/commands.ts`: `withoutGitCredentials` / `isCredentialEnvKey` in `runnerChildEnv` (SAFE-21.a).
- [x] Fixtures that wrote with `>` now write through `tee` (`tests/shell.clamp-scripts.test.ts`, `tests/agent.tool-loop.test.ts`).
- [x] Specs: plugins purpose / Public API / shell prose, residual list, SAFE-21 and SAFE-21.a paragraphs, runners env, error-case rows, scenarios, files, testing; agent testing; deltas REQ-plugins-494 / 495 (Added), REQ-plugins-087 / 313 and REQ-agent-085 (Modified).
- [x] Docs: `docs/DISCORD-GO-LIVE.md` `shell-exec` and runner rows.
- [x] SpecSync approve / check / audit / coverage, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
