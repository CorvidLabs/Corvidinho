---
module: agent
change: a-headless-agent-cli-can-be-one-of-my-models-in-my-own-runs-only-with-the-same-tools-as-my-other-models-inside-that
---

# Delta: agent (a headless agent CLI can be one of my models, in my own runs only, with the same tools as my other models, inside that talk's own worktree — AGENT-13, AGENT-13.a)

## Added

### REQUIREMENT REQ-agent-1301

A headless agent CLI model runs only in my own runs, with the same tools as
my other models, inside that talk's own worktree; other runs skip it and use
my next model (AGENT-13.a, captured in this change's PR from Leif's
2026-09-28 interview, round 17 on 2026-10-07; AGENT-13 on main).

- A model entry `cli:<program> [args…]` (`src/agent/providers.ts`,
  REQ-agent-179) SHALL name a headless agent CLI: `cliArgv` splits the command
  on whitespace (no shell, no quoting; the program is looked up on the run's
  `PATH` or is a path); `cliProviderId` is `cli:<program name>`
  (lower-cased), which `resolveEntry` gives as its `baseUrl`, so `providerId`,
  the SAFE-8 ledger and a SAFE-14 provider cap name it so; it has no key and
  is always `usable`. `entryModelId` — and through it `modelIdOfLabel`,
  `modelForTier`, `loadLlmEnv().model` (the configured model the bridge shows
  and doctor / `/status` price-check) and `readSpendSnapshot`'s match of the
  head entry — SHALL keep a `cli` entry's whole label, so it never has a
  known price (SAFE-16).
- `callChain` SHALL never call its `fn` with a `cli` entry. With the
  attempt's `CliTurnVerdict` granted it stops there with `handover: true`
  (`failure: null`, the chain stays on that entry); otherwise (refused, or no
  verdict given) the entry is skipped as a hop marked `skipped`
  (`ModelFailure` `skipped`, its fixed `why`), or, with no next entry, the
  call ends with `cliSkippedError`. `failOver` records one hop (AGENT-11).
- `createTaskExecute` SHALL re-read `cliTurnGate` (`src/agent/headless-cli.ts`)
  on every attempt whose chain still has a `cli` entry at or after its
  current one. It grants only when, in this order: the SAFE-3.a gate
  (`shellToolsGate`, REQ-agent-503 / REQ-cli-681) grants the shell — the
  owner's own chat, ask answer, `/session start` or `/work` in that talk's own
  worktree, or a local `task run` at the top of the worktree it made; never a
  team or community run, WATCH (owner-triggered too), a schedule, a delegate
  or council worker, `--here`, a non-git folder, a subdirectory, the main
  checkout or another talk's worktree (why: `only in the owner's own runs, in
  that talk's worktree`); the run's allowlist names `shell-exec` (`needs
  shell-exec in my allowlist (SAFE-3.a)`); the tier is `code` with tool
  rounds above 0 (`needs the code tier with tool rounds, like the shell`);
  and no tool result in the run tripped SAFE-13 (`not after a suspected
  prompt injection (SAFE-13)`). A refusal SHALL emit one
  `[operator] AGENT-13.a: <entries> not run here: <detail>` Text line per
  run. While the chain's current entry is a `cli` one, a refused attempt
  skips it (`[operator] <a> skipped (<why>); falling back to <b>`, the closing
  `(model fallback: <a> skipped (<why>), fell back to <b>)` note, the hop on
  `TaskResult.modelFallback` with `skipped: true`, the bridge / WATCH /
  daemon `llm.fallback` log; a delegate or council worker's skipped hop stays
  `skipped` at the lead, `<via> worker: <a> skipped (<why>)`) and the next
  entry runs; with none after it the
  attempt fails with `cliSkippedError` and `modelCallFailedLine` (`The model
  call failed (<a> was skipped: <why>)`). A chat model that fails over to, or
  an AGENT-17.a move that reaches, a `cli` entry the attempt may run hands the
  attempt over to it (the edits so far stay on disk); a refused one is never a
  stronger model to move to.
