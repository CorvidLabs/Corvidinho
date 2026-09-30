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
reaches the verify gate": end to end through the real `shell-exec` plugin,
writing with `cp broken.ts app.ts` (SAFE-21 refuses a `>` or `tee` edit,
REQ-plugins-494).
## Allowlisted dangerous tools in task run (REQ-agent-501, REQ-agent-502)

`tests/agent.allowlisted-dangerous.test.ts` (fake provider, fake `fledge` on
PATH, GitHub dry run; no network): the catalog offers the allowlisted GitHub
writes and memory forget/override at tool tier and leaves unlisted dangerous
tools out; every offered dangerous tool is allowlisted; `files-delete` needs
code tier; `shell-exec`, the runners and the Fledge core runs (`SAFE3A_TOOLS`)
are not offered from the allowlist without the SAFE-3.a grant (a local run
never has it); a non-ADMIN session gets no dangerous or mutating tool. Through
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
- Scrub before cut (REQ-agent-045 modified, SAFE-6.a):
  `tests/agent.ask.test.ts` › "SAFE-6.a: ask questions and choice labels are
  scrubbed before they are cut": a question whose fake key straddles the 1500
  cut comes out `…[redacted:github-token]…` from `askFromToolArguments` and
  `askFromUnknown` (and in `formatAskSummary`), and for every cut position
  across the key no raw `ghp_` piece survives; a label straddling the 80 cut
  does the same from string options, `{id,label}` options and numbered
  question lines, a secret-looking id still becomes its position; a numbered
  choice the question cap cuts is parsed from the scrubbed question. Fails on
  the base sources. "a cut that ends a key shape is scrubbed too…": `AKIA`
  plus 20 capitals placed so the cut keeps 16 comes out
  `…[redacted:aws-key]…` for a label and a question, and normalizing the
  result again changes nothing.


## Persona file (REQ-agent-069, PERSONA-1..3)

`tests/agent.persona.test.ts`: `loadPersona` / `renderPersona` in temp git
checkouts (committed file loads with no note; no file → no block and one
note, a parent checkout's `persona.md` never read; a plain root inside a git
parent reads its own file; working-tree edit not loaded; untracked refused;
token scrubbed and `</persona>` / `</ Persona >` escaped; over-cap cut; empty
→ no persona). `createTaskExecute` with a mock provider on the tool loop and
read tier over two attempts: persona block first, the PERSONA-3 rules and
"You are Corvidinho" after it, project AGENTS.md after the rules, the
finishing rule says "never a flat changelog"; a committed edit shows on the
next run; no file keeps the rules and emits one note; by default the persona
comes from Corvidinho's checkout, never a decoy in the cwd. The shipped
`persona.md` loads whole, passes `scrubSecrets` unchanged and carries the
persona shape and voice. End to end against a 127.0.0.1 fake provider:
`corvidinho task run`, the Discord spawn client, the WATCH spawn client and
a delegate worker each send the shipped persona first and the rules after it.
A Discord run offered `discord-send-file` keeps the attach block after the
persona, and the PERSONA-3 one-message rule allows an attachment. Tests that
assert a run's exact events (project instructions, spend warning, NDJSON
running totals) pass `personaRoot` = `tests/fixtures/persona` (a plain
folder, a clean load), so an uncommitted edit to the checkout's `persona.md`
never breaks them or the verify lane.
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

## Private text kept from the model (REQ-agent-710, MEMORY-7.a)

`tests/memory.private-view.test.ts` — a fake-LLM run whose model calls
`memory-profile` and `memory-recall --category private` hands both texts to
`onPrivateReply`; no request body, event or the result holds them and the
model gets the "sent privately" placeholder; the prompt names the rule.
## Verification can't be skipped; the real diff since the talk started decides (REQ-agent-003, REQ-agent-085, REQ-agent-015)

