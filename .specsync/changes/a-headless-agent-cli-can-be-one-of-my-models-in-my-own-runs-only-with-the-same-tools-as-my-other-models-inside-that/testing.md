---
change: a-headless-agent-cli-can-be-one-of-my-models-in-my-own-runs-only-with-the-same-tools-as-my-other-models-inside-that
artifact: testing
---

# Testing

One new file, 29 tests, no network: `tests/agent.headless-cli.test.ts`. A
stand-in `fakecli` (a shell script on a temp PATH, never a real agent CLI)
logs its argv, cwd, the env keys that matter and its stdin to a file outside
the worktree, then answers, edits files, touches protected files or fails as
each test needs. Temp git projects (app.ts, fledge.toml, specs/agent/x.md
committed) and the owner's talk worktree made by `ensureTalkWorkspace`; a temp
allowlist with an owner and a team member; an injected fake chat provider
(`gpt-bad` answers HTTP 500); a temp data dir; the real `task run` spawned for
the local CLI surface with a stand-in `fledge`.

Fail-on-base proof (base `85871fa4`, main): with the base's
`src/agent/providers.ts`, `execute.ts`, `spend.ts`, `tier.ts`, `types.ts`,
`src/work/review.ts` and `plugins/fledge/spawn.ts` swapped in (and the new
`src/agent/headless-cli.ts` absent), the file gave 0 pass, 1 fail (the module
does not load). A scratch probe with only base-era imports (not committed)
showed the behaviour: 0 pass, 3 fail on the base — `cli:fakecli --print`
parsed as `openai`, the owner's run never started the CLI (it sent
`cli:fakecli --print` as a chat model), a team run sent it to the chat
endpoint as a model id instead of skipping it — and 3 of 3 on the branch.
Restored: 29 of 29 pass.

Review fixes (adversarial review of #413): four more tests in
`tests/agent.headless-cli.test.ts` (29 → 33) plus two stdin assertions (the
prompt carries the identity and untrusted-content rules and the hi / SpecSync
lines; a named key never overrides one the scrub set; `loadLlmEnv` / the spend
snapshot keep a `cli` head's whole label; `--help` and `.env.example` name the
`cli:` kind and `CORVIDINHO_LLM_CLI_ENV`, REQ-cli-079) and one in
`tests/agent.fallback.test.ts` (a council worker's skipped hop stays
`skipped` at the lead). Each fails on the pre-fix sources of this branch
(`headless-cli.ts` / `execute.ts` / `spend.ts` / `src/cli.ts` +
`.env.example` swapped back: 3, 1, 1 and 1 fail) and passes with the fixes.

Unchanged suites that cover the touched files pass: `agent.providers`,
`agent.fallback`, `agent.spend*`, `spend.surfaces`, `agent.stall-escalate`,
`agent.safe3a-gate`, `agent.safe3a-owner-shell`, `cli.safe3a-shell`,
`work.review`, `work.pr`, `fledge.*`, `agent.ndjson-spawn`,
`autonomous.worker-failure`, `agent.verify-gate` (442 tests), and the full
`bun test` (see the PR).

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-1301` | `tests/agent.headless-cli.test.ts` ("AGENT-13.a gate …", "AGENT-13.a: in my own run the CLI is the model …", "AGENT-13.a: other runs skip it …", "task run: my local run uses the CLI …") | Granted only for the owner's chat / ask / session / work in the talk worktree and a local run in its own worktree; refused with its fixed why for team, community, WATCH, schedule, worker, main checkout, `--here`, no shell, tool tier, no rounds, injection. In the owner's run the CLI runs in the worktree with the prompt on stdin and the shell's env plus only the named pass-through key; reply, usage and label are the run's; protected files go back (snapshot or HEAD); the verify gate checks its edit and its next turn gets the lane output; exit 3 fails over; a chat model's HTTP 500 hands over to it; under a cap the unknown-price card asks first (deny: nothing runs; approve: one `unknown` ledger row with its tokens). Every other run never starts it, `gpt-x` answers with the `skipped` note, one operator line, the next attempt stays; only `cli:` configured fails with `cliSkippedError`; the real `task run` uses it by default and skips it with `--here`. |
| `REQ-agent-1301` (review fixes) | `tests/agent.headless-cli.test.ts` ("env pass-through only adds a key the scrub dropped …", "the prompt carries the rules every model gets …", "the configured model the bridge shows …", the stdin assertions of "it runs in the worktree …"); `tests/agent.fallback.test.ts` ("a worker that skipped a headless agent CLI entry …") | The CLI's stdin carries the IDENTITY-4 and SAFE-12 / SAFE-13 rules and, for a hi / SpecSync repo, the hi and SpecSync lines; `CORVIDINHO_PROJECT_ROOT` named in `CORVIDINHO_LLM_CLI_ENV` stays the worktree; `loadLlmEnv` gives `cli:gpt-4o` and the snapshot flags it unpriced under a total cap, not under a provider cap that does not name it; a council worker's skipped hop reads `skipped` at the lead. |
| `REQ-cli-079` (modified) | `tests/agent.headless-cli.test.ts` ("--help and .env.example name the cli: kind …") | `--help` lists the `cli:<program> [args]` form and `CORVIDINHO_LLM_CLI_ENV`; `.env.example` lists `cli` among the kinds, has a `# CORVIDINHO_LLM_CLI_ENV=` line and no longer says every kind uses the chat API. |
| `REQ-agent-179` | `tests/agent.headless-cli.test.ts` ("parse, label, argv, provider id …", "never priced …"); `tests/agent.providers.test.ts` (unchanged) | `cli:` parses as its own kind with a single-spaced command, no key, usable, provider id `cli:<program>`; `cli:gpt-5` keeps its whole label for pricing; a provider cap may name `cli:fakecli`; the other kinds are unchanged. |
| `REQ-plugins-1301` | `tests/agent.headless-cli.test.ts` ("the GITHUB-9 reviewer is never a cli entry", the CLI's stdin in every turn test); `tests/fledge.*.test.ts`, `tests/shell.*` (unchanged) | `resolveReviewer` skips `cli:` entries (null with only one); `spawnCapped` delivers the prompt on stdin and the shell, runners and Fledge runs keep a closed stdin. |
