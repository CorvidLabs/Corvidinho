---
change: global-project-path-flag-runs-the-cli-as-if-started-in-that-directory-that-project-s-fledge-toml-specs-and-env-files-as
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-505` | `tests/cli.project-path.test.ts` "task run reads the project's fledge.toml and specs, not the start dir's" | Started in A (verify on), `--project P` before and `--project=../P` after the command: exit 0, `state` `done`, `verifySkipped` true (P's `fledge.toml`), Planning holds P's `widget` spec. On main: `Unknown command: --project` (exit 1) / flag ignored (`state` `failed`, no specs). |
| `REQ-cli-505` | same file, "loads the project's .env files exactly as starting there would, not the start dir's" | `--project P doctor` from A prints exactly what `doctor` started in P prints: `$8.00` cap (P's `.env.local` over `.env`, `${P_CAP}` expanded), `[warn] llm` (A's `.env` key dropped); A alone shows `$3.00` and `[ok] llm`; the key never appears. Fails on main (empty spend line). |
| `REQ-cli-505` | same file, "a variable set in the environment still wins over the project's .env" | Env cap `9.50` beats P's `.env`. Fails on main. |
| `REQ-cli-505` / `REQ-cli-419` | same file, "an unusable --project is one clean error line + hint, exit 1, nothing run" | Missing path, a file, and `doctor --project`: stderr is exactly `corvidinho: --project …` + hint, exit 1, no doctor output; `--json` → `{ok:false,error}`. Fails on main (`Unknown command` / doctor runs). |
| `REQ-cli-505` | same file, `parseGlobalFlags --project` and `readStartEnv / enterProject` blocks | Flag before/after the command, `=` form, empty value, pass-through after `--`, `--task --project` stays task text; environ parsing (first wins, bad entries skipped, missing file null); an unusable path leaves the cwd alone. Fail on main (no `project` field / exports). |
| `REQ-cli-419`, `REQ-cli-085`, `REQ-cli-262` | `tests/cli.clean-errors.test.ts`, `tests/spawn.argv.test.ts`, `tests/preload.operator-data-dir.test.ts` | Unchanged and still pass (full suite). |

Fail-on-main proof: with `git show origin/main:src/cli.ts > src/cli.ts` the
file fails to load (`Export named 'enterProject' not found`); a scratch copy
of only the four CLI cases (imports removed) fails 4/4 on main; restored, the
file passes 10/10.

Full suite: `bun test` green; `bunx tsc --noEmit` clean;
`specsync check --require-coverage 100` green;
`fledge lanes run verify --non-interactive` green.