- A granted `cli` entry SHALL be the model for that attempt
  (`runCliTurn`): one spawn (`spawnCapped`, REQ-plugins-1301) with cwd the
  talk worktree, env `cliChildEnv` — `runnerChildEnv` (the verify-lane scrub,
  no GitHub / git credentials SAFE-21.a, no cloud credentials SAFE-21.b,
  `CORVIDINHO_PROJECT_ROOT`) plus only the set keys the owner names in the
  optional `CORVIDINHO_LLM_CLI_ENV` (`cliPassKeys`: never a git / GitHub
  credential, a cloud credential, or a key no worker gets; and never over a
  key the scrub set or kept, such as `CORVIDINHO_PROJECT_ROOT`) — the prompt
  (`cliTurnPrompt`: persona, `CLI_TURN_INSTRUCTIONS`, the PERSONA-3 rules, the
  IDENTITY-4 / SAFE-11 identity rules and the SAFE-12 / SAFE-13
  untrusted-content rules every model of the run gets, this repo's hi and
  SpecSync ways as they hold for a CLI turn (`cliRepoWaysLines`: never change
  hi/; it cannot open or edit a SpecSync change), the project's AGENTS.md /
  CLAUDE.md block, the SpecSync briefing, the task, the verify feedback
  excerpt, `Attempt N.`) on stdin, the per-request model
  timeout, the run's abort, the idle watchdog held, and its process tree
  killed once it exits; the cloud stand-ins released after. Its stdout,
  SAFE-6 scrubbed (cap `CLI_MAX_OUTPUT_BYTES`), is the attempt's summary; one
  JSON object with a string `result` gives that as the reply and its `usage`
  (`cliUsage`: OpenAI or Anthropic names, cache input counted) to `onUsage`
  under the entry's label; `onModel` names the label. A non-zero exit
  (`exited <n>`), a program that cannot start (`could not start`), a timeout
  or an empty reply (`malformed reply`) is a model failure and fails over; the
  run's stop and a spend-cap stop are not.