- `tests/agent.verify-gate.test.ts`: a project `fledge.toml` with
  `verify_before_complete = false` still verifies a real edit (runTask and
  the real CLI with a fake `fledge`); a talk worktree made by
  `ensureTalkWorkspace` starts verified; an edit left by a run that ended
  blocked, failed, cancelled, or whose process died (marker taken, never
  settled), and a commit made through a shell, are verified by the next run
  that changes nothing (carried note, merge-base baseline); a talk whose base
  branch is gone verifies anyway; the caller's own checkout keeps the
  run-start baseline; marker take / settle / symlink / planted-marker cases;
  a claimed path git does not show is left out of `filesChanged` yet runs the
  lane (and its retry after a failed verify runs it again); a delegate or
  council worker (`{ nested: true }`, and the real CLI with
  `CORVIDINHO_DELEGATE_DEPTH=1`) in its lead's talk worktree keeps its own
  baseline and never writes the marker, so a lead that dies still leaves its
  edits carried.
- `tests/agent.loop.test.ts`: a run that changed files verifies with no
  option; a run that changed nothing ends `done` with one "no changes,
  nothing to verify" note; the snapshot is always taken; the huge-diff cap
  note counts all changed paths.
- `tests/agent.allowlisted-dangerous.test.ts`: the non-git Fledge run in a
  project whose `fledge.toml` sets the removed key still verifies and fails.
- `tests/agent.config.test.ts`: `parseCorvidinhoSection` reads only
  `max_retries`; `removedVerifyKeys` names the key only under `[corvidinho]`.
- `tests/agent.execute.test.ts`, `tests/agent.tool-loop.test.ts`: a run with
  no usable provider reports no files and calls nothing (REQ-agent-179).
## SAFE-13 WATCH owner exemption by numeric id (REQ-agent-071, REQ-watch-367)

`tests/safe.injection.test.ts` › "the verdict skips the owner (by [owner]
github_id only, IDENTITY-7.a)" — `watchInjectionVerdict` exempts the owner's
numeric id and flags the same injected body from the owner's login with no
id or another id; fails on the base sources (the login alone was exempt).

## Repeated failing calls are steered, then ask (REQ-agent-086, AGENT-16)

`tests/agent.loop-guards.test.ts`: `callSignature` (argv spellings of one call
match); `changedState` (every registered dangerous or mutating builtin is in
exactly one of `STATE_CHANGING_TOOLS` / `NO_STATE_CHANGE_TOOLS`; writes,
failed `delegate` with `filesChanged` and Fledge plugin commands are changes;
reads, `web-fetch`, `council`, `danger-ping`, `fledge-lanes-run` are not); the
guard (steer on the 2nd identical failure, ask only after the steer was seen
in an earlier round, same-batch and new-conversation calls steered again,
reset on change and on the call's own success); the tool loop over a scripted
mock LLM (steer after the whole tool result with a scrubbed excerpt, the 3rd
identical call never runs, `ToolResult` `REPEAT_FAILURE_BLOCK_DETAIL`, the
`[operator] AGENT-16` line, the stuck ask naming only the tool or
`(unknown tool)`, a change resets, a verify retry steers before it asks, a
worker result fenced for an injection hit gets a steer quoting none of it);
`runTask` ends `blocked` without verify; the real CLI `task run --output
ndjson` against a localhost mock ends with a `blocked` result frame carrying
the stuck ask.
- Fail on base: with the base's (5093b81) `src/agent/execute.ts` swapped in
  (the new module kept), the tool-loop, runTask and CLI cases fail (no steer,
  no ask; the loop runs out its rounds); the pure units and the "changes
  approach" guard pass on both.

## Public spend text (REQ-agent-098 modified, SAFE-14.a)

`tests/discord.spend-dm.test.ts` › "the public spend text" — `SPEND_PAUSED_TEXT`
is "Work is paused for budget." and `SPEND_CAP_SUMMARY` equals it;
`formatSpendPublicStatusLine` is undefined with no cap or under the cap and
"Spend: Work is paused for budget." at the cap, for an unpriced model, an
invalid value and an unreadable ledger (no amounts, no path); `spendPaused`
flips exactly at the cap; the owner's `formatSpendStatusLine` keeps the
amounts. `tests/agent.spend-ask.test.ts` and `tests/agent.spend.test.ts` keep
asserting that a stopped run's summary is `SPEND_CAP_SUMMARY` (no `$`, no
`CORVIDINHO_`) and that the question carries the details.

