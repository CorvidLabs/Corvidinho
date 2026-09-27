---
change: plugin-1-fledge-itself-as-typed-builtins-fledge-lanes-list-and-fledge-lanes-validate-read-only-and-fledge-lanes-run-and
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-461` | `tests/fledge.core.test.ts` | "loadBuiltins registers the four Fledge core commands with honest danger and tier": reads dangerous=false / mutating=false / minTier 0, runs dangerous / mutating / minTier 2, origin builtin. On main: not registered. |
| `REQ-plugins-461` | `tests/fledge.core.test.ts` | "tool catalog: reads at tool tier; runs only at code tier with dangerous tools, ADMIN only": `buildOpenAiTools` at tool / code / dangerous / non-ADMIN / read tier. On main: the reads are missing. |
| `REQ-plugins-461` | `tests/fledge.core.test.ts` | "a Fledge plugin command named run or lanes-list is skipped; the builtin keeps the name": `loadFledgePlugins` with a fake plugin offering `run`, `lanes-list`, `hello` registers only `fledge-hello`, reports both skips, `fledge-run` is still the builtin, `fledgeStatusLines` prints the skip. On main: `fledge-run` and `fledge-lanes-list` register as plugin commands. |
| `REQ-plugins-461` | `tests/fledge.core.test.ts` | Read commands: `lanes list --json` argv / cwd / typed lanes with control chars cleaned; args refused before spawning; no fledge.toml and non-JSON are ok=false; `lanes validate --json` and `--strict` argv, valid ok, invalid ok=false exit 1 with errors and warnings and no fledge path; a path / other arg refused before spawning; both run non-interactively without an allowlist entry. |
| `REQ-plugins-461` | `tests/fledge.core.test.ts` | Run commands: SAFE-1 deny (exit 2) with no fledge start; allowlisted `lanes run verify` argv, project cwd and scrubbed env (`gh= dc= ai= llm= audit= acting= cdpath= oldpwd= fni=1 root=<project> keep=kept`); `run test -- …` argv verbatim incl. `$(id)` and a literal `--`, no `--` without args; option-like / non-plain names and extra lanes-run args refused before spawning; exit 3 → ok=false exit 3 with output; `sk-ant-…` redacted; 200 ms timeout → 124; abort → 130. |
| `REQ-plugins-461` | `tests/fledge.core.test.ts` | "fledge missing from PATH is exit 127, not a throw; a relative PATH entry is never used": all four commands exit 127 `<name>: fledge not on PATH`; `resolveFledgeBin` ignores a relative entry that does lead to a fledge. |
| `REQ-plugins-461` | `tests/fledge.core.test.ts` | Real fledge (skipped where fledge is not installed, e.g. CI): a temp `fledge.toml` project's lanes are listed, validated and run, `fledge-run pwd` prints the project root, an unknown task is ok=false with fledge's error, an undefined-task lane fails validation; `bun src/cli.ts plugins run fledge-lanes-list --json` in this repo lists `verify` with 4+ steps. On main the CLI test fails (unknown plugin command). |
| `REQ-agent-112` | `tests/fledge.core.test.ts` | "a default-catalog run offers the two reads and starts no fledge process": real `createTaskExecute` (code tier, mock provider, fake fledge first on PATH); the request's `fledge-` tools are exactly `fledge-lanes-list` / `fledge-lanes-validate` and the fake records no call. On main: no `fledge-` tool offered. |
| `REQ-agent-112` | `tests/fledge.plugins.test.ts` | "default catalog (no includeDangerous) never discovers or offers Fledge commands": now expects the two core reads as the only `fledge-` tools and `fledge-hello` unregistered. The includeDangerous test ("first request offers fledge-hello") is unchanged and passes. |
| `REQ-plugins-112`, `REQ-plugins-113`, `REQ-plugins-114`, `REQ-plugins-313`, `REQ-plugins-314` | `tests/fledge.plugins.test.ts`, `tests/fledge.hardening.test.ts`, `tests/fledge.cli.test.ts`, `tests/runners.plugins.test.ts`, `tests/plugins.list.smoke.test.ts`, `tests/docs.operator-facts.test.ts` | Existing bridge, hardening, schema-cost, runner, plugins-list and operator-doc tests still pass. |

Fail-on-main proof: with origin/main's `src/plugins/builtins.ts` and
`plugins/fledge/index.ts` swapped in (the branch's `core.ts` kept so the file
loads), `tests/fledge.core.test.ts` runs 15 pass / 5 fail (registration,
catalog, collision, default-catalog run and the real CLI test); with
`core.ts` removed as well (all of main) the file cannot load (`Cannot find
module '../plugins/fledge/core.ts'`). Restored: 20 pass / 0 fail.

Full suite: `bun test`, `bunx tsc --noEmit`, `specsync check
--require-coverage 100` and `fledge lanes run verify --non-interactive`.
