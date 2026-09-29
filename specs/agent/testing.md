# Agent — testing

`tests/agent.loop.test.ts`, `tests/agent.config.test.ts`, `tests/agent.cli.test.ts`.
- `tests/autonomous.enabled.test.ts`: AUTONOMOUS-1 gate fixtures, SAFE-9 catalog
  hiding, ROLES-CHAT non-ADMIN / ADMIN catalogs, tool-loop delegate via a fake
  bin (REQ-agent-117).
- `tests/autonomous.council.test.ts`: council core with an in-process fake
  runner (phase order, concurrency <= 2, critique / chair prompts, failed
  voices, < 2 proposals, failed chair, scrub + caps, per-voice and council time
  caps, lead abort) and the tool loop offering / running `council` against a
  `.ts` fake bin (REQ-agent-118).

## Soft-land tool rounds (REQ-agent-312)

`tests/agent.soft-land.test.ts` covers exhaustion soft-land, chatBody scrub, and mention rewrite.

## Per-tier model (REQ-agent-079)

`tests/agent.tool-loop.test.ts` "per-tier model (AGENT-5, REQ-agent-079)":
fallback order, `--tier` override precedence, request `model` per tier, no
per-tier keys = unchanged, SAFE-8 pricing of an unpriced read model (the ask
names the key that set it), `modelKeyForTier` / `perTierModels`, and doctor /
`/status` spend lines that flag an unpriced per-tier model with its tier.
`tests/autonomous.delegate.test.ts`: a read-tier worker env resolves the read
model. `tests/cli.doctor-truth.test.ts` / `tests/agent.cli.test.ts`: doctor
`[ok] llm` per-tier line and help (REQ-cli-009).
## Real-diff verify gate (REQ-agent-085)

`tests/agent.loop.test.ts` "runTask verify gate uses the real git
working-tree diff (AGENT-4, REQ-agent-085)": temp git repos where an attempt
edits outside the file tools and reports `filesChanged: []` — failing lane
ends failed, passing lane ends done verified; new untracked file + deleted
file; same-size edit to an already-dirty file; commit through a shell; first
commit on an unborn HEAD; shell-only retry re-verified with feedback; cwd
subdirectory (cwd-relative paths, edits outside ignored); untouched pre-run
dirt, gitignored-only change and a non-git cwd still skip; an unreadable diff
fails closed; a 30000-path diff adds `WORKSPACE_DIFF_MAX_FILES` paths and the
streamed NDJSON result still parses; with the hash budget spent an untouched
dirty file stays quiet and an edit to it is caught; the gate off takes no
snapshot.
`tests/agent.tool-loop.test.ts` "runTask: a real code-tier shell-exec edit
reaches the verify gate": end to end through the real `shell-exec` plugin.
## Allowlisted dangerous tools in task run (REQ-agent-501, REQ-agent-502)

`tests/agent.allowlisted-dangerous.test.ts` (fake provider, fake `fledge` on
PATH, GitHub dry run; no network): the catalog offers the allowlisted GitHub
writes and memory forget/override at tool tier and leaves unlisted dangerous
tools out; every offered dangerous tool is allowlisted; `files-delete` needs
code tier; `shell-exec` and the runners are never offered from the allowlist;
a non-ADMIN session gets no dangerous or mutating tool. Through
`createTaskExecute` with `CORVIDINHO_ALLOWLIST=github-pr-review` the review
runs (dry run) and an unlisted `github-issue-create` is refused; ADMIN gets
it, non-ADMIN does not. An allowlisted `fledge-hello` is discovered, offered
and run without `includeDangerous`; an allowlist with no `fledge-*` entry,
or a non-ADMIN role session, never spawns fledge (the owner's ADMIN session
does). In a non-git project a Fledge edit no tool reported runs verify and
fails (allowlisted, and with `includeDangerous`), a GitHub-only run still
skips verify, and the gate off stays done; a `delegate` call whose worker
failed its own verify makes the lead verify and fail when the allowlist names
`fledge-hello`, and skip verify when it names no `fledge-*` command; a worker
that writes `app.ts` and exits 137 before any result frame makes the lead
verify once and fail (never `done` with verify skipped) with an empty
allowlist, and the note names `delegate`.
`tests/agent.tool-loop.test.ts` "tool loop dispatches only offered tools":
an unlisted `danger-ping` in an interactive run and an allowlisted
`shell-exec` at code tier are refused as not offered (REQ-agent-128).

