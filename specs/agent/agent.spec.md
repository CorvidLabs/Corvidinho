---
module: agent
version: 36
status: draft
files:
  - src/agent/types.ts
  - src/agent/config.ts
  - src/agent/verify.ts
  - src/agent/loop.ts
  - src/agent/workspace-diff.ts
  - src/agent/specLoader.ts
  - src/agent/index.ts
  - src/agent/task-summary.ts
  - src/agent/execute.ts
  - src/agent/spawn-argv.ts
  - src/agent/tier.ts
  - src/agent/tools.ts
  - src/agent/project-instructions.ts
  - src/agent/events-ndjson.ts
  - src/agent/spend.ts
  - src/agent/spend-notice.ts
  - src/agent/spend-alerts.ts
  - src/agent/spend-outbox.ts
  - src/agent/ask.ts
  - src/agent/untrusted.ts
  - tests/agent.execute.test.ts
  - tests/agent.tool-loop.test.ts
  - tests/agent.allowlisted-dangerous.test.ts
  - tests/agent.soft-land.test.ts
  - tests/spawn.argv.test.ts
  - tests/agent.project-instructions.test.ts
  - tests/agent.events-ndjson.test.ts
  - tests/agent.ndjson-spawn.test.ts
  - tests/agent.spend.test.ts
  - tests/agent.spend-ask.test.ts
  - tests/agent.ask.test.ts
  - tests/agent.verify-env.test.ts
  - tests/agent.verify-feedback.test.ts
  - tests/safe.injection.test.ts
  - tests/fixtures/verify-lane-log.ts
  - agent.3md
  - tests/agent3md.smoke.test.ts
  - src/autonomous/enabled.ts
  - src/autonomous/delegate.ts
  - src/autonomous/council.ts
  - tests/autonomous.enabled.test.ts

db_tables: []
depends_on:
  - plugins
---

# Agent

## Purpose

Root guidance-only `agent.3md` + `@corvidlabs/agent3md` packaging (REQ-agent-260): validate/route/get smoke only; agent loop does not load planes for progressive disclosure until AGENT-13 is HI'd.

Agent execute tool-loop also carries MEMORY instructions (AGENT-7 / MEMORY-2/4)
so Discord/CLI chats trust injected facts and call memory-store/recall
appropriately (REQ-agent-010), keep profiles and project memory, never tell
one person what is stored about another or repeat private notes, and route a
"forget me" to `memory-forget-me` (MEMORY-5..7 / MEMORY-ACL-6, REQ-agent-101).

## Public API

Export `MEMORY_AGENT_SYSTEM_INSTRUCTIONS` from `src/agent/execute.ts` (and
`src/agent/index.ts`).

