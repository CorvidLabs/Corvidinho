# Lesson bundle — private-notes-profile-reads-and-the-owner-s-view-of-someone-s-memory-are-shown-only-privately-in-a-discord-conversation

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Private notes, profile reads and the owner's view of someone's memory are shown only privately: in a Discord conversation the memory plugins hand that text past the model (privateText; the model gets a sent-privately placeholder), task run carries it as privateReplies, and the bridge sends it by DM to whoever asked on chat, button pick and Answer form resumes, /session start and /work, with a short sent-privately note in the channel and never the text; refused in schedules and GitHub threads (MEMORY-7.a, #101)
- **Kind**: Feature
- **Specs**: plugins, agent, cli, discord
- **Paths**: hi/memory.md, INTENT.md, plugins/memory/commands.ts, src/plugins/types.ts, src/agent/execute.ts, src/agent/types.ts, src/cli.ts, src/discord/private-reply.ts, src/discord/agent-client.ts, src/discord/types.ts, src/discord/bridge.ts, src/discord/slash-types.ts, src/discord/command-handlers/session.ts, src/discord/command-handlers/work.ts, tests/memory.private-view.test.ts, tests/memory.profiles.test.ts, tests/memory.recall-github.test.ts, docs/discord.md, docs/DISCORD-GO-LIVE.md, docs/WATCH.md
- **Acceptance**: In a Discord conversation memory-recall --category private, the owner's memory-recall --person view and memory-profile (own or --person) return their text only in the result's privateText; data and message - all the model, the tool message and the ToolResult events see - are a sent-privately placeholder, so the model can never repeat it; in a schedule run or a GitHub (WATCH) thread those reads are refused (memory-profile on GitHub included); the local CLI with no role session shows them on the operator's terminal as before; the tool loop hands privateText to onPrivateReply, task run puts it on the result's privateReplies (json / ndjson, a retried attempt's repeat kept once), the Discord agent client reads it back validated (non-empty strings, at most 5, each cut to 6000); the bridge sends each private reply to the person who asked by direct message (scrubbed, split under the 1900-character DM cap) on chat, a button pick and an Answer form resume, /session start and /work, and the channel answer gets a short sent-privately note on top - or, when no DM path exists or a part does not go out, a note that it could not be sent - and never the text, which the session thread never records; everyday own recall and the memory inject are unchanged; tests/memory.private-view.test.ts covers each and fails on main

## Evidence

- Verification commit: `ed934269ae026f2ee30d49a5e0e30f2dbc089b99`
- Base commit: `3b323f3258e3393aabcbb2f44092bf5524ff884c`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec plugins`

## From the change's context.md

# Context

Issue #101 (MEMORY profiles, private notes, forget on request; milestone M1
"Knows everyone"). #101's first slice shipped profiles, project memory,
MEMORY-7 privacy and forget-me (REQ-plugins-101 / REQ-discord-101); #67
(REQ-*-067) added memory in GitHub runs. The #291 rollup found the gap this
change closes: "who can read is enforced, where it is shown is not" — the
owner's `--person` view, private notes and profile reads were returned to
the model, and only a prompt rule stopped it repeating them in a shared
channel.

Leif confirmed the criterion in the 2026-09-28 interview, round 12 (on
2026-09-29), "private things only privately": private notes, the owner's
--person view and profile reads go only to that person or the owner privately
(an ephemeral reply or a DM), never in a shared channel post; the channel gets
a short "sent privately" note. Captured with `hi` in this PR's first commit:

- **MEMORY-7.a** "Private notes, profile reads and my view of someone's
  memory are shown only privately to that person or me, never in a shared
  channel." (parent **MEMORY-7**, already captured.)

Gap on main (20a0f58): `memory-recall --category private`,
`memory-recall --person` and `memory-profile` return their rows / text as
the tool result the model reads; the answer, a later turn, an ask, a tool
argument or a PR can carry it into the channel; `memory-profile` also works
in a public GitHub thread for a declared commenter.

Settled constraints: specs/ only through SpecSync; owner admins, the team
works; v1 off-chain (no AlgoChat / wallet / MainNet surface); self-merge only
in Corvidinho; ask at the spend cap; #232 / #233 scope untouched. No new
config key, env var, table or schema bump.

## From the change's design.md

# Design

- **The model never sees it.** A private read in a Discord conversation
  returns `{ ok, data: { sentPrivately, what }, message:
  SENT_PRIVATELY_MESSAGE, privateText }`. `stringifyToolPayload` never
  reads `privateText`, so the tool message, the ToolResult event, the
  ndjson ToolResult frame and the summary hold only the placeholder. Nothing
  the model writes afterwards — the answer, an ask, a tool argument, a file,
  a PR body, a later turn, a stored memory — can repeat the text.
- **One path out.** `runToolLoop` → `onPrivateReply` → `task run` puts it
  on `TaskResult.privateReplies` (deduped) → the result frame → the Discord
  agent client (`privateRepliesFromUnknown`, capped) →
  `AgentSpawnResult.privateReplies` → `deliverPrivateReplies`
  (`src/discord/private-reply.ts`): scrubbed, split, one DM per part to the
  person who asked, over the forget card's `sendDm`. Chat, button pick,
  Answer form submit, `/session start` and `/work` all call it before the
  answer goes out, then put `PRIVATE_SENT_NOTE` / `PRIVATE_NOT_SENT_NOTE`
  on top of the channel answer (`withPrivateNote`). The recipient is always
  the acting user: the person themself for their own reads, the owner for a
  `--person` read (owner-only).
- **Nowhere private ⇒ refused.** A schedule (a role session without a
  conversation) and a GitHub thread refuse the owner's `--person` view and
  `memory-profile`; private notes keep their existing refusals. The local
  CLI (no role session) is the operator's own terminal and is unchanged.
- **Unchanged:** own non-private recall and the chat / button / WATCH memory
  inject (MEMORY-8/9), the ACL, forget-me, project memory, schedules' and
  WATCH's posting (they never deliver `privateReplies`).

## Design choices pending Leif

Each is the most conservative reading of MEMORY-7.a and the round-12 decision;
none adds a criterion.

1. **The tools deliver privately and the model gets only a placeholder**
   (the brief's second option), rather than delivering the model's whole
   answer privately: the model cannot answer questions from a profile, private
   notes or the owner's view ("what's Tofu's timezone?" sends the listing by
   DM and the model says so) — the only way to guarantee a repeat never
   reaches a shared channel.
2. **A DM on every surface**, including `/session start`, `/work` and
   button / Answer resumes (no ephemeral follow-up yet): one delivery path,
   the forget card's. If the DM does not go out, nothing is shown anywhere;
   the channel note says so (no channel fallback, no ephemeral fallback).
3. **`memory-profile` is refused in GitHub threads** (the brief said WATCH
   already refuses these reads; on main a declared commenter could still read
   their own profile there). This narrows REQ-plugins-067.
4. **Schedules refuse** the owner's `--person` view and `memory-profile`
   (a schedule posts into a shared channel and has no conversation to DM
   from), as private notes already are.
5. **Everyday own recall is not a "profile read"**: `memory-recall` of the
   person's own non-private rows and the automatic memory inject still reach
   the model in a shared channel (MEMORY-8/9); only `memory-profile`, private
   notes and the owner's `--person` view are private.
6. The channel note sits on top of the answer; the DM starts with a short
   "Private — only you can see this" header; private listings show up to 500
   characters per row.

## From the change's testing.md

# Testing

Fixture tests only: a temp allowlist file (the owner and a declared person
with Discord and GitHub ids) and a temp data dir; `runPlugin` with
Discord-conversation, schedule, GitHub-shaped and local-CLI env;
`createTaskExecute` with a fake LLM fetch; the real `task run` spawned by
the Discord agent client against a local fake LLM server; `startBridge`
with a fake gateway (reply, `sendDm`) and an injected agent; the
`/session start` and `/work` handlers with a recording outbound. No
Discord, no GitHub, no network.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-710` | `tests/memory.private-view.test.ts` ("memory plugins: a private read rides privateText …") | In a Discord conversation Tofu's own private notes and profile, and the owner's `--person` recall (id), `--person` profile (Discord id) and `--person` private notes each return the content only in `privateText`; `data` is `{ sentPrivately: true, what }`, `message` the placeholder, neither holds `TOFU-TZ-SECRET` / `TOFU-PRIVATE-SECRET`; the profile text counts private notes only; Tofu's own `--query editor` recall still returns the row. A schedule refuses the owner's `--person` view and profile and Tofu's own profile (MEMORY-7.a, no content); a GitHub declared commenter's `memory-profile` is refused ("never in a GitHub thread") while their recall works; the local CLI shows the profile inline with no `privateText`. |
| `REQ-plugins-710` / `REQ-plugins-101` / `REQ-plugins-067` | `tests/memory.profiles.test.ts`, `tests/memory.recall-github.test.ts` (updated) | The profile, role, owner-view and private-notes tests now read `privateText` (and the structured profile from the local CLI); the GitHub test expects `memory-profile` refused with no content; every other ACL / privacy assertion unchanged. |
| `REQ-agent-710` | `tests/memory.private-view.test.ts` ("the tool loop keeps private text from the model") | The model calls `memory-profile` then `memory-recall --category private`: `onPrivateReply` gets both texts, none of the three request bodies, no event and the result holds either secret, the third request carries "sent privately (MEMORY-7.a)", both ToolResult events succeed; the prompt names the rule and that profiles are never read on GitHub. |
| `REQ-cli-710` / `REQ-discord-710` | `tests/memory.private-view.test.ts` ("task run → result frame → the Discord agent client") | End to end: `createSpawnAgentClient` runs the real `src/cli.ts task run --output ndjson` as Tofu in a conversation against a local fake LLM; `privateReplies` holds the profile and the private notes, the summary and every request body the LLM server saw lack them. `privateRepliesFromUnknown` keeps non-empty strings, at most 5, each cut to 6000. |
| `REQ-cli-710` | `tests/memory.private-view.test.ts` ("task run bounds privateReplies in its own result frame") | The real `task run --output ndjson`, spawned directly as Tofu in a conversation against a local fake LLM that makes seven private reads of different notes, puts the first five on its own result frame (read off stdout, no client re-check), the fifth saying "2 more private results were not sent"; no request body holds a note. |
| `REQ-discord-710` | `tests/memory.private-view.test.ts` ("a long reply is scrubbed before it is cut …") | `privateRepliesFromUnknown` (`boundPrivateReplies`): a GitHub token straddling the 6000 cut is redacted, not left as a prefix, and the text ends with the cut marker (also in the DMs); an emoji text is cut with no lone surrogate; 8 texts ⇒ 5, the last saying "3 more private results were not sent"; a bounded list comes back unchanged. `deliverPrivateReplies` with a text full of `@everyone`: every DM part is still ≤1900 after the gateway's defang. |
| `REQ-discord-710` | `tests/memory.private-view.test.ts` ("delivery helpers") | `deliverPrivateReplies`: none ⇒ null; a long text with a GitHub token ⇒ several DMs to the user, each ≤1900, scrubbed, the first starting with the header ⇒ "sent"; no `sendDm`, a null send or a throwing send ⇒ "failed"; `withPrivateNote` puts the note on top, none unchanged. |
| `REQ-discord-710` | `tests/memory.private-view.test.ts` ("the bridge shows it only privately, by DM") | Chat: one DM to the author with the text; the channel (replies, embeds, content edits) carries the sent note and the model's answer, never the text; the session thread never holds it; with the DM failing the channel carries the "couldn't DM it" note and the text is nowhere. A button pick (Choose ask) and an Answer form submit resume DM the presser / submitter with the note in the channel. |
| `REQ-discord-710` | `tests/memory.private-view.test.ts` ("/session start and /work show it only privately, by DM") | Each handler DMs the invoker through `SlashContext.sendDm`; the collapsed answer and the deferred reply carry the sent note and never the text, nor does the session thread; without `sendDm` the "couldn't DM it" note and no text. |

Fail on main: with main's sources (20a0f58) swapped in for the changed files
(`plugins/memory/commands.ts`, `src/plugins/types.ts`,
`src/agent/execute.ts`, `src/agent/types.ts`, `src/cli.ts`,
`src/discord/agent-client.ts`, `src/discord/types.ts`,
`src/discord/bridge.ts`, `src/discord/slash-types.ts`,
`src/discord/command-handlers/session.ts` and `work.ts`) and
`src/discord/private-reply.ts` removed, `tests/memory.private-view.test.ts`
fails 15 of 16 on its assertions (the one that passes is the unchanged
local-CLI guard, by design) and the updated `tests/memory.profiles.test.ts`
/ `tests/memory.recall-github.test.ts` fail 5 of 35 (the five assertions
this change turns around). Restored, all 51 pass.

Review follow-up (bounded private replies, defang before the DM split): the
two added tests fail with the pre-fix sources (`src/cli.ts` and
`src/discord/private-reply.ts` at 50839ad) — the child's frame carried all seven reads and the client cut a
straddling token to a prefix with no marker — and pass after; they fail on
main too (no `privateReplies`, no bounding). Now 18 tests in the file.

Full suite: `bun test` green; `bunx tsc --noEmit` clean; `specsync check
--require-coverage 100` 100%; `hi check` green; `fledge lanes run verify
--non-interactive` completed.

## Where these lessons go

- `specs/plugins/context.md`
- `specs/agent/context.md`
- `specs/cli/context.md`
- `specs/discord/context.md`
