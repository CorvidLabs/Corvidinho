---
module: agent
change: if-a-model-fails-or-is-retired-it-falls-back-to-my-next-configured-model-and-tells-me-agent-11
---

# Delta: agent (a failed or retired model falls back to the next configured one and says so — AGENT-11)

## Added

### REQUIREMENT REQ-agent-080

If a model fails or is retired, it falls back to my next configured model and
tells me (AGENT-11, captured in `hi/agent.md` from Leif's 2026-09-28
interview). A tier's configured entries (REQ-agent-179, in their order) SHALL
be a fallback chain: `createTaskExecute` SHALL build one `ModelChain`
(`modelChain(env, tier)`, `src/agent/providers.ts`) for the process and send
every model call of the run — every tool-loop round, the read tier's single
chat, every verify-retry attempt — through `callChain` to the chain's current
entry. When that call fails as a model — an HTTP error of any status (404 or
410 for a retired or missing model included), a network error, the
per-request timeout (REQ-agent-244) or a malformed reply (not JSON, or no
assistant message) — and a next entry exists, the same request SHALL go to the
next entry at once, with no retry and no backoff, and the chain SHALL keep that
entry for every later call of the process. A next entry whose kind needs a key
that is not set SHALL be skipped without a call, its reason naming the key. A
call that is not a model failure SHALL never fail over: a SAFE-8 spend-cap stop
(`SpendCapRefusal`, so a cap stop asks as before and never routes around the
cap to another model), the run's own abort, and a Deny or lapsed card on a
must-ask tool call (the tool's refusal, REQ-plugins-097). A failure on the last
entry SHALL end the attempt as before (`error: true`, the last model's error
as the summary). Nothing SHALL be stored: each `task run` process tries the
head once. The image-refusal retry (REQ-agent-428) SHALL run on a model before
it fails over. Each failover SHALL be told: one `[operator] <a> failed
(<reason>); falling back to <b>` `Text` event (`modelFallbackEventText`;
`<a>` and `<b>` are entry labels, `<reason>` one of `HTTP <status>`,
`timed out`, `network error`, `malformed reply` or `<KEY> is not set`,
never provider output), one `onModelFallback(hop)` call, and a closing note
`(model fallback: <a> failed (<reason>), fell back to <b>[; …])`
(`withModelFallbackNote`, once) on every later summary of the run, after a
SAFE-13 note and before the role note, which stays last. `clipKeepingRoleNote`
(`closingNotesTail`) SHALL keep that note whole, with the role note after it,
so `resultFrame`, `chatBodyFromTaskResult` and every surface clip that uses
it keeps it (REQ-agent-333). `createTaskExecute` SHALL report `onModel(label)`
for each reply and pass `onUsage(totals, { model, byModel })` (the running
totals per configured model). `TaskResult` SHALL gain optional `model` (the
entry label that answered), `usageByModel` (`ModelUsage[]`) and
`modelFallback` (`ModelFallback[]`: `from`, `to`, `reason`, optional `via`);
`usageFrame(u, detail?)` SHALL add `model` and `byModel` to a `usage` frame,
the parser SHALL keep them only when well-formed (`modelLabelFromUnknown`,
`modelUsageFromUnknown`), and `collectTaskRunStream` SHALL return the last
frame's `byModel` as `usageByModel`; all optional, so protocol 2 is
unchanged. A delegate or council worker's failovers SHALL reach its lead:
`runDelegateChild` SHALL return the worker result frame's `modelFallback`
(validated by `modelFallbackFromUnknown`: scrubbed, one line, bounded, at most
`MODEL_FALLBACK_MAX`), `runCouncil` SHALL collect its voices' and chair's
once each (`mergeModelFallbacks`), and the lead's tool loop SHALL take a
`delegate` / `council` result's `data.modelFallback` as its own run's
failovers marked `via` (a Text event `[operator] <via> worker: …`,
`onModelFallback`, the note), each once. No env var, config key, flag, slash
command or schema change is added.

Acceptance Criteria
- `callChain`: the head failing with HTTP 404 hands the call to the next entry (called once each); a second call goes straight to it; `fallbacks` holds one hop `{ from, to, reason: "HTTP 404" }`; `failure: null` returns as it is with no hop; a failure on the last entry comes back with the earlier hop only; `model-a, anthropic:claude-x, ollama:local` with no `ANTHROPIC_API_KEY` skips `anthropic:claude-x` uncalled (`ANTHROPIC_API_KEY is not set`).
- For HTTP 404, 410 and 500, a thrown network error, a timeout (`llmTimeoutMs` 40), a non-JSON reply and a reply with no assistant message: requests go `model-a` then `model-b`; the summary is `model-b`'s reply plus `(model fallback: model-a failed (<reason>), fell back to model-b)`; one `[operator] model-a failed (<reason>); falling back to model-b` Text event; `onModelFallback` once; `onModel` `model-b`.
- A tool loop that failed over in round 1 sends round 2 and attempt 2 to `model-b` (`model-a` called once); a new `createTaskExecute` calls `model-a` first again; the read tier fails over too.
- Every model failing: `runTask` ends `failed`, summary the last model's error plus the note listing each failover.
- Usage per model: `onUsage`'s last detail is `{ model: "model-b", byModel: [model-a's tokens, model-b's tokens] }` with the totals summed.
- Under a SAFE-8 cap an unpriced head sends nothing, asks `spend-cap` and adds no note; a cap stop on the entry it fell back to never calls the entry after it.
- The run's own abort during the head's request: no hop, the next entry never called; a must-ask call that is denied or whose card lapses: the same model answers next, no hop.
- A `delegate` result with `data.modelFallback` gives one `via: "delegate"` hop, the Text event `[operator] delegate worker: w-a failed (HTTP 410); falling back to w-b` and the note; a repeat is not added again; `runDelegateChild` and `runCouncil` carry a worker's failovers (validated, each once).
- `resultFrame`, `chatBodyFromTaskResult` (with a role note after the note) and `splitDiscordMessage` keep the note whole on a long answer.
- `usageFrame` with the detail round-trips `model` and `byModel` through `parseNdjsonLine`; without it the frame is unchanged.
- The real `task run --output ndjson` with `ollama:gone-model, ollama:fake-model` against a localhost provider answering 404 streams the Text frame, usage frames with `model` / `byModel`, and a `done` result with the note, `model`, `usageByModel` and `modelFallback`.
- On the base sources `tests/agent.fallback.test.ts` fails 26 of 35 (the 9 that pass are the providers module's pure units and the never-fails-over cases); on the branch all pass.

## Modified

### REQUIREMENT REQ-agent-179

I configure its models (OpenAI-compatible, Ollama, Anthropic or a headless
agent CLI), and there's no built-in default (AGENT-13, partial: the headless
agent CLI kind is a later change); with no provider set, it says so at startup
and in /status (AGENT-10). Both were captured in `hi/agent.md` from Leif's
2026-09-28 interview. `src/agent/providers.ts` SHALL read the model entries:
`CORVIDINHO_LLM_MODEL` and the per-tier `CORVIDINHO_LLM_MODEL_READ` / `_TOOL`
/ `_CODE` (REQ-agent-079) each hold an ordered, comma-separated list of
entries (blanks skipped); an entry is `kind:model` with kind `openai`,
`ollama` or `anthropic` (case-insensitive, split on the first `:` only when
the prefix is a kind), and a bare entry or one whose prefix is not a kind
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
`ANTHROPIC_API_KEY`. Every kind SHALL go through the one OpenAI-compatible
chat transport (`chatCompletions`, `extractUsage`) and the SAFE-8 spend guard
unchanged; the request's `body.model` SHALL be the entry's model without its
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

### REQUIREMENT REQ-agent-007

The execute hook for `task run` SHALL call the OpenAI-compatible chat completions endpoint of the model provider the operator configured for the run's capability tier (AGENT-13, REQ-agent-179: the tier's first `kind:model` entry from `CORVIDINHO_LLM_MODEL_*` / `CORVIDINHO_LLM_MODEL`, with that kind's endpoint and key, and after a model failure the next entry of that list, AGENT-11 / REQ-agent-080; the model per REQ-agent-079). There SHALL be no demo execute stub and no built-in default model: when the run's tier has no usable provider (no entry, or the kind's key is unset) the attempt SHALL make no provider call and SHALL return `error: true` with the no-provider notice as its summary and no files (AGENT-10), so the run ends `failed`. Secrets SHALL stay in env and SHALL never be committed.

Acceptance Criteria
- No usable provider (nothing set, a key with no model, or a model whose kind has no key) → no fetch; `error: true`, the summary starts `No model provider is configured`, `filesChanged` `[]`; never a demo summary or `gpt-4o-mini`.
- Usable provider → chat completions path (tool loop or read-tier chat per REQ-agent-008/009).
- Fixture tests cover the no-provider path; provider paths mock fetch or use a localhost fake provider (no live API in CI).
- Provider set → every request's `model` is the run tier's model without its `kind:` prefix (REQ-agent-079); with no per-tier model key it is `CORVIDINHO_LLM_MODEL`'s first entry.
- The first entry failing (HTTP error, network error, timeout, malformed reply) → the next request goes to the list's next entry (REQ-agent-080).

### REQUIREMENT REQ-agent-079

`loadLlmEnv(env, tier?)` SHALL resolve the model for the run's effective capability tier (the explicit tier — `--tier` / `createTaskExecute` `tier` — else `CORVIDINHO_LLM_TIER`, default `tool`): the optional key for that tier (`CORVIDINHO_LLM_MODEL_READ`, `CORVIDINHO_LLM_MODEL_TOOL` or `CORVIDINHO_LLM_MODEL_CODE`; blank counts as unset) SHALL win, else `CORVIDINHO_LLM_MODEL`, else no model at all (AGENT-5; AGENT-13: there is no built-in default, and the run fails with the no-provider notice, REQ-agent-179). Each key holds `kind:model` entries (REQ-agent-179); the tier's model is its first entry, and its later entries are the models the run falls back to (AGENT-11, REQ-agent-080). Every chat request of the run SHALL carry the model of the entry it goes to — the tier's first entry until that one fails — without its `kind:` prefix, in `body.model`, so SAFE-8 spend pricing prices the model actually called. The endpoint and the API key SHALL come from the entry's kind (REQ-agent-179), so tiers of one kind share them (`openai` entries share `CORVIDINHO_LLM_BASE_URL` and its key). Delegate workers and council voices SHALL inherit the per-tier keys (they are not worker-env-dropped) and SHALL resolve the model at their own tier. With no per-tier key set, every tier SHALL call `CORVIDINHO_LLM_MODEL` exactly as before. Model resolution SHALL NOT print or log the API key. Under a SAFE-8 cap the unpriced-model ask SHALL name the env key that set the run's model (the tier's key when set, else `CORVIDINHO_LLM_MODEL`), and when any per-tier key is set the doctor `spend` line (REQ-cli-098) and the Discord `/status` spend line SHALL warn when any tier's model has no known price and SHALL name that tier; with no per-tier key they SHALL read as before. A tier with no model calls nothing, so it SHALL NOT be flagged as unpriced.

Acceptance Criteria
- `CORVIDINHO_LLM_MODEL=big`, `CORVIDINHO_LLM_MODEL_READ=cheap`: a read run sends `cheap`, tool and code runs send `big`; adding `CORVIDINHO_LLM_MODEL_CODE=big2` / `CORVIDINHO_LLM_MODEL_TOOL=mid` makes code send `big2` and tool `mid`.
- `CORVIDINHO_LLM_TIER=code` with `tier: "read"` sends `cheap`; `CORVIDINHO_LLM_TIER=read` with `tier: "code"` sends the code model.
- A read-tier `buildDelegateSpawn` env keeps the per-tier keys and resolves `cheap` (env tier or `--tier read`).
- Under a SAFE-8 cap, an unpriced read model stops a read run before any provider call and the spend-cap ask names that model and `CORVIDINHO_LLM_MODEL_READ` as the key to switch; a tool run on an unpriced shared model names `CORVIDINHO_LLM_MODEL`.
- Under a cap with a priced configured model and `CORVIDINHO_LLM_MODEL_READ` unpriced, doctor prints `[warn] spend: … model "<m>" has no known price, so read-tier runs stop and ask before calling the provider` and `/status` flags the read-tier model; with every tier priced or no per-tier key the lines read as before.
- No per-tier keys → every tier sends `CORVIDINHO_LLM_MODEL`; a blank per-tier key falls back; no model at all → no model (`model` `""` and the no-provider notice), never `gpt-4o-mini`.
- Fixture tests mock fetch; no live API.
- After the first entry failed, requests carry the next entry's model, which the SAFE-8 guard prices (an unpriced one stops at the cap and asks, REQ-agent-080).
