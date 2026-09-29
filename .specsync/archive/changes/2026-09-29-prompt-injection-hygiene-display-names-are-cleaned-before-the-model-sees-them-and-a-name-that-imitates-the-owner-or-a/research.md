---
change: prompt-injection-hygiene-display-names-are-cleaned-before-the-model-sees-them-and-a-name-that-imitates-the-owner-or-a
artifact: research
---

# Research

Surfaces that put third-party text into a model prompt (mapped before
building):

- Discord chat (`bridge.ts` `onMessage`): the speaker's words (after
  `stripMentions`), a free-text ask answer, image attachments (files only),
  the IDENTITY-4 block (Discord display name / username), the memory block,
  the replayed session thread (`session-thread.ts`).
- Button-pick resume: the option label (model-written) and the presser's
  names through the IDENTITY-4 block.
- `/session start` topic and `/work` description (slash handlers), plus the
  IDENTITY-4 block. No modal input exists on this base.
- Schedules: the prompt is written by the ADMIN who created the schedule
  (`/schedule create` is owner-only); tool results inside the run.
- WATCH (`watch/router.ts` `buildPrompt`): issue / PR / comment title and body,
  the commenter's login (GitHub-validated charset), the WATCH identity block
  (owner-configured names).
- Tool results in any run: `web-fetch` (already fenced), the GitHub readers
  (`github-pr-list`, `-pr-status`, `-ci-status`, `-issue-list`,
  `-docs-read`, `-milestone-list`, `-pr-diff`, `-pr-files`),
  `discord-user-lookup` (guild member names), `memory-recall` (the user's own
  facts), project files / search / git / fledge (the owner's repo).

Where display names reach the prompt: `identity-inject.ts` (chat, button
pick, `/session start`, `/work`) and `discord-user-lookup` results; the
bridge's `[discord] identity inject … as <label>` log line.

The role gate (`resolveActingRole` in `runPlugin` and the catalog) already
decides every mutating call on every surface from declared ids; nothing in a
prompt can raise it. `task run` carries run facts to bridges on the NDJSON
`result` frame (`spendWarning` pattern), so a tool-loop hit can reach the
bridge's owner ping the same way. The SAFE-8 post helpers
(`withSpendWarningPost`, `slashOwnerNotice`) are the owner-notice path; there
is no DM path (DISCORD-5 / DISCORD-8), so "tell the owner" is a ping in the
post the bridge already makes. WATCH knows the owner's GitHub login.

Steal notes (corvid-agent `prompt-injection.ts`, `injection-guard.ts`,
`agent-input-sanitizer.ts`; Merlin m#1152): heuristic tripwire with fixed
categories (instruction override, role / system markers, identity claims,
secret exfiltration, tool-call smuggling), unicode normalisation (NFKC,
zero-width / bidi / tag removal, homoglyph fold) before matching, speaker
names sanitised in bridge tags. Not taken: a classifier model (out of scope in
#71), cross-channel advisories.