- Around each turn `guardProtectedPaths` SHALL snapshot the worktree's dirty
  or untracked protected paths (`isCliProtectedPath`: SAFE-2 / SAFE-2.a
  `isProtectedPath` and SpecSync's lifecycle records), its `.git` file and a
  nested run-start diff (never touching the talk's verified marker), and after
  the turn put back every protected path it changed — to the snapshot, else to
  its HEAD state, removed when HEAD has none — parents first, never writing
  through a link that leads out of the worktree; one operator line and the
  closing `(Protected files the headless agent CLI changed were put back,
  SAFE-2: …)` note name them. A snapshot that cannot be taken skips the
  entry; a change that cannot be put back fails the attempt (`… so this run is
  not verified.`). The result carries `unreportedEditTools: [<label>]`, and
  the run's verify gate judges the rest of the turn's edits as any model's
  (REQ-agent-085 / -003 / -185 / -518 / -520).
- Each turn SHALL be one call through the run's SAFE-8 / SAFE-14 guard
  (`SpendGuard.call`, provider `cli:<program name>`, model the label, request
  bytes the prompt): under a cap that covers it the SAFE-16.a unknown-price
  card asks first; a no runs nothing and the attempt ends with the
  `spend-cap` ask; approved, the turn is recorded `unknown` with the tokens it
  reported.
- The GITHUB-9 reviewer is never a `cli` entry (REQ-plugins-1301). No schema
  change, slash command or CLI flag; one optional env key,
  `CORVIDINHO_LLM_CLI_ENV` (unset = nothing passed). `--help`,
  `.env.example`, `README.md`, `docs/DAEMON.md` and `docs/DISCORD-GO-LIVE.md`
  E.9 document the `cli` kind and that key.

Acceptance Criteria
- The owner's chat in its own talk worktree with `CORVIDINHO_LLM_MODEL=cli:fakecli --print,gpt-x`, `shell-exec` allowlisted, code tier: the stand-in CLI runs with cwd the worktree, argv `--print`, the task, rules and `Attempt 1.` on stdin, `FAKE_CLI_KEY` (named in `CORVIDINHO_LLM_CLI_ENV`) set and `GH_TOKEN`, `ANTHROPIC_API_KEY`, `CORVIDINHO_LLM_API_KEY`, `AWS_SECRET_ACCESS_KEY`, `DISCORD_TOKEN`, `CORVIDINHO_AUDIT_HMAC_KEY` unset (even when named), `GIT_CONFIG_GLOBAL` and `KUBECONFIG` `/dev/null`, `CORVIDINHO_PROJECT_ROOT` the worktree; the summary is its `result`, its usage (15 in incl. cache, 5 out) counts under its label, no chat request is sent.
- Its edits to `fledge.toml`, `specs/agent/x.md` (deleted), a new `specs/agent/new.md` and a new `.fledge/lanes/verify.toml` are put back (git status shows only its `app.ts` edit) and named in the note; a protected file already dirty before the turn goes back to that state.
- `runTask` over it: the stub lane runs in the worktree, `app.ts` is in `filesChanged`, a failed lane's output is in the second turn's stdin, the run ends verified.
- A CLI that exits 3 falls back to `gpt-x` (`exited 3`); `gpt-bad` failing with HTTP 500 hands the attempt to the CLI after it.
- Under `CORVIDINHO_DAILY_SPEND_CAP_USD=5` the unknown-price card shows `send one model call to cli:fakecli --print via cli:fakecli`, amount unknown; denied, the CLI never runs and the result asks `spend-cap`; approved, one ledger row `cli:fakecli` / `unknown` with 15 / 5 tokens.
- A team member's chat, the owner's WATCH run, the owner's schedule, a delegate worker, the owner's chat outside the talk worktree, a local `task run --here`, no `shell-exec` allowlisted, the tool tier: the CLI never starts, `gpt-x` answers, the hop is `skipped` with the matching `why`, one operator line per run, the second attempt stays on `gpt-x`; with only `cli:` configured the run fails with `cliSkippedError`; `gpt-bad,cli:…,gpt-x` in a team run skips past the CLI.
- The real `task run`: by default the CLI works in the worktree the run made and the stand-in `fledge` lane verifies its edit (`done`, `model` the label); with `--here` it is skipped and the next model answers.
- `cliTurnGate` grants the owner's chat / ask / session / work in the talk worktree and a local run in its own worktree, and refuses every case above with its fixed `why`.
- The stand-in CLI's stdin carries the identity (IDENTITY-4) and untrusted-content (SAFE-12 / SAFE-13) rules; `cliTurnPrompt` for a repo with hi and SpecSync adds the hi and SpecSync lines before the task, and for a repo with neither adds neither.
- `cliChildEnv` with `CORVIDINHO_PROJECT_ROOT` named in `CORVIDINHO_LLM_CLI_ENV` and set to another folder keeps the talk worktree; a named key the scrub dropped (`ANTHROPIC_API_KEY`) is passed.
- `loadLlmEnv` with `cli:gpt-4o` gives `cli:gpt-4o`; under a total cap the spend snapshot flags it unpriced; under a provider cap that does not name the CLI nothing is flagged.
- A council worker's skipped `cli:` hop reaches the lead as `council worker: cli:… skipped (…)` in the operator line and the closing note (`tests/agent.fallback.test.ts`).

## Modified

### REQUIREMENT REQ-agent-179

I configure its models (OpenAI-compatible, Ollama, Anthropic or a headless
agent CLI), and there's no built-in default (AGENT-13; the headless agent CLI
kind, `cli`, and where it may run are REQ-agent-1301, AGENT-13.a); with no provider set, it says so at startup
and in /status (AGENT-10). Both were captured in `hi/agent.md` from Leif's
2026-09-28 interview. `src/agent/providers.ts` SHALL read the model entries:
`CORVIDINHO_LLM_MODEL` and the per-tier `CORVIDINHO_LLM_MODEL_READ` / `_TOOL`
/ `_CODE` (REQ-agent-079) each hold an ordered, comma-separated list of
entries (blanks skipped); an entry is `kind:model` with kind `openai`,
`ollama`, `anthropic` or `cli` (REQ-agent-1301) (case-insensitive, split on
the first `:` only when the prefix is a kind), and a bare entry or one whose prefix is not a kind
(`qwen3:30b`) is OpenAI-compatible. The list SHALL be a fallback chain
(AGENT-11, REQ-agent-080): a run calls the tier's first entry, and the next
entry only when the one before it failed. Each kind SHALL use
its vendor endpoint (the endpoint of a provider the operator chose, not a
default model) and its own key, never another kind's: `openai` →
`CORVIDINHO_LLM_BASE_URL` (else `https://api.openai.com/v1`) with
`CORVIDINHO_LLM_API_KEY`, else `OPENAI_API_KEY`; `ollama` → `OLLAMA_HOST` read
as Ollama reads it (`host`, `host:port` or a URL; no scheme means http and
port 11434; a bind-all address is reached on loopback; default
`127.0.0.1:11434`) plus `/v1`, with no key; `anthropic` →
`https://api.anthropic.com/v1` (its OpenAI-compatible API) with
`ANTHROPIC_API_KEY`; `cli` → no endpoint and no key (REQ-agent-1301). Every
kind but `cli` SHALL go through the one OpenAI-compatible chat transport
(`chatCompletions`, `extractUsage`), and every kind through the SAFE-8 spend
guard; the request's `body.model` SHALL be the entry's model without its
`kind:` prefix, and `authorization: Bearer <key>` SHALL be sent only when the
kind has a key. There SHALL be no built-in default model and no demo stub. A
tier's provider is usable when it has an entry and, for `openai` /
`anthropic`, its first entry's key is set; a keyless `ollama` entry is usable. With no
usable provider for a run's tier, `loadLlmEnv` SHALL carry the no-provider
notice (`providerNotice`, starting with `NO_PROVIDER_NOTICE` "No model
provider is configured") and the execute attempt SHALL make no provider call
and SHALL return `error: true` with the notice as its summary and no files,
so `runTask` ends `failed` on every surface (CLI, Discord chat, slash
commands, `/work`, schedules, WATCH, delegate and council workers). The
notice SHALL name what is missing — `CORVIDINHO_LLM_MODEL is not set` with
how to set it (`openai:<model>`, `ollama:<model>` or `anthropic:<model>`,
per-tier keys, no built-in default), or `<entry> needs <KEY>, which is not
set` — grouping tiers with the same problem and naming the tiers when not
every tier asked about has it; it SHALL name env keys and models only, never
a key value. `providerStatus`, `providerForTier`, `defaultProviderLabel`
(`<label> @ <host>` of the default tier, `openai` entries shown bare) and
`providerId` (the endpoint host, which the SAFE-8 ledger records as
`provider`) serve doctor, `/status` and the startup lines.
`ANTHROPIC_API_KEY` SHALL be a SAFE-6 secret env name (`redactSecretEnvValues`
/ `formatErrorLine`), as it already is dropped from the verify lane and the
shell (`VERIFY_ENV_DROP`). No schema change, slash command, CLI flag or
/admin knob is added; `OLLAMA_HOST` and `ANTHROPIC_API_KEY` are read only for
their kind.

Acceptance Criteria
- `parseModelEntry`: `openai:gpt-4.1`, `ollama:qwen3:30b` (model `qwen3:30b`), `Anthropic:<m>`; bare `gpt-4o` and `qwen3:30b` are `openai`; blank and `ollama:` are null. `parseModelChain("ollama:a, anthropic:b ,, c")` keeps order and skips blanks.
- A tier's own key wins, a blank or `,`-only key falls back to `CORVIDINHO_LLM_MODEL`, and nothing set is `[]`; `modelForTier` is the model without its kind, `""` when none.
- `resolveEntry`: openai default `https://api.openai.com/v1`, `CORVIDINHO_LLM_BASE_URL` wins (trailing `/` dropped), `CORVIDINHO_LLM_API_KEY` over `OPENAI_API_KEY`, unusable without a key; ollama `http://127.0.0.1:11434/v1`, no key even when `OPENAI_API_KEY` is set, usable; anthropic `https://api.anthropic.com/v1` with `ANTHROPIC_API_KEY` only, unusable without it; `providerId` is the host.
- `OLLAMA_HOST` `gpu-box` → `http://gpu-box:11434`, `gpu-box:9000`, `0.0.0.0` → `127.0.0.1:11434`, `https://…/` and `http://10.0.0.5:11434` as given.
- Mock fetch: an `ollama:qwen3:30b` run posts to `http://gpu-box:9000/v1/chat/completions` with no authorization header and `model` `qwen3:30b`; an `anthropic:` run posts to `https://api.anthropic.com/v1/chat/completions` with `Bearer <ANTHROPIC_API_KEY>`, never the OpenAI key; `openai:gpt-4.1, ollama:later` calls only `gpt-4.1` at the base URL with its key while `gpt-4.1` answers.
- `providerNotice({})` and with only `OPENAI_API_KEY` is the "CORVIDINHO_LLM_MODEL is not set" notice with how to set it; `anthropic:c` without its key names `ANTHROPIC_API_KEY`; only `_READ` set names the tool and code tiers; one run's own tier with a provider is null; the key value never appears.
- `runTask` over `createTaskExecute` with only a key: `failed`, summary the notice, `filesChanged` `[]`, one attempt, no verify, no provider call.
- The real `task run` with a keyless `ollama:` model pointed at a localhost fake server ends `done` with the server's reply; the server saw no authorization header and `model` `fake-model`.
- `redactSecretEnvValues` / `formatErrorLine` redact an `ANTHROPIC_API_KEY` value.
- On the base sources `tests/agent.providers.test.ts` fails 15 of 18 (the three that pass are pure units of the new module); on the branch all pass.
- A failed first entry hands the call to the next entry (REQ-agent-080, `tests/agent.fallback.test.ts`); no note says only the first entry is called.
- `parseModelEntry("CLI:fakecli    --print")` is `{ kind: "cli", model: "fakecli --print" }` (one space each); `cli:` alone is null; `resolveEntry` gives a `cli` entry no key, `usable` true and `providerId` `cli:<program name>`; `modelIdOfLabel("cli:gpt-5")` and `modelForTier` keep the whole label, so a `cli` entry is never priced as a chat model (REQ-agent-1301, `tests/agent.headless-cli.test.ts`).
- On the base sources a `cli:` entry was an OpenAI-compatible model named `cli:…`: a team run sent it as a chat request and the owner's run never started the CLI (scratch probe, recorded in the change's testing.md).
