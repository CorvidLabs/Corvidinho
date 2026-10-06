---
change: web-search-through-brave-plugin-7-plugin-9-issue-318-a-dangerous-mintier-1-web-search-command-in-plugins-web-offered
artifact: research
---

# Research

Reference clones (read only): `CorvidLabs/corvid-agent`,
`corvid-agent/fledge-plugin-gif`.

- corvid-agent `server/lib/web-search.ts` `braveWebSearch`: GET
  `https://api.search.brave.com/res/v1/web/search`, `X-Subscription-Token`,
  count clamped 1–20 (not checked to be an integer), optional freshness
  `pd|pw|pm|py`. Gaps not repeated here: no key returned `[]` as a success
  (`web-search.ts:37-41`, `tool-handlers/search.ts:25-29`), results reached
  the model unfenced (`search.ts:31-36`), `braveMultiSearch` swallowed errors
  (`web-search.ts:85-110`). `corvid_deep_research` is not wanted.
- Brave API (orc research on #318): key in `X-Subscription-Token`; `count` at
  most 20; `safesearch` off / moderate / strict; 422
  `SUBSCRIPTION_TOKEN_INVALID` is a bad key, 422 `VALIDATION` a bad
  parameter, 429 the rate limit; results only for transient use; the free
  credit needs "Powered by Brave" attribution.
- Corvidinho on main (156cfa9): `webFetch` cannot be reused as is — fixed
  headers (`plugins/web/fetch.ts` `REQUEST_HEADERS`), it returns `url` /
  `finalUrl` (`plugins/web/commands.ts`), it accepts http and follows
  redirects. Its pin / dial / read helpers can be shared unchanged.
- Keys: `VERIFY_ENV_DROP` alone still reaches delegate workers; the key goes
  in `WORKER_ENV_DROP` (`src/autonomous/delegate.ts`), which
  `isVerifyEnvDropped` (`src/agent/verify.ts`) also applies to the verify
  lane, the shell's foot-gun check and the runners' env; plus the Fledge child
  drop list (`plugins/fledge/spawn.ts`) and `SECRET_ENV_NAMES`
  (`src/store/scrub.ts`). The SAFE-6 at-rest scrub matches key shapes only
  and the Brave key has none, so every returned string also passes
  `redactSecretEnvValues`.
- Roles: team has neither `web-fetch` nor `discord-send-file`
  (`src/plugins/roles.ts`, pinned by `tests/roles.team.test.ts`), so PLUGIN-9
  needs its own tested rule.
- SAFE-13: after a hit the tool loop drops every mutating tool
  (`blockedAfterInjection`, `src/agent/execute.ts`); `web-search` is
  dangerous, so one suspicious snippet switches off web-search and web-fetch
  together. Intended (orc); documented and tested.
- Spend: the SAFE-8 guard wraps only model calls (`createSpendGuard` in
  `createTaskExecute`); a search needs its own reservation in the same
  ledger.
- Tool surface: `tests/fledge.plugins.test.ts` pins the whole surface (builtins
  plus a fake Fledge plugin) under `TOOL_SURFACE_BUDGET_TOKENS` (8000). With
  the first description the surface went over; the shortened one leaves
  ~43 tokens (7957).
- After the rebase onto main 507d97b: #320 (AGENT-13) removed the built-in
  default model, so a `createTaskExecute` test with only a key makes no
  model call; the tool-loop tests set `CORVIDINHO_LLM_MODEL: "test-model"`,
  as `tests/safe.injection.test.ts` does. #319's must-ask gate runs in
  `runPlugin`; `web-search` carries no must-ask class and passes it with no
  card. #320 added `ANTHROPIC_API_KEY` to the same secret and preload lists;
  the Brave key sits next to it. The builtin surface is 7569 tokens
  (7442 on main); the budget test with its fake Fledge plugin still passes.
- After the rebase onto main 0aeb345: #329 raised `TOOL_SURFACE_BUDGET_TOKENS`
  to 9000 for the SpecSync change tools; the builtin surface is 8078 tokens
  with `web-search` (7951 on main), and the reply line adds no schema. #328's
  `parseSpendCaps` makes any invalid spend-cap setting stop every call and
  records every call while any cap is set; a provider cap key must be a
  configured model provider, so none can name `api.search.brave.com`. #330's
  owner schedules resolve `owner` in the tool layer. #325 added the AGENT-11
  closing `(model fallback: …)` note that every clip keeps
  (`closingNotesTail`); the "Search by Brave" line reuses that path.
