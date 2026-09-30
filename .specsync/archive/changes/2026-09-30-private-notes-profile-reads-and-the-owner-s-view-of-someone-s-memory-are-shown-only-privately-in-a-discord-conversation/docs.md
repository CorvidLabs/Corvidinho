---
change: private-notes-profile-reads-and-the-owner-s-view-of-someone-s-memory-are-shown-only-privately-in-a-discord-conversation
artifact: docs
---

# Docs

- `docs/discord.md` Memory: `memory-profile` goes to the asker by DM;
  new bullet "Shown only privately (MEMORY-7.a)" (placeholder to the model,
  `privateReplies`, DM on every surface, the channel note, DM failure,
  refused in schedules and GitHub); GitHub bullet names profile reads.
- `docs/DISCORD-GO-LIVE.md`: the owner's `--person` view arrives by DM;
  "Private reads by DM" note with the DM prerequisites (shared server, DMs
  from members allowed).
- `docs/WATCH.md`: `memory-profile` is no longer among what a GitHub
  commenter can read; profile reads are refused there.
- Specs: `specs/plugins/plugins.spec.md`, `specs/agent/agent.spec.md`,
  `specs/cli/cli.spec.md` prose; `specs/discord/discord.spec.md` memory
  invariant and `files:` (+ `src/discord/private-reply.ts`,
  `tests/memory.private-view.test.ts`); `specs/*/testing.md`.
- No new config key, env var, slash command, table or schema bump.