## Tests ran and none deleted (REQ-agent-185, AGENT-15)

`tests/agent.test-evidence.test.ts`:
- Summaries: `bun test` (pass + fail count, skip / todo don't; a lane of only
  skipped tests ran none), the real `bun test` output of this Bun (FORCE_COLOR
  on, stdout then stderr as the runner joins them) recognised with 2 executed,
  jest, vitest, `cargo test` (one line per binary, summed), pytest (`==` and
  `-q` forms, `no tests ran`), `go test` (`-v` top-level PASS / FAIL lines,
  or `ok` packages without `[no tests to run]`, `[no test files]` = 0);
  "ok", "All checks passed." and the like are not recognised. The verdict
  note names the verify lane and the runners, says no test ran, names drops
  as `"name" (file)` and stays under 2000 chars for 40 long names.
- Declarations: JS/TS `.skip`, `.todo`, `x`-names, a skipped `describe` and
  comments are not active tests, and `.skipIf` / `.if` / `describe.skipIf`
  ones are conditional; `.each` and template titles are active; a `.only`
  silences its file's other tests. pytest skip decorators (multi-line too;
  `skip` off, `skipif` and a module `pytestmark` skipif conditional),
  `Test*` classes, a skipped class, docstrings and comments; Go
  `TestX(t *testing.T)` outside comments; Rust `#[test]` /
  `#[tokio::test]` with `#[ignore]` off, comments and lifetimes ignored.
  Test-file paths per language. `droppedTests`: a move or a renamed file is
  not a drop, a retitle and a removed duplicate are; deleting an already-off
  test is a drop and keeping it off is not; a conditional test deleted or
  turned off, or a running one made conditional, is a drop, and one kept
  conditional, made to run or moved is not (one match per declaration,
  strongest first); drops come back in baseline order.
- The gate in temp git repos (stub lanes): no recognised summary → not
  verified, the retry's feedback starts with the note, both `VerifyResult`
  events `success: false` with the note; all-skipped lane → "no test ran";
  tests ran and none deleted → `done` verified with `Verify gate: 12 test(s)
  ran (bun test: 12), and none were deleted.`; a deleted test named in the
  feedback and a retry that restores it verified; deleting the file, `.skip`,
  `.todo`, a sibling `.only`, a retitle and commenting out each named;
  deleting a `.skipIf` test, a test in a `describe.skipIf` suite and a
  `.skip` test each named, while touching their file and keeping them is
  verified; a renamed / moved file and a test moved to another file verified; a deletion
  committed through a shell seen; a test file dirty before the run compared
  with its start text (untouched: verified; its extra test removed: named);
  a run in a subdirectory sees a test deleted outside it (root-wide); a
  carried talk whose blocked run deleted a test re-runs the lane on each
  later turn and stays unverified; a tracker whose baseline git cannot give
  (no base branch, a missing commit) returns null.
- Non-git: a `.skip` in a plain project is named; a renamed file is verified;
  a walk over its entry cap and a missing dir return null.
- The real CLI in a carried talk worktree with a fake `fledge`: exit 0 with
  no summary → exit 1, `failed`; a `bun test` summary on stderr → exit 0,
  `done` verified.
- `tests/agent.verify-gate.test.ts`: a talk whose base branch cannot be
  found still runs the lane, and now ends `failed` (not verified) with the
  "could not read the test files" note.
- Stub lanes that pass print a `bun test` summary
  (`tests/fixtures/lane-output.ts` `LANE_PASS_OUTPUT`); in-process runs that
  use tool-reported files run in an empty scratch dir (`NON_GIT_CWD`), not
  `/tmp`, whose walk can be over its cap.