## Verify retry feedback (REQ-agent-002, AGENT-4.a)

`tests/agent.verify-feedback.test.ts`: `verifyFeedbackExcerpt` on a fledge
lane log shaped like Corvidinho's own (`tests/fixtures/verify-lane-log.ts`:
`lint` and a `--help` smoke over 4000 chars pass, then `test` fails) keeps the
failing step whole and drops the `--help` head; a failing step whose own
output is over the cap keeps its first error lines and the end of the log,
with no passing-test lines; console chatter that only mentions a failure
(the `chattyFailingLaneLog` fixture: Corvidinho's bun test stdout before its
stderr report) does not crowd out the failure's own lines; colour escapes are
dropped and hide no marker; a failing parallel step is named whole and kept
from its `Running parallel:` line; a log with no fledge markers keeps its end
and is not called a failing step's output; output within the cap is
unchanged; never over the cap and never half a surrogate pair, including an
emoji `error:` line that the end of the error-line scan cuts (61 noise counts
after it, at 4000 and at runTask's 3946 cap). `tests/agent.loop.test.ts`: the retry's `verifyFeedback` from that log
names the failing test within 4000 chars; a short output arrives whole.
`tests/agent.tool-loop.test.ts`: the tool loop's retry request and the
read-tier chat carry the failing step, not the first 4000 chars.
## Images as image parts (REQ-agent-428, DISCORD-9)

`tests/agent.tool-loop.test.ts` ("files-read images reach the model as image
parts") — scripted fake `fetchImpl`: the round after a `files-read` of a PNG
carries the small tool message then one user message with an `image_url`
data URL; two images in a round share one user message; `ToolResult` detail
and ndjson never hold the base64; HTTP 400 on the image request retries once
with the note in the image's tool message (no user message after tool
messages) and completes, also against a provider that rejects that role
order; 404 / 413 / 415 / 422 fall back too, 401 / 429 / 500 do not; a refusal
drops earlier rounds' images too; a later image after a refusal gets the note
with no second retry; 400 on the retry, or with no image, stays an error.

## Role refusal for invented calls (REQ-agent-333)

`tests/roles.chat.gates.test.ts` "ROLES-CHAT-3 invented mutating calls in the
tool loop": with a fake provider and no network, a non-ADMIN role session's
invented call to every registered mutating plugin gets exactly `runPlugin`'s
role refusal, runs nothing, keeps the live progress lines free of the refusal
and the names, and the summary ends with `(not allowed for your role)` (kept on
a later attempt); an offered `files-write` refused by `runPlugin` after the
owner is muted mid-run also adds the note, and so does an invented
`files-write` after an ADMIN caller is muted mid-run (ADMIN re-checked at the
call); an offered tool whose own error only quotes the phrase adds no note; a
long reply keeps the note through the `resultFrame` and `chatBodyFromTaskResult`
caps; an unregistered name, ADMIN and the local CLI keep the "not offered"
refusal with no note; a summary that already says it gets no second note.
- `tests/discord.send-file.test.ts` › "the model is told it can attach"
  (REQ-agent-476, DISCORD-17): fake provider; with `discord-send-file`
  allowlisted and `CORVIDINHO_DISCORD_REPLY_CHANNEL_ID` set the tool is
  offered and the system prompt carries `Attachments (DISCORD-17)`, "never
  say you cannot send or attach files or images" and the `--git-diff` hint;
  not allowlisted, or no conversation channel, the prompt has no attach
  block.

## Catalog by role (REQ-agent-065, IDENTITY-9..12 / ROLES-CHAT-8.a)

`tests/roles.team.test.ts` ("the catalog by role") — `buildOpenAiTools` with
every dangerous plugin allowlisted: `actingRole: "owner"` and `null` equal the
old ADMIN catalog, `community` equals the old non-ADMIN one (no mutating tool);
team offers the read tools plus `github-issue-comment` / `github-pr-review`
and nothing else mutating, plus exactly `files-write` / `files-edit` with
`workTask`; an unallowlisted review tool is not offered. Through
`createTaskExecute` with a scripted provider: a team chat run offers the
review tools and not `files-write` or `github-pr-create`; a team `/work` run
adds the file tools; a team member on a community-stamped surface and an
undeclared actor with a team stamp get read tools only.
`tests/github.public-docs.test.ts` checks the public Q&A prompt names the
ROLES-CHAT-8.a sources and says nothing else counts.
`tests/discord.memory-inject.test.ts` keeps checking the memory rules
(trust / store / recall / never invent); `tests/memory.profiles.test.ts`
checks the MEMORY-5..7 / MEMORY-ACL-6 rules (profile categories and
`memory-profile`, `memory-recall` / `memory-store --project`, never telling
one person about another, private notes never injected, `memory-forget-me`
until the owner approves on a card), and the plugins they name are covered
there and in `tests/discord.forget-card.test.ts` (REQ-agent-101).

Recall before "I don't know" (MEMORY-9 / MEMORY-8, #67 / REQ-agent-067):
`tests/memory.recall-github.test.ts` › "the tool loop searches memory before
\"I don't know\"" — with a fake LLM, a final "I don't know who Tofu is." in a
run whose actor has a stored fact makes the loop run `memory-recall` itself
(a `ToolCall` event), send the fact back once and return the second reply;
with nothing stored the reply stands after one model call; a task with an
injected memory block, or a run where the model already called
`memory-recall`, gets no second search; a task led by a project block only (a
`/work` run) still gets one search of the person's own memory; a memory
header quoted inside the message does not turn the search off; end to end in
a GitHub-shaped env the model's `memory-store` → SQLite (`person:tofu`) →
`memory-recall` → model. `tests/memory.rank.test.ts` › "recall-guard" —
`claimsIgnorance` phrases and non-matches, `taskHasMemorySearch` /
`injectedMemorySearches` (only the head blocks count, own and project apart),
`memoryRecallSearchKind`, `memorySearchQuery` (harness blocks, WATCH label and
URLs dropped) and `searchMemoryBeforeIgnorance` (own rows then project rows,
only the searches not yet run, refusals or nothing ⇒ null).
## Unique ask option ids (REQ-agent-045, DISCORD-ASK-1/3)

- `tests/discord.ask-buttons.test.ts` › "ask option ids are unique
  (DISCORD-ASK-1/3 / REQ-agent-045)": a repeated explicit id, a position
  fallback equal to an earlier id and two ids equal once cut to 32 chars each
  take the first unused position number; a dropped empty option holds no id;
  already-unique options normalize byte-identically (again and again); an
  ask-human call with one id twice gives buttons with distinct `custom_id`s.

## Untrusted text in the task run (REQ-agent-071, SAFE-11/12/13)

`tests/safe.injection.test.ts` — `cleanDisplayName` drops mention markup,
invisible / bidi / tag characters and role-like tags / labels, drops a name
that is only a role word (also full-width or look-alike), keeps ordinary
names and caps at 32; `namesLookAlike` folds case, homoglyphs and `1` / `l`;
`fenceUntrustedData` keeps its random end marker last and unique, defangs the
word inside, strips invisible characters and quotes fake Corvidinho lines;
`detectInjection` trips on 30 known payloads (every reason id, look-alike and
zero-width variants) and on none of 26 ordinary messages / bug reports (a
speaker correcting their own earlier message, questions about tokens or keys
in code, "list your instructions for …", a browser's developer mode), and a
large hostile body scans in well under 2 s; `injectionNoticeFromUnknown`
keeps only a tool-name source and known reason ids; the tool-loop and
read-tier system prompts carry `UNTRUSTED_CONTENT_AGENT_SYSTEM_INSTRUCTIONS`;
a community run whose task claims the owner and asks for `files-write`
offers no mutating tool and the call gets the role refusal, nothing written;
through `createTaskExecute` with fake `github-issue-list` / `files-write`
plugins, an injected issue title makes the tool message start with the SAFE-13
note and hold the fenced result, the next request offers no `files-write`, a
`files-write` call is refused and writes nothing, `onInjection` gets the tool
and reason once, one `injection-suspected` row is audited and the summary
ends with the note; the web fence's own lines are not a hit. A fake
`delegate` result, and a failed fake `council` result, carrying a worker's
`data.injection` get the worker note and the fence, the next request offers
no `files-write`, `memory-store` or worker tool, both calls are refused and
never run, `onInjection` gets the worker's notice once, the summary ends with
the note and one row is audited; at delegation depth 1 an injected issue
title is reported but records no row.
