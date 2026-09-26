---
change: dogfood-ux-discord-identity-inject-identity-4-thinking-embed-model-plumbing-discord-3-a-clean-chat-replies-community
artifact: design
---

# Design

- `identity-inject.ts`: format/enrich prompt with Discord id + resolved display; gateway fills authorDisplayName/username; bridge + slash wire before memory inject.
- `task-summary.ts`: split `formatTaskPlumbing` vs `chatBodyFromTaskResult`; NDJSON collector / Discord summary use chat body only.
- `ThinkingStatus`: optional `model` + `plumbing` on snapshot/footer; `done`/`fail` accept extras.
- `githubPublic.ts` `checkRepoGateForActingRole`: community → Octokit visibility (injectable); public allow; private/unknown refuse; deny wins; ADMIN → existing allowlist.
- `isSecretPath` + files-read refuse for non-ADMIN role sessions.
- System prompt: IDENTITY + PUBLIC_QA instruction blocks.