NDJSON event stream (REQ-agent-073, issue #73): `src/agent/events-ndjson.ts`
owns `CORVIDINHO_PROTOCOL_VERSION` (2) and exports `frameFromEvent`,
`usageFrame`, `resultFrame`, `serializeFrame`, `createNdjsonWriter`,
`summarizeToolArgs`, `parseNdjsonLine`, `createNdjsonParser`,
`readNdjsonStream`, `progressFromFrame`, `collectTaskRunStream`. Frames:
`{protocol, type}` with AgentEvent types `StateChanged` / `Text` / `ToolCall`
(`name`, `argsSummary`) / `ToolResult` / `VerifyResult`, plus `usage`
(running prompt / completion / total tokens) and a final `result`
(`TaskResult`). `createTaskExecute({ onUsage })` reports running provider
totals; `extractUsage` reads OpenAI-compatible `usage`.

Per-tier model (REQ-agent-079, AGENT-5): `src/agent/tier.ts` exports
`TIER_MODEL_ENV` (`CORVIDINHO_LLM_MODEL_READ` / `_TOOL` / `_CODE`),
`DEFAULT_LLM_MODEL` (`gpt-4o-mini`) and `modelForTier(env, tier)` (tier key,
else `CORVIDINHO_LLM_MODEL`, else the default). `loadLlmEnv(env, tier?)` takes
an explicit tier over `CORVIDINHO_LLM_TIER` and returns that tier's model;
`createTaskExecute` passes its `tier` so `--tier` picks the model. Endpoint and
key stay shared. `modelKeyForTier(env, tier)` names the key that set a tier's
model (the SAFE-8 unpriced ask names it via `createSpendGuard({ modelKey })`),
and `perTierModels(env)` lists each tier's model when any per-tier key is set
(doctor `[ok] llm`; `readSpendSnapshot` flags an unpriced tier model with its
`tier` for doctor `spend` and `/status`).
Real-diff verify gate (REQ-agent-085, AGENT-4): `src/agent/workspace-diff.ts`
exports `startWorkspaceDiff(cwd)` (a `WorkspaceDiffTracker` whose `changed()`
lists cwd-relative paths changed since the snapshot, or null when git cannot
be read; null tracker outside a git work tree; an optional second argument
`WorkspaceDiffLimits` lowers the hash budget in tests),
`WORKSPACE_DIFF_MAX_OUTPUT_BYTES`, `WORKSPACE_DIFF_HASH_MAX_BYTES`,
`WORKSPACE_DIFF_HASH_BUDGET_BYTES` and `WORKSPACE_DIFF_MAX_FILES` (real-diff
paths one run adds to `filesChanged`). `RunTaskOptions.workspaceDiff` is a
test seam like `verifyRunner`, not a product surface.

LLM request timeout (REQ-agent-244): `src/agent/execute.ts` exports
`LLM_REQUEST_TIMEOUT_MS` (10 minutes), the default cap on one chat
completions request (headers and body); `createTaskExecute` takes
`llmTimeoutMs?: number` to override it. No env var.

Daily spend cap (REQ-agent-098, issue #98, SAFE-8 as amended / AUTONOMOUS-8):
`src/agent/spend.ts` exports `SPEND_CAP_ENV`
(`CORVIDINHO_DAILY_SPEND_CAP_USD`), `SPEND_WINDOW_MS` (rolling 24 h),
`SPEND_WARN_PERCENT` (80), `MODEL_PRICES_USD_PER_MTOK`, `priceForModel`,
`parseSpendCap`, `costMicroUsd`, `estimateCallMicroUsd`, `formatUsd`,
`ensureSpendLedger`, `SpendLedger` (`reserve` / `settle` / `window` /
`noteWarning` over the module-owned `spend_ledger` and `spend_alerts` tables
in the shared DB), `SpendCapRefusal` (carries a `spend-cap` `HumanAsk`),
`createSpendGuard` (`{ fetch, finish }`: the capped provider fetch plus the
hook that turns a stopped call into the attempt's ask), `withSpendCap` (the
fetch alone; unchanged when no cap is set), `readSpendSnapshot` and
`spendDoctorCheck` (doctor line). `src/agent/spend-notice.ts` holds the
pure text: `formatSpendWarningLine`, `spendWarningFromUnknown`, the
`spendCap*Ask` question builders, `formatSpendDoctorLine`,
`formatSpendStatusLine` (Discord `/status`) and `spendPercent`.
`createTaskExecute` builds its fetch with `createSpendGuard`, emits the 80%
warning as a `Text` event and through `onSpendWarning`, and passes every
attempt's result through `finish`. `HumanAskReason` gains `spend-cap`;
`TaskResult` gains optional `spendWarning` (`SpendWarning`: integer
`spentMicroUsd` / `capMicroUsd` and `percent`). A run stopped at the cap
reports the generic `SPEND_CAP_SUMMARY` as its summary (no amounts or env
names; the details are in `ask.question`), and `SPEND_REARM_PERCENT` (70)
sets where the warning re-arms. `src/agent/spend-alerts.ts` owns the
`spend_alerts` table (`ensureSpendAlerts`, adding `delivered_at` to an older
table): `recordSpendWarning`, `rearmSpendAlerts`, `warnArmed`,
`capPingArmed`, `claimSpendWarnings` (claims nothing while current spend is
back under 80%, leaving the warning pending) / `releaseSpendWarnings` and
`claimSpendCapPing` (the new `cap` row's id) / `releaseSpendCapPing`.
`src/agent/spend-outbox.ts` exports `createSpendAlertOutbox`
(`SpendAlertOutbox`: `takeWarning(fallback)` → `TakenSpendWarning` with
`release()`, and `claimCapPing()` → `SpendCapPingClaim` with `release()`, or
null when the episode already pinged), the delivery side the Discord bridge
uses.

Autonomous gate + delegation core (REQ-agent-117, issue #117):
`src/autonomous/enabled.ts` exports `parseAutonomousConfig`,
`loadAutonomousConfig`, `isAutonomousEnabled`, `autonomousSessionAllowed`;
`src/autonomous/delegate.ts` exports `delegateDepthFromEnv`,
`canDelegateAtDepth`, `clampChildTier`, `parseDelegateArgs`,
`buildDelegateTaskText`, `resolveDelegateBin`, `isWorkerEnvDropped`,
`buildDelegateSpawn`, `createDelegateLimiter`, `runDelegateChild` and the caps
(`MAX_DELEGATE_DEPTH` 2, `MAX_CONCURRENT_DELEGATES` 2,
`MAX_DELEGATES_PER_RUN` 4, `DELEGATE_MIN_TIER` 2). `buildOpenAiTools` takes
`autonomous?: boolean`; `createTaskExecute` takes `autonomous?: boolean`
(default: `autonomousSessionAllowed({ cwd, env })`).

Council core (REQ-agent-118, issue #118, AUTONOMOUS-6):
`src/autonomous/council.ts` exports `parseCouncilArgs`, `resolveCouncilTier`,
`councilLens`, `capCouncilText`, `buildProposeText`, `buildCritiqueText`,
`buildDecideText`, `runCouncil`, `formatCouncilPhases`, `COUNCIL_PHASES`
(`propose`, `critique`, `decide`), `COUNCIL_LENSES` and the caps
(`COUNCIL_DEFAULT_VOICES` 3, `COUNCIL_MIN_VOICES` 2, `COUNCIL_MAX_VOICES` 5,
`COUNCIL_QUESTION_MAX` 4000, `COUNCIL_ENTRY_MAX` 1500, `COUNCIL_DECISION_MAX`
= `DELEGATE_SUMMARY_MAX`, `COUNCIL_TIMEOUT_MS` 15 min,
`COUNCIL_VOICE_TIMEOUT_MS` 5 min, `MAX_COUNCILS_PER_RUN` 2,
`COUNCIL_DEFAULT_TIER` read, `COUNCIL_MAX_VOICE_TIER` tool).
`DelegateChildOutcome` gains optional `resultText` (the worker's own result
summary, scrubbed and capped at `DELEGATE_SUMMARY_MAX` rather than the
1800-char chat body).

Project instructions (REQ-agent-084, AGENT-1, issue #84):
`src/agent/project-instructions.ts` exports `findProjectRoot`,
`loadProjectInstructions`, `renderProjectInstructions`,
`describeProjectInstructions`, `withProjectInstructions`,
`PROJECT_INSTRUCTION_FILES` (`AGENTS.md`, `CLAUDE.md`),
`PROJECT_INSTRUCTIONS_MAX_BYTES` (16 KiB), `PROJECT_INSTRUCTIONS_HEADER`,
`NOT_COMMITTED_REASON` and `projectInstructionsWarning`
(re-exported from `src/agent/index.ts`). `createTaskExecute` loads them from
`cwd` by default; `projectInstructions: false` opts out.
`ProjectInstructions.source` is `commit` when the project root holds `.git`
(files are read from the `HEAD` commit through read-only git: `ls-tree`,
`cat-file`, `diff --name-only`, hooks and fsmonitor off, env clamped with the
git plugins' `gitEnv`) and `working-tree` otherwise. A loaded file carries
`uncommitted: true` when its working-tree copy differs from `HEAD`.

`task-summary` exports `formatTaskPlumbing`, `chatBodyFromTaskResult`, and
`chatBodyFromTaskRunOutput` alongside `summarizeTaskResult`, plus
`ROLE_REFUSED_SUMMARY_NOTE` and `clipKeepingRoleNote` (REQ-agent-333). Discord/NDJSON
bridge summaries SHALL use the chat-body helpers so operator plumbing never
appears in the final chat reply (DISCORD-3.a).

`execute` system prompt SHALL include IDENTITY-4 and ROLES-CHAT-8 instruction
blocks (`IDENTITY_AGENT_SYSTEM_INSTRUCTIONS`, `PUBLIC_QA_AGENT_SYSTEM_INSTRUCTIONS`)
in addition to MEMORY instructions; the public Q&A block names the only
community site / roadmap sources — the public repo docs (README, docs/,
STATUS, CHANGELOG) and the public issues and milestones of allowed public
repos — and says nothing else counts (ROLES-CHAT-8.a, REQ-agent-065). `execute` exports
`DISCORD_ATTACH_AGENT_SYSTEM_INSTRUCTIONS` (DISCORD-17, REQ-agent-476): the
system prompt carries it only when the run's catalog offers
`discord-send-file` and its env has a conversation channel
(`CORVIDINHO_DISCORD_REPLY_CHANNEL_ID`), so the model never says it cannot
send files or images there and sends a large diff as a `.diff` attachment.

Ask the human (REQ-agent-044, issue #44, AUTONOMY-1/2/7 / DISCORD-ASK):
`src/agent/ask.ts` exports `ASK_TOOL_NAME` (`ask-human`), `withAskTool`,
`askFromToolArguments`, `askFromUnknown`, `formatAskSummary`, `stuckAfterVerifyAsk`,
`ASK_AGENT_SYSTEM_INSTRUCTIONS` (AUTONOMY-7 + prefer `options` / numbered choices
for ephemeral Discord buttons). `src/agent/ask-options.ts` exports
`resolveAskOptions` / `parseChoicesFromQuestion` / `normalizeAskOptions`
(option ids come out unique within an ask: a repeated id takes the first
unused position number, and already-unique ids are kept byte-identical,
REQ-agent-045).
`HumanAsk` MAY include `options: AskOption[]`. A clarify ask ends the run
`blocked` (verify skipped, exit 0); verify exhaustion stays `failed` and
carries a `stuck` ask. Additive on the NDJSON wire: protocol stays 2.

Verify runner env (REQ-agent-002, SAFE-6): `src/agent/verify.ts` exports
`isVerifyEnvDropped` and `buildVerifyEnv`; `defaultVerifyRunner` spawns fledge
with `buildVerifyEnv()`.

Verify retry feedback (REQ-agent-002, AGENT-4.a): `src/agent/verify.ts` also
exports `VERIFY_FEEDBACK_MAX_CHARS` (4000) and `verifyFeedbackExcerpt(output,
max?)`, the lane output a retry sends the model. `runTask` builds
`ExecuteContext.verifyFeedback` with it (prefix included, within the cap) and
the LLM execute (tool loop and read-tier chat) caps feedback with it instead
of a head cut. No flag, env var or config key.

Allowlisted dangerous tools (REQ-agent-501, CLI-3 / SAFE-1): `src/agent/tools.ts`
exports `SAFE3_PENDING_TOOLS` (`shell-exec`, `node-exec`, `python-exec`,
`cargo-exec`, and the Fledge core runs `fledge-lanes-run` and
`fledge-run`), `allowlistOffers(allowlist, name)` (named and not SAFE-3
pending) and `editsFilesUnreported(name)` (a Fledge command or a SAFE-3-pending
tool, REQ-agent-502). `BuildToolsOpts` gains `allowlist?: ReadonlySet<string>`;
`createTaskExecute` passes its effective allowlist (the `allowlist` option,
else `CORVIDINHO_ALLOWLIST`) and loads Fledge plugins when `includeDangerous`
is set or the allowlist names a Fledge plugin command (a `fledge-*` name that
is not one of the four Fledge core builtins) and the session is not a
non-ADMIN role session (the ADMIN check runs first). `ExecuteResult` gains
optional `unreportedEditTools?: string[]`; outside a role session, with a
Fledge plugin command allowlisted, a `delegate` call that started a worker is
named there too. No env var, config key, flag or slash command.

Untrusted text (SAFE-11/12/13, #71, REQ-agent-071): `src/agent/untrusted.ts`
exports `cleanDisplayName(raw, max?)` / `DISPLAY_NAME_MAX` (32),
`nameSkeleton` / `namesLookAlike`, `stripInvisible`, `defangContextMarkers`,
`fenceUntrustedData(text, { source, header, word?, id? })` /
`UNTRUSTED_FENCE_WORD` (`UNTRUSTED_DATA`),
`UNTRUSTED_CONTENT_AGENT_SYSTEM_INSTRUCTIONS`, `detectInjection(text)` →
`InjectionVerdict` (`InjectionReason`: `ignore-rules`, `role-override`,
`owner-claim`, `secret-request`, `tool-call-payload`, `fake-marker`;
`INJECTION_REASONS`, `INJECTION_REASON_TEXT`, `describeInjectionReasons`,
`INJECTION_SCAN_MAX_CHARS`), `InjectionNotice` / `injectionNoticeFromUnknown`,
`INJECTION_AUDIT_ACTION` (`injection-suspected`), `UNTRUSTED_RESULT_TOOLS`,
`INJECTION_SCAN_TOOLS`, `toolResultFenceHeader`, `injectionToolNote`,
`injectionToolRefusal` and `injectionSummaryNote`. `src/agent/execute.ts`
exports `withInjectionNote(summary, notice)` and `toolResultScanText(result)`;
`createTaskExecute` takes `onInjection?: (notice) => void`; `TaskResult`
gains optional `injection?: InjectionNotice` (additive on the NDJSON
`result` frame: protocol stays 2). No env var, config key or flag.

## Invariants

The verify gate trusts the working tree, not only the tools (REQ-agent-085):
with the gate on, any path the run changed on disk since its start snapshot
(git status, `HEAD` moves, content of already-dirty paths) is in
`filesChanged` (up to `WORKSPACE_DIFF_MAX_FILES` per run) and forces the
verify lane; a run ends `done` without verify
only when no tool reported files and the real diff is empty. A diff git
cannot read after a good snapshot verifies anyway (fail closed). The diff is
read-only git plus in-process hashing: it never writes the index or objects.
With no git snapshot (a non-git cwd, or an unreadable start snapshot), a run
that called a tool whose edits no result reports (a Fledge command, or the
shell / a runner, or a local run's `delegate` whose worker could have run an
allowlisted Fledge command) verifies anyway, with one `Text` note per attempt
naming the tools; other non-git runs keep tool-reported files only
(REQ-agent-502).

A task run offers the model a dangerous tool only when the run's allowlist
names it (SAFE-1 consent, CLI-3), never `shell-exec`, the language runners
or the Fledge core runs (`fledge-lanes-run`, `fledge-run`) until the SAFE-3
decision, and never to a non-ADMIN role session: the role,
tier and SAFE-9 filters apply first, and every runtime gate still runs
(REQ-agent-501). An empty allowlist gives the same catalog as before.

A verify retry works from the failing step's output, not the start of the
lane log (REQ-agent-002, AGENT-4.a). The runner's output is stdout then
stderr, so steps that passed first (a typecheck, a `--help` smoke) can fill
the head. Output within `VERIFY_FEEDBACK_MAX_CHARS` reaches the model whole;
over it, colour escapes are dropped, the feedback names the failing step
(fledge's `Lane '<lane>' failed at step N (<name>)` line; a parallel step is
`parallel(<tasks>)`) and carries that step's output from its `Running task:
<name>` marker (a parallel step's `Running parallel:` line) when it fits,
else its error / fail lines and the end of the log. Error lines that report a
failure (`error:`, `Expected:`, `(fail)`, `file(1,2): error TS…`, `✗`) are
kept before lines that only mention one (`… marked failed`), so a step's
console chatter cannot crowd its failure out; first ones first, passing-test
lines left out, printed in log order. It is never longer than the cap and
never cut inside a surrogate pair.

The default verify runner spawns fledge with the parent's env minus the
delegate worker drop list (`DISCORD_*`, `GITHUB_TOKEN`, `GH_TOKEN`,
`CORVIDINHO_AUDIT_HMAC_KEY`, `CORVIDINHO_ACTING_*`) and the LLM API keys
(`CORVIDINHO_LLM_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
`OPENROUTER_API_KEY`): tests the agent wrote never see
operator secrets (SAFE-6).

The verify lane's `spec-check` task runs `specsync check` at the CI Spec Sync
Action's strictness: `--require-coverage` equal to the Action's
`require-coverage` input in `.github/workflows/spec-sync.yml`, and `--strict`
only when the Action sets `strict`. A tree the CI Spec Sync check rejects, such
as one with an unspecced source file, fails the lane and never reaches
verified=true (SPECSYNC-2/7, REQ-agent-005).

Tool-loop system prompt SHALL include trust-inject / memory-store /
memory-recall-before-ignorance / never-invent rules. OpenAI tool argv
descriptions for `memory-*` commands SHALL include concrete examples.

NDJSON frames never carry raw tool arguments; ToolCall `argsSummary`, Text,
ToolResult detail and VerifyResult output are SAFE-6 scrubbed and capped.
AgentEvent stays frozen (usage is a separate callback), so `task run --json`
events are unchanged.

No spend cap set means no spend behavior: the fetch is untouched and the DB is
not opened. With a cap, a provider call is never sent unless its estimate was
reserved under the cap in one IMMEDIATE transaction. A call that would pass
the cap, and every call while the model is unpriced, the cap value is invalid
or the ledger is unavailable, is not sent: the attempt ends with a
`spend-cap` ask and the run is `blocked` (never `done`, never retried, verify
skipped) — the runner never spends past the cap and never counts an unpriced
model as free. The 80% warning is recorded once per crossing across
processes (`spend_alerts`, same IMMEDIATE transaction as its check): it
re-arms when spend is seen back under 70% of that cap value (by a settle or
by the next call's reservation), 24 h after the last warning, or for a new
cap value — the 70–80% band keeps spend hovering at 80% from warning on every
call. Recording is separate from delivery: a recorded warning stays pending
(`delivered_at` NULL) until a surface that can reach the owner claims it, so
a run whose surface cannot show it (WATCH, daemon, delegate worker) never
uses it up. Money is integer micro-USD, rounded up.
Autonomous mode is off unless the project `fledge.toml` sets
`[corvidinho.autonomous] enabled = true` (AUTONOMOUS-1). Autonomous extras are
left out of the tool catalog unless the session is allowed (enabled, depth
below 2) and appear at code tier only (SAFE-9). The tool loop passes its tier
and abort signal to `runPlugin`. A worker never runs above the lead's tier
(omitted = the lead's), is forced non-interactive with the lead's allowlist,
no ADMIN and no SAFE-4 confirm tokens, keeps prove-before-done (never
`--no-verify`, REQ-cli-085), runs one level deeper, and is stopped on
lead abort, timeout or lead exit; at most 2 run at once and 4 per lead run.
These are safety defaults, not HI (draft AUTONOMOUS-10 left for capture).

A council (AUTONOMOUS-6) deliberates in three phases in order — propose,
critique, decide — and every voice and the chair is a delegate-core worker
one level deeper than the lead. Voices advise and never act: read tier by
default, never above tool or the lead, a non-ADMIN role session
(`CORVIDINHO_ACTING_IS_ADMIN=0`) with an empty SAFE-1 allowlist, so they get
no mutating tool and every must-ask tool is denied. At most 2 voices run at
once; each phase entry is SAFE-6 scrubbed and capped; the whole council has
a wall-clock cap. The council returns a decision and a transcript; it never
returns a confidence score (draft AUTONOMOUS-11 left for capture).

Project instructions come only from the project root (nearest `.git` at or
above cwd, else cwd), never from a parent directory above it. Each file is
capped at 16 KiB with a truncation marker, SAFE-6 scrubbed, and labelled as
project instructions that cannot widen SAFE-1 consent, the tool allowlist or
the capability tier. The loader never throws.

In a git project only the `HEAD` copy of an instruction file reaches the
system prompt. The file tools (files-write / files-edit, not dangerous) can
change the working tree without consent, so working-tree edits and untracked
instruction files are never loaded; only a commit, which needs a dangerous,
consented tool such as `git-commit` (SAFE-1), changes what later runs see. A
`.git` that git cannot read never falls back to the working tree. Committed
symlinks are followed only as paths inside the commit, never through the
filesystem.

The Planning SpecSync briefing reaches the model on every execute attempt
(`ExecuteContext.specBriefing`, AGENT-2 / REQ-agent-004) in the user message,
never the system prompt: spec files are working-tree data, so the block is
labelled as project data, fenced, SAFE-6 scrubbed and capped at 8000 chars.
Planning selects modules from the request only (`planningSelectionText`):
`[Corvidinho …]` context paragraphs (Discord identity and memory) and all-caps
line labels such as `[WATCH <kind>]` do not count, so a bridge wrapper cannot
pick a module the request never names.

`buildOpenAiTools` omits mutating plugins when `actingIsAdmin` is false (ROLES-CHAT-2); given `actingRole` (IDENTITY-9..12, REQ-agent-065) it keeps exactly what `roleAllowsPlugin(actingRole, entry, workTask)` allows — owner (or `null`, no role session): every tool; team: read tools plus `github-issue-comment` / `github-pr-review` (plus `files-write` / `files-edit` when `workTask`); community: read tools only. `createTaskExecute` resolves the role from env via `resolveActingRole` on every attempt (null outside a role session) and passes it with `workTask` (`CORVIDINHO_ACTING_WORK_TASK`); only the owner or no role session discovers Fledge plugin commands.

When the caller's role does not allow the plugin at the call (a role session,
re-checked per call like `runPlugin`, ROLES-CHAT-6 / IDENTITY-12), the tool
loop answers a not-offered registered
mutating / dangerous plugin with the role refusal `runPlugin` gives (`Denied:
plugin "<name>" is not allowed for your role (ROLES-CHAT-3).`, exit 2) instead
of the catalog refusal, and never runs it; an unregistered name keeps the
catalog refusal. Once any call in a task run gets exactly that role refusal,
every summary of that run ends with `(not allowed for your role)` once,
exported as `ROLE_REFUSED_SUMMARY_NOTE` / `withRoleRefusalNote` from
`src/agent/execute.ts` (the note is defined in `src/agent/task-summary.ts`);
`resultFrame` and `chatBodyFromTaskResult` keep that closing note when they cap
a long summary (`clipKeepingRoleNote`, REQ-agent-333). Event names and progress
lines stay as they are.

An abort stops the work, not only the bookkeeping (AGENT-3, REQ-agent-244):
the default verify runner runs fledge in its own process group and an abort
kills the lane's whole tree (then waits at most 250 ms for its output
pipes); an abort while verify runs is a cancel (no
`VerifyResult`, no retry, no `stuck` ask); each LLM request is bounded by a
timeout, and a caller abort is never reported as a timeout.

Images reach the model as pixels (DISCORD-9 / REQ-agent-428, extends
REQ-agent-008): a tool result carrying `PluginHandlerResult.image` (`files-read`
of an image, REQ-plugins-427) keeps only its metadata in the tool message and
the `ToolResult` detail; once the round's tool messages are all pushed (they
must directly follow the assistant `tool_calls`), the loop adds one user
message `[{type:"text", text:"Image(s) opened with files-read: <paths>"},
{type:"image_url", image_url:{url:"data:<mime>;base64,<b64>"}}, …]`. The
base64 never reaches tool text, events or ndjson. If a request carrying image
parts gets HTTP 400, 404, 413, 415 or 422, the image user messages are
removed, each opened image's tool message says `[image <path> could not be
shown to this model]`, an `[operator]` Text note is emitted, and that request
is retried once (no user message after tool messages, so strict role-order
providers accept it); later images in the run get the same note in their tool
message. No new env var, flag or protocol field.

`ask-human` is intercepted by the tool loop (never dispatched as a plugin) and
is offered only on tool/code tiers. A run with an ask is never `done`; the
question is capped at 1500 chars and an empty question is refused back to the
model.

The attach instructions (REQ-agent-476, DISCORD-17) are in the system prompt
exactly when `discord-send-file` is in the run's offered catalog and the run
env names a conversation channel; a run that does not offer the tool, or has
no conversation channel, never promises attachments.

Untrusted text (SAFE-12 / SAFE-13, REQ-agent-071): every task-run system
prompt (tool loop and read tier) carries
`UNTRUSTED_CONTENT_AGENT_SYSTEM_INSTRUCTIONS` (text between `UNTRUSTED_…`
markers and tool results marked untrusted are data that never grant a
permission; what may run is the sender's role, enforced in the tool layer;
who someone is comes only from the acting-user block). A successful result of
a tool in `UNTRUSTED_RESULT_TOOLS` (GitHub readers, `discord-user-lookup`)
reaches the model inside a `fenceUntrustedData` fence (`web-fetch` keeps its
own). A successful result of a tool in `INJECTION_SCAN_TOOLS` (`web-fetch`,
the GitHub title / docs / milestone readers, `discord-user-lookup`; never PR
diffs or file lists) is scanned by `detectInjection` over its strings (the web
fence's own lines left out): a hit puts `injectionToolNote` in front of that
tool message, drops every mutating plugin (`isMutatingPlugin`) from the
catalog sent for the rest of the run (verify retries included) and refuses
any mutating call with `injectionToolRefusal` (exit 2, never run), reports
the first hit once through `onInjection` (tool name + reason ids, never the
text) after appending an `injection-suspected` / `denied` SAFE-5 row (actor
and surface from the spawn env, digest of the tool and reasons; best effort),
emits one `[operator]` Text line, and ends every later summary with
`injectionSummaryNote` once, before any ROLES-CHAT-3 role note (which stays
last). `task run` copies the notice to `TaskResult.injection`. The detector is
bounded (capped input, bounded windows) and its patterns fold look-alike
letters and strip invisible characters first.

## Behavioral Examples

### Scenario: System prompt mentions memory-store

- **Given** tool-loop execute is constructed
- **When** the system message is built
- **Then** it embeds MEMORY_AGENT_SYSTEM_INSTRUCTIONS with argv example for
  memory-store

### Scenario: delegate hidden until the project opts in

- **Given** a project whose `fledge.toml` has no `[corvidinho.autonomous]`
- **When** a code-tier task run builds its tool catalog
- **Then** `delegate` is not offered, and a model call naming it is refused

### Scenario: community user's model invents a file write

- **Given** a non-ADMIN role session (`CORVIDINHO_ACTING_IS_ADMIN=0`) at code tier
- **When** the model calls `files-write`, which its catalog does not offer
- **Then** the call gets the `not allowed for your role` refusal, nothing is
  written, and the run summary ends with `(not allowed for your role)`

### Scenario: lead delegates a subtask

- **Given** `[corvidinho.autonomous] enabled = true` and a code-tier lead
- **When** the model calls `delegate` with `--skill specsync --task ...`
- **Then** a worker `task run` runs non-interactive at depth 1 and its summary and filesChanged come back in the tool result for the lead to synthesize

### Scenario: lead convenes a council

- **Given** `[corvidinho.autonomous] enabled = true` and a code-tier lead
- **When** the model calls `council` with `--question ...` (3 voices by default)
- **Then** 3 read-tier voices propose, each critiques the proposals, a chair decides, and the tool result carries the decision and a bounded transcript

### Scenario: the model looks at an attached image

- **Given** a tool-tier run whose model calls `files-read` on a PNG under the session cwd
- **When** the next chat/completions request is sent
- **Then** it carries the small tool message and, right after it, one user message with an `image_url` part holding `data:image/png;base64,…` of the file

### Scenario: a model without vision refuses the image

- **Given** the request carrying an image part gets HTTP 400
- **When** the loop handles it
- **Then** it drops the image message, puts `[image <path> could not be shown to this model]` in that image's tool message, retries once, and the run completes with the model's reply

### Scenario: the owner asks for a PR review with the tool allowlisted

- **Given** `CORVIDINHO_ALLOWLIST=github-pr-review` and an ADMIN (owner) run at tool tier
- **When** the task run builds its tool catalog and the model calls `github-pr-review`
- **Then** the tool is offered, the review goes through the GitHub plugin
  (GITHUB-6 repo gate, SAFE-5 audit), and an unlisted `github-issue-create`
  call is refused as not offered; a non-owner run with the same allowlist is
  offered neither (REQ-agent-501)

### Scenario: a fetched issue title tells the model to ignore its rules

- **Given** a tool-tier run that offers `files-write` and calls `github-issue-list`
- **When** an issue title reads like an instruction to set aside the previous instructions
- **Then** the tool message starts with the SAFE-13 note and holds the result inside an `UNTRUSTED_DATA` fence, the next request offers no mutating tool, a `files-write` call is refused and writes nothing, `onInjection` gets `{ source: "github-issue-list", reasons: ["ignore-rules"] }`, an `injection-suspected` row is audited, and the summary ends with the "didn't act on it" note (REQ-agent-071)

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Verify exhausted | state failed, verified=false, summary includes verifier output, `ask` reason stuck |
| Verify lane log over 4000 chars (passing steps such as the `--help` smoke fill its head) | the retry gets the failing step's name, its output (or its error lines and the end of the log) within 4000 chars, never the start of the log (REQ-agent-002, AGENT-4.a) |
| Edit no tool reported (code-tier shell-exec, delegate worker, commit through a shell) | the real git diff adds the path to filesChanged; verify runs; done only on a pass (REQ-agent-085) |
| Path dirty before the run and left untouched, or gitignored | not counted; with no tool-reported files verify is skipped (REQ-agent-085) |
| Cwd not in a git work tree, or start snapshot unreadable | tool-reported filesChanged only, as before (REQ-agent-085); if the run called a Fledge command (or the shell / a runner, or a local run's `delegate` with a Fledge plugin command allowlisted), verify runs anyway with a `Verify gate: no git working tree to diff` note (REQ-agent-502) |
| Dangerous plugin the run's allowlist does not name | not in the catalog; a model call to it is refused as not offered (REQ-agent-501 / REQ-agent-128) |
| `shell-exec`, `node-exec`, `python-exec`, `cargo-exec`, `fledge-lanes-run` or `fledge-run` named in the allowlist | still not in the catalog until the SAFE-3 decision; a model call is refused as not offered (REQ-agent-501) |
| Git diff unreadable after a good start snapshot | fail closed: verify runs; one Text note says the diff could not be read (REQ-agent-085) |
| Real diff of thousands of paths (an install, a branch switch) | at most `WORKSPACE_DIFF_MAX_FILES` join filesChanged, the note counts them all, verify runs; the NDJSON result line stays under the parser cap (REQ-agent-085) |
| Retry after a failed verify changes no files | filesChanged is the union across attempts, so verify runs again; never done unless it passes (REQ-agent-242) |
| Provider / HTTP / network failure in execute | `ExecuteResult.error`; state failed, verified=false, summary is the provider error (then the earlier verify output when a verify already failed), `task run` exits 1 (REQ-agent-242) |
| Model calls ask-human | state blocked, verifySkipped=true, `ask` reason clarify, summary `Needs your input: …` |
| ask-human with empty question | ToolResult success=false fed back to the model; loop continues |
| AbortSignal fired | cancelled=true (outer loop) or execute returns early mid tool loop |
| AbortSignal fired while verify runs | lane's process tree killed; cancelled=true, no VerifyResult, no retry, no `ask` |
| Aborted lane left an escaped process holding its output pipe | runner stops waiting after a 250 ms grace; cancelled=true |
| HTTP 400 / 404 / 413 / 415 / 422 on a request carrying image parts (model or gateway without vision, image too large) | image user messages removed, each image's tool message says `[image <path> could not be shown to this model]`, `[operator]` Text note, request retried once; later images get that note in their tool message (REQ-agent-428) |
| Any error on that retry, any other status (401 / 429 / 5xx) with images, or an error on a request with no image parts | provider error as today (`LLM HTTP <status>`, `ExecuteResult.error`; REQ-agent-242) |
| LLM provider stalls (no headers, or a body that never ends) | request aborted after `LLM_REQUEST_TIMEOUT_MS`; summary `LLM request timed out after <ms>ms` |
| fledge missing | verify failure output names PATH miss |
| Source file with no spec coverage | verify lane `spec-check` (`--require-coverage 100`) fails; verified=false, retried like any verify failure |
| SpecSync registry missing | Planning lists modules from `specs/<name>/<name>.spec.md` instead (REQ-plugins-008); none there → soft-fails; execute continues |
| Dangerous plugin + non-interactive + not allowlisted | ToolResult success=false (SAFE-1); loop may continue |
| Spend cap set and 24h spend + estimate over it, unpriced model, invalid cap value, or ledger unavailable | provider call not sent; run ends `blocked` with a `spend-cap` ask stating spend vs cap and the operator action (no yes/no question); summary is the generic `SPEND_CAP_SUMMARY` (SAFE-8) |
| Settled call brings 24h spend to ≥80% of the cap while the warning is armed | one `Text` warning + `TaskResult.spendWarning` + a pending `warn` row; later calls stay quiet until spend is seen under 70% (or 24 h pass) (SAFE-8) |
| Autonomous tool named while not offered | Refused like any non-offered tool (REQ-agent-128) |
| Non-ADMIN caller (checked at the call) names a mutating / dangerous plugin it was not offered (or `runPlugin` refuses an offered one for the role) | ToolResult success=false with the role refusal `not allowed for your role`, nothing runs; the run summary ends with `(not allowed for your role)` once, and the result frame / chat body caps keep it (ROLES-CHAT-3, REQ-agent-333) |
| A tool's own error only quotes "not allowed for your role" | No role note (only the exact role refusal counts, REQ-agent-333) |
| Delegation depth env malformed | Treated as the cap; no further delegation |
| Worker hangs / lead interrupted | Worker SIGTERM then SIGKILL; lead returns after a short drain |
| Council: fewer than 2 voices propose | No critique or decide; ok=false with the transcript |
| Council: chair fails | ok=false, empty decision, transcript kept |
| Council: time cap or lead abort | Running voices stopped, later phases not started; state cancelled |
| AGENTS.md / CLAUDE.md missing | skipped; system prompt unchanged |
| Instruction file symlink resolves outside the project | refused; named in a one-time Text note; run continues |
| Instruction file is a directory, binary, or not UTF-8 | refused; named in a one-time Text note; run continues |
| Instruction file over 16 KiB | first 16 KiB kept (UTF-8 boundary) plus truncation marker; one-time Text note |
| Git project: working-tree AGENTS.md / CLAUDE.md differs from HEAD | HEAD copy loaded; one-time Text note says working-tree changes were not loaded |
| Git project: instruction file untracked, or HEAD unborn | refused as not committed; named in the Text note |
| Git project: `.git` unusable (not a repo top level, git missing) | present files refused; no working-tree fallback |
| Git project: committed symlink leaves the commit, is broken, hops a symlinked dir, or loops | refused; named in the Text note |
| A tool result in `INJECTION_SCAN_TOOLS` looks like an injection attempt (SAFE-13) | note in front of that tool message; no mutating tool offered or run for the rest of the run (refused with `injectionToolRefusal`, exit 2); `onInjection` once; `injection-suspected` audit row; summary ends with `injectionSummaryNote`; `TaskResult.injection` set (REQ-agent-071) |
| Audit trail unavailable when a tool result trips the detector | one `[audit] could not record injection-suspected` line; mutating tools still dropped (REQ-agent-071) |

## Dependencies

Spawns `fledge` for the default verify runner. Reads SpecSync registry/specs via plugin helpers. Dispatches allowlisted plugins via `runPlugin` during the LLM tool loop. No Trust/attest.

## Change Log

Flesh LLM tool loop MVP on prove-before-done (#31) (2026-09-26, corvid-agent).
| 2026-09-26 | discord-dogfood soft-land + Discord chat prompt (REQ-agent-312 / AGENT-9 / IDENTITY-5 / ROLES-CHAT-9) |
| 2026-09-26 | dogfood-ux-discord-identity-inject-identity-4-thinking-embed-model-plumbing-discord-3-a-clean-chat-replies-community: chat/plumbing split for Discord summaries; identity + public Q&A system instructions |
| 2026-09-26 | flesh-full-llm-tool-loop-on-prove-before-done-so-task-run-discord-watch-can-call-allowlisted-plugins-via-openai: Flesh full LLM tool loop on prove-before-done so task run / Discord / WATCH can call allowlisted plugins via OpenAI-compatible tools (issue #31 dogfood MVP) |
| 2026-09-26 | memory-discord-inject: MEMORY system prompt + tool argv (REQ-agent-010) |
| 2026-09-26 | discord-memory-auto-recall-inject-on-spawn-plus-system-prompt-store-recall-rules-agent-7-memory-2-4-draft-67-behavior: Discord MEMORY auto-recall inject on spawn plus system-prompt store/recall rules (AGENT-7 MEMORY-2/4 draft #67 behavior) package 0.0.7 |
| 2026-09-26 | tool-loop-dispatches-only-tools-offered-in-the-run-s-catalog-safe-1-agent-5-pr-128-review-follow-up-a-registered-but: Tool loop dispatches only tools offered in the run's catalog (SAFE-1 / AGENT-5, PR #128 review follow-up): a registered but not-offered (e.g. dangerous or above-tier) plugin name from the model is refused instead of run; memory store test updated for soft-deleted re-store history |
| 2026-09-26 | spawned-agents-ignore-the-project-env-and-tests-never-create-real-worktrees-allow-4-safe-1-session-worktree-3-hygiene: Spawned agents ignore the project .env and tests never create real worktrees (ALLOW-4 / SAFE-1 / SESSION-WORKTREE-3 hygiene): bun-invoked spawns pass --no-env-file so a project worktree's .env cannot inject allowlists, admin lists or keys into the agent; bridge and slash fixture tests use temp project roots so bun test never adds talk/* worktrees or branches to the repo |
| 2026-09-26 | live-ndjson-event-stream-for-bridges-issue-73-agent-8-cli-7-discord-3-discord-10-task-run-output-ndjson-emits-one: Live NDJSON event stream for bridges (issue #73, AGENT-8 / CLI-7 / DISCORD-3 / DISCORD-10): task run --output ndjson emits one versioned JSON object per line for StateChanged/Text/ToolCall(redacted argument summary)/ToolResult/VerifyResult, running token usage, and a final result line; Discord and WATCH spawn clients consume the stream and forward state/tool/tokens to onStatus; protocol version 1 to 2 |
| 2026-09-26 | safe-8-daily-spend-cap-issue-98-captured-slice-optional-corvidinho-daily-spend-cap-usd-caps-provider-llm-spend-over-a: SAFE-8 daily spend cap (issue #98 captured slice): optional CORVIDINHO_DAILY_SPEND_CAP_USD caps provider (LLM) spend over a rolling 24h; each OpenAI-compatible call is priced from a per-model table, reserved against a spend_ledger in the shared SQLite DB before it is sent and refused with a clear error when it would break the cap, then settled from provider-reported token usage; unpriced models are refused while a cap is set; no cap means no behavior change; doctor shows spend vs the cap (AUTONOMOUS-8); ledger provider/model columns are SAFE-6 scrubbed; draft SAFE-14..16 (80% warn, per-provider caps, ask at 100%) left for HI capture |
| 2026-09-26 | autonomous-1-gate-and-depth-capped-delegate-tool-issue-117: AUTONOMOUS-1 `[corvidinho.autonomous]` gate, SAFE-9 catalog hiding, delegation core with depth / tier / fan-out safety defaults (REQ-agent-117) |
| 2026-09-26 | autonomous-1-gate-and-depth-capped-delegate-tool-issue-117-autonomous-1-5-safe-9-autonomous-mode-off-until-corvidinho: AUTONOMOUS-1 gate and depth-capped delegate tool (issue #117, AUTONOMOUS-1/5, SAFE-9): autonomous mode off until [corvidinho.autonomous] enabled = true in the project fledge.toml; a code-tier lead can delegate a skill-tagged subtask to a worker (child task run, same-or-lower tier, non-interactive, depth <= 2, capped fan-out) and synthesize its summary; delegate stays hidden from the tool catalog unless the session is allowed |
| 2026-09-26 | task-run-reads-the-project-s-own-agents-md-and-claude-md-from-the-project-root-into-the-llm-system-prompt-as-labelled: Task run reads the project's own AGENTS.md and CLAUDE.md from the project root into the LLM system prompt as labelled project instructions (AGENT-1, issue #84 captured slice): 16 KiB cap with truncation marker, symlinks outside the project refused, binary/non-UTF-8 refused, SAFE-6 scrubbed |
| 2026-09-26 | call-registered-fledge-plugins-as-tools-issue-112-fledge-4-5-plugin-2-3-6-discover-the-project-s-fledge-plugins-via-the: Call registered Fledge plugins as tools (issue #112, FLEDGE-4/5 PLUGIN-2/3/6): discover the project's Fledge plugins via the fledge CLI, register each command as a dangerous typed plugin run through fledge plugins run with argv arrays, and show per-command tool schema cost plus a context budget line in plugins list |
| 2026-09-26 | autonomy-1-2-ask-human-tool-and-stuck-owner-ping-on-discord-44: AUTONOMY-1/2 ask-human tool and stuck owner ping on Discord (#44) |
| 2026-09-26 | autonomy-4-7-clarify-pings-requester-thin-ack-restates-pending-ask-cancel-clears-joke-impossible-witty-decline-package: AUTONOMY-7 joke/impossible guidance in ASK_AGENT_SYSTEM_INSTRUCTIONS |
| 2026-09-26 | repo-projects-load-agents-md-and-claude-md-from-the-head-commit-not-the-working-tree-so-the-non-dangerous-file-tools: Repo projects load AGENTS.md and CLAUDE.md from the HEAD commit, not the working tree, so the non-dangerous file tools cannot plant system-prompt instructions for later runs (AGENT-1 hardening, issue #84, review of PR #150) |
| 2026-09-26 | roles-chat-tool-gates-non-admin-read-chat-catalog-refuse-mutating-at-run-time-admin-still-behind-safe-tests-roles-chat: ROLES-CHAT-2 catalog omit mutating for non-ADMIN |
| 2026-09-26 | safe-8-amended-issue-98-warn-at-80-of-the-daily-spend-cap-and-ask-at-100-instead-of-refusing-once-per-crossing-a-run: SAFE-8 amended (issue #98): warn at 80% of the daily spend cap and ask at 100% instead of refusing. Once per crossing a run that pushes rolling 24h spend to 80% of CORVIDINHO_DAILY_SPEND_CAP_USD emits a warning (Text event, result spendWarning, Discord reply line with owner ping); a provider call that would pass the cap is stopped before it is sent and the run ends blocked with a spend-cap ask to the owner via the AUTONOMY-1/2 ask path stating spend vs cap and how to continue; doctor and Discord /status show 24h spend vs the cap (AUTONOMOUS-8); Approve card (#96) left for HI capture |
| 2026-09-26 | spawned-agents-pin-bun-config-to-a-known-empty-file-and-safe-2-protects-bunfig-toml-so-a-planted-preload-cannot-run: Spawned agents pin Bun config to a known-empty file and SAFE-2 protects bunfig.toml so a planted preload cannot run code in the agent (#133 isolation / SAFE-1) |
| 2026-09-26 | council-tool-issue-118-autonomous-6-safe-9-a-code-tier-lead-in-an-autonomous-enabled-project-can-convene-a-council-of-2: Council tool (issue #118, AUTONOMOUS-6, SAFE-9): a code-tier lead in an autonomous-enabled project can convene a council of 2-5 delegated voices that deliberate in structured phases (propose, critique, decide) and get back a bounded transcript and a synthesized decision; voices run read tier by default with no mutating tools, reuse delegate caps and worker env stripping, and the tool stays hidden unless the session is allowed |
| 2026-09-26 | harden-child-process-lifetimes-and-fledge-scoping-issue-112-follow-up-to-154-157-167-fledge-plugin-argv-after-own: Harden child process lifetimes and Fledge scoping (issue #112 follow-up to #154, #157, #167): fledge plugin argv after --, own process group plus tree kill on timeout or abort for Fledge runs, delegate workers and schedule runs, daemon shutdown kills abandoned runs, Fledge commands scoped to the project root they were discovered for |
| 2026-09-26 | agent-loop-never-reports-done-after-a-failed-verify-or-a-provider-error-agent-4-8-union-fileschanged-across-attempts-so: Agent loop never reports done after a failed verify or a provider error (AGENT-4/8): union filesChanged across attempts so a retry that changes nothing is re-verified, and provider/HTTP failures return an execute error flag that ends the run failed |
| 2026-09-26 | agent-run-summaries-are-secret-scrubbed-before-every-length-clip-and-a-private-key-block-cut-before-its-end-line-is: Agent run summaries are secret-scrubbed before every length clip, and a private-key block cut before its END line is redacted |
| 2026-09-26 | discord-ask-ephemeral-buttons-session-multi: ask-human options + ask-options parse for DISCORD-ASK buttons |
| 2026-09-26 | discord-ask-1-5-ephemeral-discord-button-asks-session-multi-1-4-per-user-sessions-package-0-0-22: DISCORD-ASK-1..5 ephemeral Discord button asks + SESSION-MULTI-1..4 per-user sessions; package 0.0.22 |
| 2026-09-26 | planning-specsync-briefing-reaches-the-model-runtask-passes-the-loaded-spec-constraints-and-companions-to-every-execute: Planning SpecSync briefing reaches the model: runTask passes the loaded spec constraints and companions to every execute attempt and the LLM user message carries them fenced as project data (AGENT-2, SPECSYNC-1/5) |
| 2026-09-27 | planning-picks-spec-modules-from-the-request-not-the-bridge-wrapper-and-the-briefing-fence-and-cap-are-hardened: Planning picks spec modules from the request not the bridge wrapper, and the briefing fence and cap are hardened |
| 2026-09-26 | safe-8-review-follow-up-for-pr-160-issue-98-a-post-that-did-not-go-out-hands-back-the-80-spend-warning-and-the-spend: SAFE-8 review follow-up for PR #160 (issue #98): a post that did not go out hands back the 80% spend warning and the spend-cap owner ping on every bridge surface (a slash reply that fails, e.g. an expired interaction token, still posts the owner notice), a warning claimed while spend is back under 80% stays pending for the next post at 80% or more, and a spend-cap stop is never kept as the session pending ask |
| 2026-09-27 | agent-loop-provider-error-summary-still-says-plainly-that-an-earlier-verify-failed-agent-4-a-run-that-ends-failed-on-a: Agent loop provider-error summary still says plainly that an earlier verify failed (AGENT-4): a run that ends failed on a provider error after a failed verify keeps that verify output in its summary |
| 2026-09-26 | task-run-stops-on-sigint-sigterm-with-a-cancelled-result-and-a-stopped-verify-lane-and-a-stalled-llm-request-times-out: Task run stops on SIGINT/SIGTERM with a cancelled result and a stopped verify lane, and a stalled LLM request times out (agent-loop-4) |
| 2026-09-27 | task-run-leaves-a-sigint-it-started-with-ignored-alone-and-an-interrupted-verify-lane-stops-waiting-on-a-pipe-an: Task run leaves a SIGINT it started with ignored alone, and an interrupted verify lane stops waiting on a pipe an escaped lane process holds (agent-loop-4 follow-up) |
| 2026-09-27 | lightly-adopt-agent-3md-ship-guidance-only-agent-3md-plus-corvidlabs-agent3md-dep-and-validate-route-smoke-no-agent-13: Lightly adopt agent.3md: ship guidance-only agent.3md plus @corvidlabs/agent3md dep and validate/route smoke; no AGENT-13 runtime wiring |
| 2026-09-27 | tests-never-write-the-operator-data-dir-and-the-verify-lane-never-sees-operator-secrets-bun-test-preload-always-points: Tests never write the operator data dir and the verify lane never sees operator secrets: bun test preload always points CORVIDINHO_DATA_DIR at its own temp dir and clears CORVIDINHO_AUDIT_HMAC_KEY / CORVIDINHO_WATCH_SPAWN_LOG / WORKTREE_BASE_DIR; the fledge verify runner spawns with DISCORD_*, GitHub tokens, LLM API keys, the audit key and CORVIDINHO_ACTING_* stripped (SAFE-5 / SAFE-6) |
| 2026-09-27 | discord-dogfood-member-user-lookup-for-snowflakes-identity-5-discord-13-soft-land-tool-round-exhaustion-without-dumping: Discord dogfood: member/user lookup for snowflakes (IDENTITY-5/DISCORD-13), soft-land tool-round exhaustion without dumping Stopped after N (AGENT-9), chat prefers prose over SpecSync/github thrash (ROLES-CHAT-9); package 0.0.28 |
| 2026-09-27 | per-tier-model-read-tool-code-runs-call-the-model-configured-for-that-tier-agent-5: Per-tier model: read/tool/code runs call the model configured for that tier (AGENT-5) |
| 2026-09-27 | local-spec-check-runs-at-the-ci-spec-sync-strictness-specsync-check-require-coverage-100-specsync-check-falls-back-to: Local spec-check runs at the CI Spec Sync strictness (specsync check --require-coverage 100), specsync-check falls back to specsync check when the project defines no Fledge spec-check task, and a read-only specsync-score tool reports SpecSync spec scores (SPECSYNC-2/3, issue 89) |
| 2026-09-27 | the-verify-gate-uses-the-run-s-real-git-working-tree-diff-not-only-the-files-tools-report-so-an-edit-made-outside-the: The verify gate uses the run's real git working-tree diff, not only the files tools report, so an edit made outside the file tools is verified before done (AGENT-4, #85) |
| 2026-09-27 | files-read-passes-images-to-the-model-as-image-parts-it-can-see-with-a-one-shot-text-fallback-for-models-without-vision: Files-read passes images to the model as image parts it can see, with a one-shot text fallback for models without vision (DISCORD-9) |
| 2026-09-27 | verify-retry-feedback-keeps-the-failing-step-s-output-failing-step-name-error-lines-end-of-the-log-instead-of-the-first: Verify retry feedback keeps the failing step's output (failing step name, error lines, end of the log) instead of the first 4000 chars of the lane log (AGENT-4.a, #85) |
| 2026-09-27 | roles-chat-7-b-an-admin-role-session-s-github-pr-create-is-tested-safe-1-denies-it-without-an-allowlist-entry-github-6: ROLES-CHAT-7(b): an ADMIN role session's github-pr-create is tested: SAFE-1 denies it without an allowlist entry, GITHUB-6 still refuses an unlisted repo, and the dry-run PR goes through with the allowlist entry plus the GITHUB-6 repo allowlist |
| 2026-09-27 | plugin-1-fledge-itself-as-typed-builtins-fledge-lanes-list-and-fledge-lanes-validate-read-only-and-fledge-lanes-run-and: PLUGIN-1 Fledge itself as typed builtins: fledge-lanes-list and fledge-lanes-validate (read-only) and fledge-lanes-run and fledge-run (dangerous, code tier) wrap the local fledge CLI in the project root |
| 2026-09-27 | roles-chat-3-a-non-admin-session-s-invented-call-to-a-mutating-or-dangerous-plugin-gets-the-role-refusal-not-allowed: ROLES-CHAT-3: a non-ADMIN session's invented call to a mutating or dangerous plugin gets the role refusal (not allowed for your role), not the catalog refusal, and the run summary ends with a short (not allowed for your role) note once a call was refused for the caller's role |
| 2026-09-27 | task-run-offers-allowlisted-dangerous-tools-to-the-model-a-dangerous-plugin-enters-the-catalog-only-when-corvidinho: Task run offers allowlisted dangerous tools to the model: a dangerous plugin enters the catalog only when CORVIDINHO_ALLOWLIST names it (tier, role and SAFE-9 filters unchanged); shell-exec and the node/python/cargo runners stay out pending the SAFE-3 decision; a non-git run whose Fledge command may have changed files verifies anyway (CLI-3, GITHUB-1/3, ROLES-CHAT-4, PLUGIN-3, AGENT-4) |
| 2026-09-27 | req-agent-112-after-the-fledge-core-builtins-an-allowlist-with-no-fledge-entry-and-a-non-admin-role-session-offer-no: REQ-agent-112 after the Fledge core builtins: an allowlist with no fledge-* entry and a non-ADMIN role session offer no Fledge plugin command and never spawn fledge; the only fledge- tools they offer are the read-only core builtins fledge-lanes-list and fledge-lanes-validate (PLUGIN-1, PLUGIN-3, ROLES-CHAT-2) |
| 2026-09-27 | fledge-core-runs-wait-on-safe-3-like-the-shell-fledge-lanes-run-and-fledge-run-are-never-offered-to-the-model-from-the: Fledge core runs wait on SAFE-3 like the shell: fledge-lanes-run and fledge-run are never offered to the model from the task-run allowlist (SAFE3_PENDING_TOOLS), and allowlisting a Fledge core builtin does not start Fledge plugin discovery (PLUGIN-1, CLI-3, SAFE-1, SAFE-3 pending) |
| 2026-09-29 | discord-send-file-attaches-files-and-images-to-replies-in-the-conversation-s-own-channel-and-the-model-is-told-it-can: Discord-send-file attaches files and images to replies in the conversation's own channel, and the model is told it can (DISCORD-17) |
| 2026-09-29 | three-roles-owner-team-and-community-gate-every-tool-each-declared-person-has-one-role-set-only-by-the-owner-role-key: Three roles: owner, team and community gate every tool. Each declared person has one role set only by the owner (role key or audited /admin people role); the tool layer re-resolves the actor's role from the people registry on every run and surface (runPlugin + catalog): owner keeps everything, team gets /work edits and PR, GitHub reviews and comments on allowlisted repos and only their own memory, community (and anyone undeclared, WATCH, schedules, workers) keeps today's read/chat tools; community site/roadmap sources are the public repo docs and the public issues and milestones of allowed public repos (IDENTITY-8..12, ADMIN-3.b, ROLES-CHAT-8.a, #65) |
| 2026-09-29 | person-and-project-memory-private-notes-and-forget-me-on-an-owner-approve-deny-card-each-declared-person-keeps-one: Person and project memory, private notes, and forget-me on an owner Approve/Deny card: each declared person keeps one profile keyed by person id (role, projects, preferences, history of decisions, asks and approvals), each project keeps memory keyed by its repo for whoever works on it next, a person's memory and private notes are shown only to them and the owner on every surface, and anyone can ask to be forgotten, which deletes their memories once the owner approves on a DM Approve/Deny card (MEMORY-5/6/7, MEMORY-ACL-6, #101) |
| 2026-09-29 | ask-option-ids-come-out-unique-so-choose-buttons-open-and-a-pick-resumes-with-the-pressed-label-a-reply-after-a-button: Ask option ids come out unique so Choose buttons open and a pick resumes with the pressed label; a reply after a button ask expired clears it instead of restating a dead Choose button (DISCORD-ASK-1/3/5) |
