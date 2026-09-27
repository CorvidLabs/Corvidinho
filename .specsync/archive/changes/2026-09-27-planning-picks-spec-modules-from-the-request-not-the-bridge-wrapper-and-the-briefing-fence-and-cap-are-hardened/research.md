---
change: planning-picks-spec-modules-from-the-request-not-the-bridge-wrapper-and-the-briefing-fence-and-cap-are-hardened
artifact: research
---

# Research

- `src/discord/identity-inject.ts` and `src/discord/memory-inject.ts`
  prepend a paragraph whose first line is `[Corvidinho …]`, separated from
  the request by a blank line. Memory content has its whitespace collapsed, so
  a block has no blank line inside it.
- `src/watch/router.ts` `buildPrompt` starts with `[WATCH <kind>]`; title
  and body follow and are part of the request.
- `tokenize` in `src/agent/specLoader.ts` splits on non-alphanumerics, so
  `discord_user_id` yields `discord`.
- Repro (before): `loadRelevantSpecs` on a Discord-enriched "hi there, how are
  you?" in this repo returned a 10213-char `discord` briefing.
- Other clips in the code base do not guard surrogates; the briefing cap is new
  and sent on every request, so it gets the guard.
