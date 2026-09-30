---
change: i-configure-the-models-openai-compatible-ollama-anthropic-with-no-built-in-default-and-it-says-so-when-none-is-set
artifact: research
---

# Research

- Sources: issue #79 (body: provider-agnostic model layer, remove the
  hard-coded `gpt-4o-mini`, keys stay in env; one comment: v0.0.30 shipped
  per-tier models on one endpoint, the rest waits for Leif), Leif's interview
  record `/home/user/coord/interview-2026-09-28.md` (round 2: capture the
  provider criteria), the planned scope `/home/user/coord/pr-providers-1.json`,
  the providers rows of `/home/user/coord/m34-defaults.md` (vendor endpoint
  defaults kept; no default model or provider; one OpenAI-compatible endpoint
  shared by openai entries) and the slice record
  (`/home/user/coord/m34-scope-all.json`, key `providers`, split PR1).
- Every surface reaches the model through `task run` (src/cli.ts →
  `createTaskExecute` → `chatCompletions`): Discord chat, slash commands,
  `/work`, schedules (bridge and daemon), WATCH, and delegate / council
  workers (child `task run` processes that inherit the provider env; only
  GitHub / Discord / audit keys are worker-dropped). So one provider layer in
  `loadLlmEnv` / `chatCompletions` covers them all.
- Ollama serves an OpenAI-compatible API at `<host>/v1/chat/completions`
  and needs no key; Anthropic serves an OpenAI-compatible API at
  `https://api.anthropic.com/v1/chat/completions` with its key as a Bearer
  token. Both return OpenAI-shaped `usage`, so `extractUsage` and the SAFE-8
  guard (which prices `body.model` and records the URL host) work unchanged.
- Readers of the configured model: the #297 footer (`loadLlmEnv().model`,
  now "" when unset, which the footer already omits), the doctor and /status
  spend lines (`readSpendSnapshot`, which flagged "" as unpriced) and
  `formatLlmStatusLine`.
- Tests that depended on the stub or the default: ~80 across 25 files (CLI
  spawns of `task run`, footers that read `gpt-4o-mini`, key-only mock envs,
  doctor / version / /status expectations).