- Fail on base: with the base's (156cfa9) `src/agent/{loop,workspace-diff,types,index}.ts`
  and `src/work/pr.ts` swapped in (the new `src/agent/test-evidence.ts`
  kept so the file loads), 20 tests fail across `tests/agent.test-evidence.test.ts`
  (every gate, non-git, CLI and /work case) and `tests/agent.verify-gate.test.ts`
  (the no-base talk ends verified on the base); the pure summary and
  declaration units pass on both. Restored, all pass.
## AUTONOMY-11 sentence (REQ-agent-097)

`tests/must-ask.boundary.test.ts` — `ASK_AGENT_SYSTEM_INSTRUCTIONS` carries
the "Must-ask (AUTONOMY-9..11)" sentence and the tool loop's system message
holds it; in one round a files-write runs with no card while a
`discord-post-message` waits for the owner's card, and the owner's no reaches
the model as the tool's refusal (`refused (AUTONOMY-10) … the owner denied
it`), which it reports in its answer. `tests/agent.events-ndjson.test.ts`:
`progressFromFrame` shows the gate's wait line as "waiting for the owner's OK
on an Approve card" and every other `Text` frame (model text included, even
one that says it is waiting) as nothing.

## Model providers, no built-in default (REQ-agent-179, REQ-agent-007, REQ-agent-079; AGENT-13 / AGENT-10)

`tests/agent.providers.test.ts` — entry parsing (`kind:model`, bare and
unknown prefixes are OpenAI-compatible, comma lists), per-tier resolution with
no default, each kind's endpoint and key (`resolveEntry`, `OLLAMA_HOST`
forms, `providerId`), the transport per kind over a mock fetch (ollama: no
authorization header; anthropic: its own key; a list calls only its head
while the head answers),
the no-provider notice per case, `runTask` ending `failed` with the notice and
no provider call, the real `task run` against a localhost keyless `ollama:`
fake, and the `ANTHROPIC_API_KEY` SAFE-6 redaction.
`tests/agent.execute.test.ts` / `tests/agent.tool-loop.test.ts`: a key alone
picks no model; an attempt with no provider fails with the notice.
- Fail on base: with the base's (156cfa9) sources swapped in (the new module
  kept), 15 of 18 fail (the 3 pure units of the new module pass).
- Tests that used the demo stub or the default model now use
  `tests/fixtures/fake-llm.ts` (a localhost fake, an injected fetch, or a
  configured model for bridge footers).

## Model fallback (REQ-agent-080, REQ-agent-179, REQ-agent-007, REQ-agent-079; AGENT-11)

`tests/agent.fallback.test.ts` — mock providers only (an injected fetch keyed
by `body.model`, a localhost `Bun.serve` for the real CLI, fake `corvidinho`
sh bins), no network, no key:
- `callChain`: the head fails once and the next entry answers; the chain keeps
  it (no retry of the head); `failure: null` never fails over; the last
  entry's failure comes back; a next entry without its key is skipped
  uncalled with `ANTHROPIC_API_KEY is not set`. The operator line, the note
  (idempotent), the log line and `answeredModelLabel`; child failovers and
  usage validated, scrubbed and bounded; `mergeModelFallbacks` dedupes.
- The tool loop fails over on HTTP 404, 410 and 500, a network error, a
  timeout (`llmTimeoutMs` 40), a non-JSON reply and a reply with no assistant
  message: requests go `model-a` then `model-b`, the summary ends with the
  note, one `[operator] model-a failed (<reason>); falling back to model-b`
  Text event, `onModelFallback` and `onModel` report it. Later rounds and a
  second attempt stay on `model-b` (the head is called once); a fresh
  `createTaskExecute` tries the head again. The read tier fails over too.
  Every model failing ends `failed` with the last error and the note listing
  each failover. Usage is kept per model (`onUsage` `{ model, byModel }`).
- Never a failover: an unpriced head under a SAFE-8 cap (nothing sent, the
  spend-cap ask, no note); a cap stop on the model it fell back to (the next
  entry is never called); the run's own abort; a must-ask call that is denied
  or whose card lapses (the same model answers next).
- Workers: a `delegate` result's `modelFallback` is the lead's (`via:
  "delegate"`, one Text event, the note; a second identical report is not
  added again); `runDelegateChild` reads a worker's failovers from its result
  frame (validated); `runCouncil` and the `council` tool data carry each
  voice's failover once.
- Clips: `resultFrame`, `chatBodyFromTaskResult` (with and without a role note
  after it) and `splitDiscordMessage` keep the note whole.
- NDJSON: `usageFrame` with the model detail round-trips (and is unchanged
  without it); the real `task run --output ndjson` against a localhost
  provider answering `gone-model` 404 streams the Text frame, usage frames
  with `model` / `byModel`, and a result with `model`, `usageByModel` and
  `modelFallback`; text mode with a 410 head prints the line on stderr and the
  note in the answer.
- Fail on base: with the base's (507d97b) sources swapped in
  (`src/agent/providers.ts` and `src/agent/types.ts` kept so imports resolve),
  26 of 35 fail; the 9 that pass are the 5 pure units of the providers module
  and the 4 "never fails over" cases (the base never fails over at all).

## Owner shell grant (REQ-agent-503, REQ-agent-501; SAFE-3.a)

`tests/agent.safe3a-gate.test.ts` — `shellToolsGate` over temp git projects
and talk worktrees made by `ensureTalkWorkspace`: granted for the owner's
`chat`, `session`, `work` and `ask` in the session's own worktree; refused for
`watch`, `schedule`, an unknown or missing stamp, a WATCH or `schedule_`
session marker, team, community, a forged owner id without the ADMIN bit, the
ADMIN bit for a non-owner, a muted or deny-listed owner, no configured owner,
delegation depth 1 / 2 / junk, no role session (local CLI), and any cwd but
the talk's own linked worktree top (main checkout, another talk's worktree,
scoped non-git dir, a subdirectory, a look-alike dir whose `.git` points at
the main repo or borrows the talk's admin dir, a missing dir, no session id);
a symlink to the own worktree resolves to it. The catalog with `safe3a`
offers the registered allowlisted six at code tier only, none without it,
never an unlisted one or to team. Workers and the verify lane drop
`CORVIDINHO_ACTING_SURFACE`.
`tests/agent.safe3a-owner-shell.test.ts` — through `createTaskExecute` (fake
provider): the owner's chat in its own talk worktree is offered `shell-exec`
at code tier and runs it there (`unreportedEditTools: ["shell-exec"]`), and
so do `session`, `work` and `ask`; a prod command (`kubectl get pods; touch
ran.marker`) raises one `mustask` destructive card, a deny runs nothing and
an approval runs it once; the main checkout, a team member, WATCH, a
schedule, a delegate worker and a local CLI run are not offered it (the
call refused, no marker), with exactly one `[operator] SAFE-3.a` line per run
across two attempts and none in the summary; muting the owner after attempt 1
removes the shell from attempt 2; an allowlist without the six runs no gate.
`tests/agent.allowlisted-dangerous.test.ts` uses `SAFE3A_TOOLS`.
- Fail on base: with the base's (507d97b) `src/agent/{tools,execute}.ts`,
  `src/discord/{agent-client,bridge}.ts`, `src/discord/command-handlers/{session,work}.ts`,
  `src/scheduler/service.ts` and `src/watch/agent-client.ts` swapped in and
  `src/agent/shell-gate.ts` removed, `agent.safe3a-gate` cannot load, 8 of 9
  `agent.safe3a-owner-shell` tests fail (the no-gate guard passes) and the
  renamed `SAFE3A_TOOLS` test fails; all pass on the branch.
