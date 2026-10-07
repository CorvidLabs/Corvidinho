---
change: a-headless-agent-cli-can-be-one-of-my-models-in-my-own-runs-only-with-the-same-tools-as-my-other-models-inside-that
artifact: design
---

# Design

## The kind (`src/agent/providers.ts`)

`cli` joins `PROVIDER_KINDS`, reusing #320's `kind:model` entry format:
`cli:<program> [args…]`, the command kept with single spaces, `cliArgv` splits
it (no shell, no quoting — so no commas in a command). `resolveEntry` gives it
no key, `usable` always, and `baseUrl` = `cliProviderId` (`cli:<program
name>`), so `providerId`, the SAFE-8 ledger and a SAFE-14 provider cap name it
without a new code path. `modelIdOfLabel` / `modelForTier` keep its whole label
so `cli:gpt-5` is never priced as `gpt-5`.

## The chain: skip or hand over (AGENT-11)

`callChain` gets an optional `cli` verdict and never calls a chat `fn` with a
`cli` entry: granted → it stops with `handover` (not a failure; the chain stays
there); refused (or no verdict) → `failOver` records a hop marked `skipped`
and the same request goes to the next entry. `ModelFallback.skipped` makes the
notice read `skipped` instead of `failed` (Text line, closing note,
`llm.fallback`), and `modelFallbackFromUnknown` / `mergeModelFallbacks` carry
it from a child's result. `failOver` is the one hop helper `callChain` now
uses too.

## The gate (`cliTurnGate`, `src/agent/headless-cli.ts`)

The CLI's own built-in tools include a shell that Corvidinho cannot narrow to
its allowlist. "Same tools as my other models" is therefore read
conservatively: the CLI runs only where the run's other models would be
offered `shell-exec` — the SAFE-3.a gate (`shellToolsGate`, unchanged: owner,
interactive surface, own talk worktree / the local run's own worktree; never
workers, WATCH, schedules, `--here`, non-git), `shell-exec` in the allowlist,
the code tier with tool rounds, no SAFE-13 trip. Re-read on every attempt;
one operator line per run says why when refused.

## The turn (`runCliTurn`, `createTaskExecute`)

At the start of an attempt, while the chain's current entry is `cli`
(`cliStep`): refused → skipped hop; granted → `cliTurn`: snapshot protected
files, spawn, put protected files back, then either the attempt's result or a
model failure that fails over (`exit` 127 could not start / non-zero,
`timeout`, `malformed` empty reply). A tool-loop that reaches a granted `cli`
entry mid-attempt returns `cliHandover` and the attempt restarts at the CLI
step (index only moves forward, so it ends). The AGENT-17.a escalation drops
`cli` entries from the order when the attempt may not run them.

Spawn: `spawnCapped` with `stdin` = the prompt and `killTreeAfterExit` (new
options, default off); cwd the talk worktree; env `cliChildEnv` =
`runnerChildEnv` (the shell's env: verify-lane scrub, SAFE-21.a, SAFE-21.b,
`CORVIDINHO_PROJECT_ROOT`) + the owner-named pass-through keys minus git /
GitHub / cloud / worker-dropped keys; cloud stand-ins released after; the
per-request model timeout; the idle watchdog held (`whileIdlePaused`), like a
chat call. Output: stdout scrubbed; one JSON object with a string `result`
gives reply + `usage` (OpenAI or Anthropic names), else the whole stdout.

Prompt (review fix): besides the persona, `CLI_TURN_INSTRUCTIONS` and the
PERSONA-3 rules, the CLI gets the identity (IDENTITY-4 / SAFE-11) and
untrusted-content (SAFE-12 / SAFE-13) rules every other model of the run gets
(a talk's thread can carry fenced text from other people), and, for a repo
with hi or SpecSync, one line each saying how those ways hold for it (never
change hi/; it cannot open or edit a change). The pass-through keys only add
keys the scrub dropped: they never override one it set or kept.

## SAFE-2 for a turn (`guardProtectedPaths`)

Before: HEAD, `git status` (untracked included), the state of every dirty or
untracked protected path (`isProtectedPath` + `isSddRecordPath`, capped at
32 MiB), the worktree's `.git` file, and a nested `startWorkspaceDiff` (never
touches the verified marker). After: every protected path in `changed()` (and
`.git` if it differs) goes back — to its snapshot, else its HEAD blob / mode /
link (removed when HEAD has none) — parents first, refusing to write through a
folder that resolves outside the worktree. A failure fails the attempt (not
verified). Gitignored paths are not seen (as for the verify gate).

## Spend (`SpendGuard.call`)

The guarded fetch's body is factored into `call(GuardedCall)` (provider,
model, request bytes, signal, `send`, `outcome` → billed yes / no / maybe +
usage); the fetch now goes through it unchanged. A CLI turn is one `call` with
model = its label (never priced): no cap covering it → runs unrecorded; a
covering cap → the SAFE-16.a unknown-price card; approved → recorded
`unknown` with its tokens; a non-zero exit is "maybe billed".

## Design choices pending Leif

1. **Its built-in tools cannot be limited to Corvidinho's allowlist.** Chosen:
   offer the CLI only where `shell-exec` itself would be offered (SAFE-3.a gate +
   `shell-exec` allowlisted + code tier + no SAFE-13 trip), and document that
   inside the CLI the per-command shell checks (SAFE-3 cd clamp, SAFE-21
   foot-guns, AUTONOMY-9 prod must-ask card, AGENT-18.a lifecycle refusal) do
   not apply. Alternatives: a separate allowlist name for the CLI, or wrapping
   the CLI in a sandbox.
2. **Protected files are put back after each turn**, SpecSync records and
   `specs/` included, so a CLI cannot open or fill a SpecSync change itself (in
   a repo that requires one its edits fail the SDD gate). Alternative: let a
   CLI run `specsync` and only guard the verify-lane files.
3. **Env:** the shell's env plus only the keys named in the new optional
   `CORVIDINHO_LLM_CLI_ENV` (unset = the CLI's own login under `HOME`).
   Alternative: pass a kind's key automatically (e.g. `ANTHROPIC_API_KEY` for
   `cli:claude`).
4. **Bounds:** one turn is one model call — the 10-minute request timeout, the
   idle watchdog held, the turn cap not applied to the CLI's own steps.
5. **Mid-attempt fallback:** a chat model that fails mid-attempt hands the whole
   attempt to a CLI next in the chain (fresh prompt, edits so far kept); in
   other runs the CLI is skipped inline.
6. **Output contract:** stdout is the reply; one JSON object with a string
   `result` (Claude Code's `--output-format json`) gives reply and usage.
7. **Never the GITHUB-9 reviewer.**
8. **Spend:** never priced; under a covering cap every turn asks on the
   unknown-price card (no price override, SAFE-16.a).
9. **Corvidinho's own tools are not bridged into the CLI.** It works with its
   own built-in tools only: no memory, ask-human card, hi-draft, SpecSync
   change, GitHub or Discord tool inside a CLI turn ("same tools" is read as
   "never more than the shell reaches"). `/work`'s commit, push, second-model
   review and PR still run after a verified turn as for any model.
