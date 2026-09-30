---
change: i-configure-the-models-openai-compatible-ollama-anthropic-with-no-built-in-default-and-it-says-so-when-none-is-set
artifact: design
---

# Design

- **One module** `src/agent/providers.ts` (pure, env in → values out):
  `parseModelEntry` / `parseModelChain`, `modelChainForTier`,
  `resolveEntry` (kind → endpoint, key, `usable`), `ollamaHostUrl`,
  `providerId`, `providerForTier`, `entryLabel`, `defaultProviderLabel`,
  `providerNotice` / `NO_PROVIDER_NOTICE` and `providerStatus`.
  `tier.ts` keeps `TIER_MODEL_ENV`, `modelForTier`, `modelKeyForTier` and
  `perTierModels` (now over the parsed entries) and drops
  `DEFAULT_LLM_MODEL`. The two modules import each other only inside
  functions.
- **Transport unchanged.** `loadLlmEnv` returns the tier's first entry
  resolved (`kind`, `baseUrl`, `apiKey`, `model` without the prefix) plus
  `notice`. `chatCompletions` posts to `${baseUrl}/chat/completions` as
  before and sends `authorization` only when there is a key (Ollama). The
  SAFE-8 guard, `extractUsage`, the image retry and the per-request timeout
  are untouched.
- **No provider = failed run.** `createTaskExecute`'s attempt returns
  `{ error: true, summary: notice, filesChanged: [] }` before any fetch;
  `runTask` already ends a provider error `failed` (no retry, no verify).
  `demoExecute` is deleted; no env switch revives a stub (tests use a fake
  provider instead).
- **One notice everywhere.** `providerNotice(env, tiers)` groups tiers by
  problem ("CORVIDINHO_LLM_MODEL is not set" / "<entry> needs <KEY>, which
  is not set") and adds how to set a model when one is unset. Startup: the
  bridge (`console.warn` after the audit line), the WATCH poller (a log line,
  skipped in a dry run), the daemon (`llm` on `daemon.started` and an
  `llm.no_provider` warn), `task run` (first stderr line in text mode; the
  failed result in every mode). `/status`: `formatLlmStatusLine(env, {
  ownerView })`; the handler passes `isOwnerViewer` (already computed for the
  spend line), so setting names reach only the owner (SAFE-14.a pattern).
  `formatLlmStatusLine` without `ownerView` gives the non-owner line (fail
  closed). Doctor / init: `llmDoctorCheck` `[warn]` with the notice.
- **Chat replies unchanged.** A failed run's Discord reply (chat, button
  answers, `/session start`, `/work`, schedules) stays the usual
  `… failed (exit 1)` line; only `task run` output and the WATCH run-summary
  comment carry the run's summary. AGENT-10 asks for the notice at startup and
  in `/status`, and the notice's setting names are owner-only there, so the
  channel body is not changed here (pending Leif).
- **Spend.** `readSpendSnapshot` treats an empty model as nothing to price,
  and `unpricedTierModel` skips tiers with no model, so a missing model never
  reads as "paused for budget".
- **SAFE-6.** `ANTHROPIC_API_KEY` added to `SECRET_ENV_NAMES`; it was already
  in `VERIFY_ENV_DROP` (verify lane, runners, the SAFE-21 shell env).
- **Tests.** `tests/fixtures/fake-llm.ts`: `startFakeLlm` (a localhost
  OpenAI-compatible server configured as a keyless `ollama:` model, recording
  bodies and auth headers), `fakeLlmFetch` / `FAKE_LLM_ENV` for in-process
  runs, and `useConfiguredModel` for bridge tests whose footer reads the
  configured model. `tests/preload.ts` also clears the operator's model
  config and provider keys.
- **Rejected.** A test-only env switch that keeps the stub (a hidden built-in
  default); failing doctor on no provider (it never failed on no key before);
  hiding the model/host from non-owners (not asked; today's line shows it).
