---
change: if-a-model-fails-or-is-retired-it-falls-back-to-my-next-configured-model-and-tells-me-agent-11
artifact: research
---

# Research

- Sources: issue #80 (body: steal-from table — Merlin provider_chain.rs /
  fallback.rs, m#1165 / m#1167 / m#1188 "404/410 model gone → fail over";
  corvid-agent fallback.ts / router.ts; one progress comment, no Leif comment),
  Leif's interview record `/home/user/coord/interview-2026-09-28.md` (round 2,
  round 4 on caps), the slice record `/home/user/coord/pr-providers-3.json` and
  the providers rows of `/home/user/coord/m34-defaults.md`.
- Every surface reaches the model through `task run` (`createTaskExecute` →
  `chatCompletions`): Discord chat, picks, `/session`, `/work`, schedules
  (bridge and daemon), WATCH, delegate and council workers (child processes).
  So one chain per `createTaskExecute` covers them all, and "no persistence"
  is simply "per process".
- `chatCompletions` already turned every provider problem into
  `{ ok: false, error, status? }` and never threw; the SAFE-8 guard throws
  `SpendCapRefusal` from the wrapped fetch before anything is sent, which
  landed in the same "request failed" branch — it has to be told apart.
- Deny and card lapse come from the must-ask gate inside `runPlugin` (tool
  calls), never from a model call, so they cannot fail over by construction; a
  test pins it.
- The image-refusal retry (REQ-agent-428) keys on the reply status; it has to
  run on the same model before a failover.
- Clips that keep the role note (`clipKeepingRoleNote`: result frame, chat
  body, WATCH summary, schedule post, ask ping; `splitDiscordMessage`) are the
  places a closing note must survive.
- The Discord footer priced total usage at the bridge's configured model
  (`answerSpendFor(result.usage, llmModel)`); after a failover that model is
  wrong, and two models need two prices.
- Workers pass SAFE-13 hits back through result frame → `DelegateChildOutcome`
  → tool `data` → the lead's loop; failovers follow the same path.
