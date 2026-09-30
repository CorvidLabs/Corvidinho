---
change: forget-from-github-and-from-admin-approved-on-the-card-a-declared-person-matched-by-github-numeric-id-who-comments
artifact: research
---

# Research

- Forget today (`src/memory/forget.ts`, `src/discord/forget-card.ts`,
  REQ-discord-101): `forget_requests` (schema v12) holds ids and times only;
  `requester_user_id` is NOT NULL text and `origin_channel_id` nullable text,
  so an asker kind and a GitHub thread fit as prefixed values without a
  migration. `forgetTargets` adds `requesterUserId` to the Discord ids for
  every ask, and the pass DMs / posts to `requesterUserId` — both must learn
  the new kinds. The delivery pass runs in the bridge on every scheduler tick
  and after chat; the table is in the shared data dir, so a row written by the
  watch process reaches the owner's card with no new IPC.
- WATCH (`src/watch/poller.ts`): events pass `gateEvent` / `preferAllowlisted`,
  then `dedupeByIssue` keeps one event per issue and marks the rest
  processed — a forget ask must be taken out before it. Comments are already
  posted by the poller (`AckClient.createIssueComment`, rate-limit backoff via
  `onPostFailed`), as SAFE-13 refusals do. Kept conversations
  (`conversation_threads`) record `github:<login>` participants only.
- Identity (`src/identity/people.ts`): `resolvePerson` with only
  `githubId` resolves by `byGithubId` (numeric id) — IDENTITY-7.a's rule
  for this path; `byGithubLogin` tells a login-only declared person apart.
  `memorySubjectForRef` treats digit strings as Discord ids, so /admin needs
  an exact person-id resolver (`memorySubjectForPerson`).
- /admin (`src/discord/command-handlers/admin.ts`): the people ops re-check
  ADMIN, audit `started` first (fail closed) and reply ephemerally; the
  dispatcher already floors /admin at ADMIN. `SlashContext` has no DB handle,
  only `recordAudit`, so the ask and the card pass are passed in as hooks.
- corvid-agent steal notes (#101) cover contacts and memory families; nothing
  there on GitHub-side forget — the path mirrors the SAFE-13 refusal comment.
