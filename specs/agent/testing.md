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

## Plan-only or empty "Done." replies get one nudge (REQ-agent-087, AGENT-17 nudge half)

`tests/agent.stall-nudge.test.ts` with the fake LLM
(`tests/fixtures/fake-llm.ts`, which can now script tool calls):
`stallKind` positives (empty and "Done."-style claims, plans opened by "I'll"
/ "Let me" / "I'm going to" or a "Plan:" heading) and negatives (Q&A, social
replies, deferrals and "next time" promises, clarifying questions, "let me
know" and offers, AUTONOMY-7 declines and toy demos, code, the length caps,
a plan the task asked for — `planWanted`); `nothingChanged`,
`isStateChangingTool`, `changedForStall` (memory writes), the nudge text,
operator lines and the one-nudge guard (which remembers a change); the tool
loop (a "Done.", a plan and an empty reply are nudged once to the same
model; a second stall stands with the operator line; one nudge per run
across attempts; never nudged for the negatives, after a tool-reported,
Fledge or stored-memory change, after an unreported edit in an earlier
attempt, for an empty closing reply after an answer given beside a tool
call (a plan given there is nudged), for a plan the task asked for, with a
non-empty or unreadable diff, on the tool or read tier, after a SAFE-13
trip, or when a stop lands while the diff is read; the diff is read only for
a stall); `runTask` passes the gate's real diff (an unreported edit ⇒ no
nudge and the gate verifies; an empty diff ⇒ the nudge) and a stop during
the nudge round's request ends the run cancelled after two requests; the
real CLI `task run --output ndjson` against a localhost fake LLM (two
requests, both operator frames, `done`).
- Fail on base: with the base's (81ceb4a) `execute.ts`, `loop.ts` and
  `types.ts` swapped in (the branch's `loop-guards.ts` kept), the 8 nudge
  cases fail; with only the base's `loop.ts`, the runTask unreported-edit
  case fails; the pure units and the never-nudged cases pass on both.
- Review fixes (fail on the first head, 9e93cda, with the branch's test
  file's new behavioral cases ported to it): a stored memory before
  "Done!", an empty closing reply after an answer, a plan the task asked
  for, and an unreported edit in an earlier attempt were all nudged there
  (4 fail); the two stop cases pass on both (coverage for #332's stop).
- `tests/agent.safe3a-owner-shell.test.ts` and
  `tests/scheduler.owner-role.test.ts`: their fake model's closing reply is
  no longer a bare "done" that changed nothing (which is now nudged).

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

## The local CLI half of the shell grant (REQ-agent-503 modified, REQ-cli-681; SAFE-3.a)

- `tests/agent.safe3a-gate.test.ts` › "refused: delegate and council workers
  (depth > 0) and a run with no role session outside its own CLI worktree" —
  no role session with a Discord session id and stamp is refused as a spawn
  (`… this one carries a Discord session or surface stamp`); a plain local
  run with no worktree of its own is refused with `a local CLI run gets them
  only in the new worktree it made for itself, not with --here or outside a
  git repo`.
- `tests/agent.safe3a-owner-shell.test.ts` › "WATCH, a schedule, a delegate
  worker and a local CLI run: refused" — the local run (no role session, no
  session id, no stamp, no `talkWorktree`) is not offered `shell-exec` and
  gets that line.
- `tests/cli.safe3a-shell.test.ts` (REQ-cli-681) holds the CLI rows of the
  gate (granted at the top of the run's own worktree, through a symlink too;
  refused in place, in a subdirectory, the main checkout, another worktree, a
  non-git folder, a look-alike, a missing dir, for workers, WATCH, schedules,
  a spawn without a role session, a run a tool started (`CORVIDINHO_PROJECT_ROOT`,
  `TOOL_CHILD_ENV`, and a nested run with a tool child's env), and for a role
  session whatever `talkWorktree` says), `createTaskExecute` with
  `talkWorktree`, and the real CLI.
- Fail on base: with the base's (b84c75f) `src/agent/shell-gate.ts`,
  `src/agent/execute.ts` and `src/cli.ts` swapped in, both adjusted cases
  fail (the old reason) and `tests/cli.safe3a-shell.test.ts` cannot load
  (`isCliRunWorktree` is missing); with that export stubbed, 10 of its 11
  fail (the role-session guard passes on the base too). Restored, all pass.

## The owner's own schedule: no Fledge discovery, a no ends the run with an ask (REQ-agent-741; DISCORD-SCHEDULE-1.a)

`tests/agent.allowlisted-dangerous.test.ts` ("the owner's own scheduled run
… never discovers or spawns fledge …") — with the owner stamp, surface
`schedule` and a `schedule_*` session, an allowlist naming `fledge-hello`,
`github-pr-review`, `files-delete` and `shell-exec` offers `github-pr-review`
and `files-delete`, not `shell-exec`, only the read-only Fledge core
builtins, never discovers `fledge-hello` and never spawns fledge; the
model's call to it is refused as not offered.
`tests/scheduler.owner-role.test.ts` — denied: one `mustask-post` card with
the exact text and the owner as requester, the post refused, the next call
in the batch never run, one model request, the run `blocked` with no verify
and the stuck ask naming `` `discord-post-message` ``, its why, AUTONOMY-10
and the card, the summary `formatAskSummary(ask)` and the
`[operator] DISCORD-SCHEDULE-1.a` line; lapsed: the ask says nobody answered
the card in time (SAFE-20); the owner's chat with the same deny goes on
(`done`, two model requests, no ask); another person's schedule is not
offered the post and gets the role refusal, raising no card.
`mustAskRefusedAsk` gives the exact question for `denied`, and for
`expired` / `resent`, null for a call that ran, `worker` / `no-owner` /
`unavailable` / `aborted` and plain failures, cuts a long why and scrubs a
token in it.
- Fail on base: with the base's (af4597e) `src/agent/execute.ts` and
  `src/plugins/roles.ts` (and the other sources listed under REQ-discord-741)
  swapped in, the allowlisted-dangerous test (fledge discovered and offered)
  and the denied / lapsed / scheduler-records tests (no ask) fail; all pass
  on the branch.
## Repo ways, SpecSync coverage and the own-change lifecycle (REQ-agent-518, REQ-agent-519; AGENT-18, AGENT-18.a)

`tests/agent.repo-ways.test.ts` (temp git repos, a fake `specsync` and a
fake `hi` on PATH, stub verify runners; "Corvidinho itself" is a temp repo
with origin github.com/CorvidLabs/Corvidinho named by the
`setCorvidinhoCheckoutForTests` seam):

- detection: all three ways, none in a plain repo; removed from the working
  tree (HEAD still has them) and committed away (only the base passed in
  still has them); a disabled `sdd.json` in the tree is not a way out; a
  non-git project reads its working tree; the ways line.
- policy and coverage: meaningful vs ignored (more specific wins, SpecSync
  defaults), unparseable `sdd.json` fails closed, merged policies stay
  strict, file and dir coverage, archived-in-this-diff covers, not required
  covers everything.
- the gate: an uncovered edit gets the `SpecSync gate:` note and no lane,
  the covered retry is verified (lane once); deleting `sdd.json` and
  committing mid-run still gates; a repo with no ways is unchanged; the tool
  loop's system prompt carries the block only with `repoWays`.
- the lifecycle: approve, check, review, finalize in order and the lane
  twice on Corvidinho; elsewhere only a "stays open for a human" line; no
  allowlist → SAFE-1 line, another change untouched; a failing second lane
  fails the run; a failing approve leaves the change open.

Fail-on-base proof: with the base's (7090656) `src/agent/{loop,execute,types,tools,loop-guards}.ts`,
`src/plugins/{roles,types}.ts`, `src/work/pr.ts` and `plugins/specsync/{commands,api}.ts`
swapped in (the new `src/agent/repo-ways.ts` kept so the file loads), 15 of
its 26 tests fail (every gate, prompt, tool, approve / finalize, lifecycle
and /work case; the pure `repo-ways.ts` units pass) and the two catalog tests
of `tests/roles.team.test.ts` fail. Restored: all pass.
## Spend caps per provider plus the total, each warned and stopped (REQ-agent-114 added, REQ-agent-098 modified; SAFE-14 / SAFE-15)

`tests/agent.spend-caps.test.ts` (24 tests; mocked fetch, in-memory or temp
SQLite, one spawned `corvidinho doctor`):

- Setting: `configuredProviderIds` (every chain entry of every tier key, a
  custom base URL's host); `parseSpendCaps` off / total only / providers only
  (keys lower-cased) / both; eleven malformed lists and a well-formed key no
  configured model uses are invalid as a whole; both settings bad name both.
- Ledger: `window(now, provider)` per provider (older than 24 h excluded);
  `idx_spend_ledger_provider_ts` on `(provider, ts)`; `reserve` names the
  total, the provider, or both (`total` first) and reserves a provider under
  its own cap with no total.
- Guard: a provider cap stops only that provider (no fetch, `spendScopes`,
  "Daily spend cap reached (SAFE-15): $0.9990 spent on api.openai.com …",
  `Stopped at cap: provider:api.openai.com.`, the entry to raise, no
  `CORVIDINHO_DAILY_SPEND_CAP_USD`; `finish` gives `SPEND_CAP_SUMMARY`) while
  another provider is sent and recorded; the total still applies and a call
  past both names both; a bad provider setting stops every provider, opens no
  DB and never echoes the value; an unpriced model stops under its provider's
  cap and runs unrecorded where no cap covers it; 80% warns once per crossing
  of each cap (provider warning with its scope, the total's without; rows
  carry their scopes); `createTaskExecute` with a two-model chain and the
  head provider at a $0 cap ends with the spend-cap ask and no provider call
  (the AGENT-11 chain never tries the next model).
- Delivery: the outbox's `warnings` (one per cap, current spend; release
  returns both); a cap back under 80% stays pending while the other is
  claimed; the owner DM has one line per cap; `askPingOwner` pings per
  episode of each cap (release pings again); a question-only stored stop
  names its caps (`spendScopesOf`) and claims them; `askFromUnknown` keeps
  well-formed scopes only; `askPingKey` follows provider scopes; a provider
  warning survives `spendWarningFromUnknown`; the public post names no scope,
  provider, amount or setting.
- Store: an older `spend_alerts` gains `scope` (rows `total`), re-scrub before
  the ALTER does not throw; `SCRUB_TARGETS` has `spend_alerts.scope`, stored
  and re-scrubbed redacted.
- Doctor and `/status`: snapshot `providers`, doctor `spend` +
  `spend provider:<id>` lines, owner `/status` lines per cap, public line
  paused while any cap is reached; provider caps only (no amount on `spend`,
  unpriced model flagged only when covered); an invalid provider setting named
  but not echoed; `corvidinho doctor` prints the provider line.

Updated: `tests/agent.spend-ask.test.ts` (an invalid total's snapshot now
carries `keys`) and `tests/agent.spend.test.ts` (a refused reservation carries
`trips`).

- Fail on base: with main's (7090656) sources swapped in,
  `tests/agent.spend-caps.test.ts` cannot load (`configuredProviderIds` and
  the other new exports are missing) and the two updated tests fail; a probe
  with only `CORVIDINHO_PROVIDER_SPEND_CAPS_USD=api.openai.com=0` sends the
  provider call on base and stops it with `SpendCapRefusal` on the branch.


## The owner's spend card at a cap (REQ-agent-198 added, REQ-agent-098 / REQ-agent-114 modified; SAFE-8, SAFE-8.a, SAFE-15, SAFE-19, SAFE-20, AUTONOMY-8)

`tests/agent.spend-approve.test.ts` (21 tests; mocked fetch as the fake LLM,
in-memory or temp-dir SQLite, the owner in the run's env, the card decided in
the store as the engine would — `tests/discord.spend-card.test.ts` drives the
real engine):

- Approve + code (approved, used once): exactly the paused call goes out,
  recorded once at the estimate the card showed; the card is `spend` /
  `money` with action `send one model call to gpt-4o via llm.test`, target
  `total`, amount `~$… (this one call's estimate)`, requester `local`, this
  process as waiter and a text with surface, project label, spend when it
  paused and the task; the wait note is the must-ask status line
  (`progressFromFrame`) with no `$`, then the approval note.
- SAFE-8.a: after one approved call, the next call past the cap raises a new
  card; denied, nothing more is sent.
- Deny, no answer before the card lapses, a late approval, the call's abort
  signal, and a stop that lands as the owner approves: nothing sent or
  recorded; the ask names the card and its outcome, keeps the marker, offers
  a new card or the operator action, with no reply note and no `?`; `finish`
  gives the generic summary.
- No owner (even with a long card lifetime), `withSpendCap` with an owner,
  and an unpriced model: no card; the plain operator ask.
- SAFE-15: a provider cap's card targets `provider:llm.test`; past both caps,
  `total, provider:llm.test`.
- An approval counts only for the target its card showed: a provider cap's
  card approved after other spend took the total past its cap too sends and
  records nothing (the request ends `used`); the ask names both caps and says
  the approval did not stretch to the one the card did not show.
- The card's task text is SAFE-6 scrubbed before it is cut: a GitHub token
  straddling the `SPEND_CARD_TASK_MAX` cut shows no part of itself.
- One card at a time per run (the second is recorded only after the first is
  decided); two runs paused at once each have a pending card.
- `SpendLedger.reserveApproved`: the approved amount past the cap with
  `trips`; a larger estimate refused with no row (`reason: "amount"`); a
  fitting call with `trips` empty; a call that would now also pass a cap
  outside the approved scopes refused with no row (`reason: "target"`).
  `SPEND_CARD_TTL_MS` below the council voice and request timeouts.
- `createTaskExecute` at a $0 cap: approved — one call and both Text notes,
  the card text holds the task and never the run's directory; denied —
  `runTask` `blocked`, generic summary, verify not run; a card wait cut short
  by a 50 ms request timeout with a two-model chain calls no provider and
  never falls back (AGENT-11).

Unchanged suites that cover the touched files pass: `tests/agent.spend.test.ts`,
`tests/agent.spend-ask.test.ts`, `tests/agent.spend-caps.test.ts`,
`tests/agent.fallback.test.ts`, `tests/must-ask.gate.test.ts`.

- Fail on base: with main's (0aeb345) sources swapped in, the file cannot load
  (`setSpendCardTestHooks` and the other new exports are missing), and a
  probe using only main's APIs (`createTaskExecute` at a $0 cap with an owner
  configured and every pending approval approved at once) makes no provider
  call and records no card on base (`{"calls":0,"ask":"spend-cap","cards":[]}`),
  while on the branch the call goes out once on a `spend` / `money` card that
  ends `used`. The target and scrub-before-cut tests fail on the branch's
  first cut (`6ac2d8c`) sources, which recorded and sent the call past a cap
  the card did not show and cut the task before scrubbing it.

## A failed run's result names why in plain harness text (REQ-agent-032, DISCORD-3.b)

`tests/discord.failed-reply.test.ts`:

- `modelCallFailedLine`: HTTP 401 → `The model call failed (401 Unauthorized
  from api.openai.com)`; an unnamed status keeps its number; timeout, network,
  malformed reply and a missing key each name their kind and the host; an
  empty chain is `NO_PROVIDER_NOTICE`. `verifyGaveUpReason(2)` and
  `VERIFY_RERUN_FAILED_REASON` name the verify failure.
- The real `task run --output ndjson` against a localhost provider that
  answers 401 with a body quoting a key: exit 1, `failed` result with `error`
  `The model call failed (401 Unauthorized from 127.0.0.1:<port>)` and no body
  text; with no model configured the `error` is the AGENT-10 notice.
- `collectTaskRunStream` (through the spawn client): a crash's stderr end is
  `stderrTail` (at most 4000 characters).
- Fail on base: those cases fail with the base's `src/agent/*` sources (no
  `error` field, no `modelCallFailedLine`, no `stderrTail`).
## Workers pass --here; the local-CLI shell refusal names the missing role session (REQ-agent-117, REQ-agent-503 modified; SESSION-WORKTREE-1.a)

- `tests/cli.task-worktree.test.ts` › "delegate and council workers spawn
  task run --here, --task last" — `buildDelegateSpawn` argv is `task run
  --here --non-interactive --tier <t> --output ndjson --task <text>`.
- `tests/agent.safe3a-gate.test.ts` / `tests/agent.safe3a-owner-shell.test.ts`
  — a run with no role session was refused with `a local CLI run has no role
  session (the CLI half of SAFE-3.a is not built yet)`; the local CLI half
  (REQ-cli-681, below) replaced that reason.
- Spawned `task run` tests that run in a talk worktree or temp repo pass
  `--here` (`agent.cli`, `agent.verify-gate`, `agent.test-evidence`,
  `agent.ndjson-spawn`, `agent.stall-nudge`, `agent.spend-ask`,
  `agent.providers`, `agent.loop-guards`, `agent.persona`, `agent.fallback`,
  `agent.ask`).
- Fail on base: with the base's sources the argv case and both gate
  assertions fail.
## Unknown prices ask on the card; every surface asks (REQ-agent-199; SAFE-16 / SAFE-16.a, AUTONOMY-8)

`tests/agent.spend-unknown.test.ts` (18 tests; mocked fetch, in-memory or temp
SQLite, the card decided in the store as the engine would, plus the real
engine with recording DMs):
- An unpriced call under a $5 cap with an owner records one `spend` / `money`
  card before any provider call: title `Spend at an unknown price — asks
  first (SAFE-16.a) · from cli`, target `total`, amount `unknown (no known
  price for this model; never counted as free)` with no `$` figure, text with
  the cap's spend and the task; the wait note has no amounts.
- Approved: one call, the request `used`, one `unknown` ledger row (estimate
  and cost 0, the reply's tokens) and `unknownCalls` 1 with the priced spend
  unchanged; the next unpriced call raises a second card.
- Denied, lapsed or aborted: nothing sent or recorded; the ask starts `Spend
  at an unknown price (SAFE-16.a)`, names the card, keeps `Stopped at cap:
  total.`, has no reply note and no `?`.
- Provider cap alone → target `provider:llm.test`; both caps → `total,
  provider:llm.test`. No covering cap → runs, no card, no ledger. No owner or
  `withSpendCap` → the operator ask, no card, no DB file. HTTP error → `failed`.
  No price override: the table is frozen and env keys naming a price change
  nothing.
- Owner lines: `formatSpend`, doctor (`$4.50 + unknown of $5.00 …, 1 at an
  unknown price`), the provider doctor line, the owner's `/status`, the 80%
  warning and its outbox DM, `spendWarningFromUnknown` (a whole positive
  count only), the priced stop's card text and ask (`$4.9990 + unknown`); the
  public line stays without amounts.
- `createTaskExecute`: approved → the call goes out with the wait and
  approval Text events; denied → `runTask` `blocked`, generic summary, verify
  not run. The engine DMs `Amount: unknown (…)` and answers Approve plus the
  code with `SPEND_CARD_UNKNOWN_APPROVED`.

`tests/spend.surfaces.test.ts` (40 tests; a stand-in `corvidinho` bin that
records the env its spawner gives `task run`, then `createTaskExecute` over
that env with a mocked provider): chat, slash `/session`, slash `/work`, ask
buttons, schedules, the daemon, WATCH, the CLI and a delegate / council
worker each make no provider call before the owner's card is decided, past
the total cap, past a provider cap and at an unknown price under a cap; the
card names the surface; a no ends `blocked` on the spend-cap ask; with no
owner each stops at once with the operator ask and no card. It also covers
the WATCH spend-cap hand-over (REQ-watch-099, REQ-discord-199) and a
schedule's spend-cap Continue / Cancel controls (REQ-discord-606).

`tests/agent.spend-approve.test.ts` now expects a card whose amount is unknown
for an unpriced model (was: no card); `tests/agent.spend.test.ts`,
`tests/agent.spend-ask.test.ts` and `tests/agent.spend-caps.test.ts` add
`unknownCalls: 0` to the windows they compare.

- Fail on base: with main's (`9ea4005`) sources swapped in,
  `tests/agent.spend-unknown.test.ts` cannot load (`isUnknownSpendAmount` and
  the other new exports are missing) and `tests/spend.surfaces.test.ts` fails
  13 of 40 (the unknown-price case on all nine surfaces, the three WATCH
  hand-over tests and the schedule controls), while its 18 priced and 9
  no-owner cases pass there too (regression coverage). A probe on main's APIs
  records no card and sends nothing for an unpriced call with an owner
  (`{"calls":0,"cards":[]}`), ignores a WATCH spend-cap stop (`none`) and
  gives a schedule's spend-cap stop `["Cancel"]`; on the branch: one card
  with the amount unknown and one call, `no-bridge` (recorded), `["Continue",
  "Cancel"]`. Restored, all pass.

## The tool loop hands github-pr-create its run (REQ-agent-092 added, REQ-agent-117 modified; GITHUB-9, GITHUB-9.a)

`tests/work.review.test.ts` ("the agent tool loop hands github-pr-create its
run …") drives `createTaskExecute` with a scripted provider fetch in a temp
repo with a bare origin (dry run):

- The reviewer (`CORVIDINHO_LLM_MODEL_READ` = `reviewer-model`, the run on
  `author-model`) is called once with no `tools`, a system and a fenced user
  message holding the diff; round 1's findings come back fenced; the same
  call again opens the PR listing them as not changed; no tool message has
  the AGENT-16 steer; `onUsage`'s `byModel` has the reviewer's row and
  `answerSpendFor` makes the cost unknown (unpriced reviewer); `onModel`
  names only `author-model`.
- No second model: three identical calls all run and refuse, no steer, no
  stuck ask, no reviewer request; the summary ends with the GITHUB-9.a line.
- A provider cap covering the reviewer's own (Ollama) provider, no owner:
  the run ends with the `spend-cap` ask, no review request is sent, nothing
  is recorded, no `PR not opened` line.
- A `delegate` result with `data.models: ["worker-model"]` makes the reviewer
  the next configured model (`third-model`).
- Two `github-pr-create` calls in one batch: the second is not run (findings
  not yet read), one review call, the cycle stays open.
- `buildDelegateSpawn` / `delegateAuthorsFromEnv` / `workerModelsFromResult`
  (REQ-agent-117).
- Authors outlive the run: run 1's head model fails over and the next model
  writes `src/app.ts` (`files-write`); run 2 (a new `createTaskExecute`) on
  the head model opens the PR from the same checkout and the reviewer is the
  third configured model, never the one that wrote it.
  `recordChangeAuthors` keeps each (checkout, branch, model) once, scrubbed,
  and records nothing below a git top level.

Fail on base (modified sources at `9ea766b` swapped in, exports stubbed so
the file loads): all five tool-loop cases and both delegate cases fail;
restored they pass. The authors-outlive-the-run case fails with this
change's pre-fix sources (`69257ea`: the fallback model reviewed its own
change); restored it passes.
## Turn cap and idle timeout (REQ-agent-244, REQ-agent-312, AGENT-12)

`tests/agent.limits.test.ts` (fake LLM; fake `fledge` / `corvidinho` sh bins in
temp dirs): the env readers and lines; the watchdog (touch, nested holds);
`CORVIDINHO_MAX_TURNS=2` → 2 requests, `stopReason: "turn-cap"`, the last
prose, the operator stop event; unset → 8; `stopReason` only from the final
attempt (a capped first attempt whose retry verifies has none; a capped final
attempt does; a cancelled run never); a hung tool at 150 ms → `failed`,
`stopReason: "idle-timeout"`, `error` and summary the stop line, `Text` +
`StateChanged failed`; best prose kept and unverified changes named; output,
a slow model call, a silent `delegate` worker and an Approve-card wait never
stop a run; a caller abort stays cancelled; the CLI's hung silent verify lane
is killed with its task (exit 1) and a printing lane is verified.
- Fail on base (aeb2de3's modified sources swapped in, `src/agent/limits.ts`
  kept): 18 of 28 fail (no `stopReason`, hangs until the test timeout, the
  watchdog fires during a worker or a card wait); restored, 28 of 28 pass.
- Review: a tool that never returns and ignores the abort still ends the run
  about `IDLE_STOP_GRACE_MS` after the timeout (`failed`, `idle-timeout`,
  "Any changes so far were not verified.", the `[operator]` line); an
  `idleTimeoutMs` of 0, -1 or NaN is the default (no 1 ms stop); a
  `delegate` worker's `stopReason: "turn-cap"` reaches its outcome; a
  turn-capped schedule run posts only its prose and the scheduler logs one
  `[scheduler] schedule <id>: run stopped=turn-cap …` line. These
  fail on the pre-review head 05f7a6c (hang, instant stop, none) and on
  base; 32 of 32 pass on the branch (11 pass / 21 fail with base sources).

## A failed worker hands its lead one plain line (REQ-agent-117, REQ-agent-118; found in #343's review)

`tests/autonomous.worker-failure.test.ts` (fake `corvidinho` sh bins and the
real `task run` against the localhost fake provider of
`tests/fixtures/fake-llm.ts`, whose `reply` may now return a `FakeHttpError`:
a status and the provider's own raw body; temp dirs only):

- `workerFailureLine`: a `modelCallFailedLine` error loses the provider's host
  (`The model call failed (429 Too Many Requests)`, `The model call timed
  out`, `… (network error)`); the idle-timeout line stays; a token is
  scrubbed, stack frames and host paths go, one line of at most 200
  characters; the timeout / interrupt lines win; with no error the
  no-provider notice for the worker's tier, else `the worker failed (exit
  N)`. `watchPublicFailureLine` is `withoutProviderHost` for every shape.
  #349's review: a worker that streamed another protocol gets `protocol
  mismatch: binary 3, bridge 2 — restart the bridge` (after a result error,
  before the no-provider notice); one that could not start gets `worker
  failed to start: <why>` — a host path cut to `…/<last segment>`, a token
  scrubbed, stack frames dropped, one line of at most 200 characters.
- Fake bins: a worker whose result `error` is a 429 from
  `acme-prod.openai.azure.com:8443`, whose summary and stderr are `LLM HTTP
  429: <body with an org name, a request id and the host>` → the tool's
  `error` is `worker (tier code, depth 1) did not finish (state failed, exit
  1):` and the plain line, `data.summary` the line, `data.models` kept, no
  provider detail anywhere in the result; an idle-timed-out worker keeps
  `stopReason: "idle-timeout"` and its line; a worker with no result frame
  never hands over its stdout or stderr (the no-provider notice, else the exit
  code); a successful worker and one that stopped on an ask of its own are
  unchanged. A worker whose only frame is a protocol-3 result (`done`, exit
  0, an `LLM HTTP 429` summary) → `state failed`, exit 0, `data.summary` the
  protocol-mismatch notice, no frame content; a worker bin that does not
  exist → exit 127, `worker failed to start: ENOENT: no such file or
  directory, posix_spawn '…/corvidinho'`, its directory nowhere in the
  result; a worker stopped by the spend cap (`spendCapReachedAsk`) →
  `state blocked`, `data.summary` `Work is paused for budget.`, no amount,
  cap setting or SAFE id anywhere in the result (SAFE-14.a). The first two
  fail on #349's head 9aff1fc (`the worker failed (exit 0)`; the raw spawn
  message with the full path).
- The lead's tool loop: a failed worker that reported an injection is still
  `injectionWorkerNote` + the SAFE-12 fence, with the plain line inside.
- End to end: a lead's `delegate` worker whose model answers 429 → the lead
  model's tool message has `The model call failed (429 Too Many Requests)`
  and no org name, request id, host (`127.0.0.1:<port>`), `LLM HTTP` or
  provider message; with a 200 reply the worker's answer comes back as
  before. A 3-voice `council` whose voice 3 gets the 429: that voice's
  transcript entry is the plain line, the others' entries and the chair's
  decision are their own replies, and neither the result nor any later
  phase's prompt holds the provider detail.
- `tests/autonomous.delegate.test.ts` › "worker failure is reported as its
  one plain line, scrubbed (SAFE-6), never its summary".
- Fail on base: with main's `src/autonomous/delegate.ts` swapped in (stub
  exports added so the file loads), 9 fail (8 of the 10 new tests and the
  delegate test) — the lead's tool message and the council transcript carry
  `LLM HTTP 429: {"error":{"message":"Rate limit reached … organization
  org-acme-widgets-7731 … https://127.0.0.1:<port>/account/limits."},
  "request_id":"req_7f3c9a1b2d4e5f60"}`; restored, all pass.
## The owner's run in a non-git project folder (REQ-agent-110, AGENT-1.a)

`tests/agent.nongit-project-dir.test.ts` (2 tests, `runTask` +
`createTaskExecute`, fake provider, stub verify lane): the owner's run writes
`src/app.ts` in the folder, `fledge.toml` (SAFE-2) and `AGENTS.md`
(AGENT-1.b) are refused, `shell-exec` is not offered with the SAFE-3.a line,
the lane runs on the folder and its failure fails the run; a team member's
`/work` run there has no `files-write` / `files-edit` and its call is refused
for the role, while in a linked worktree both are offered. Fail on base: both.
