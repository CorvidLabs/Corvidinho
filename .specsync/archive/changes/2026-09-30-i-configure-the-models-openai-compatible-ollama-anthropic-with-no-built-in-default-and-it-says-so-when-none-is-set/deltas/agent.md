---
module: agent
change: i-configure-the-models-openai-compatible-ollama-anthropic-with-no-built-in-default-and-it-says-so-when-none-is-set
---

# Delta: agent (the models I configure, no built-in default, and a no-provider notice — AGENT-13, AGENT-10)

## Added

### REQUIREMENT REQ-agent-179

I configure its models (OpenAI-compatible, Ollama, Anthropic or a headless
agent CLI), and there's no built-in default (AGENT-13, partial: the headless
agent CLI kind is a later change); with no provider set, it says so at startup
and in /status (AGENT-10). Both were captured in `hi/agent.md` from Leif's
2026-09-28 interview. `src/agent/providers.ts` SHALL read the model entries:
`CORVIDINHO_LLM_MODEL` and the per-tier `CORVIDINHO_LLM_MODEL_READ` / `_TOOL`
/ `_CODE` (REQ-agent-079) each hold an ordered, comma-separated list of
entries (blanks skipped); an entry is `kind:model` with kind `openai`,
`ollama` or `anthropic` (case-insensitive, split on the first `:` only when
the prefix is a kind), and a bare entry or one whose prefix is not a kind
(`qwen3:30b`) is OpenAI-compatible. Only the first entry of a tier SHALL be
called; the AGENT-11 fallback chain is a later change. Each kind SHALL use
its vendor endpoint (the endpoint of a provider the operator chose, not a
default model) and its own key, never another kind's: `openai` →
`CORVIDINHO_LLM_BASE_URL` (else `https://api.openai.com/v1`) with
`CORVIDINHO_LLM_API_KEY`, else `OPENAI_API_KEY`; `ollama` → `OLLAMA_HOST` read
as Ollama reads it (`host`, `host:port` or a URL; no scheme means http and
port 11434; a bind-all address is reached on loopback; default
`127.0.0.1:11434`) plus `/v1`, with no key; `anthropic` →
`https://api.anthropic.com/v1` (its OpenAI-compatible API) with
`ANTHROPIC_API_KEY`. Every kind SHALL go through the one OpenAI-compatible
chat transport (`chatCompletions`, `extractUsage`) and the SAFE-8 spend guard
unchanged; the request's `body.model` SHALL be the entry's model without its
`kind:` prefix, and `authorization: Bearer <key>` SHALL be sent only when the
kind has a key. There SHALL be no built-in default model and no demo stub. A
tier's provider is usable when it has an entry and, for `openai` /
`anthropic`, its key is set; a keyless `ollama` entry is usable. With no
usable provider for a run's tier, `loadLlmEnv` SHALL carry the no-provider
notice (`providerNotice`, starting with `NO_PROVIDER_NOTICE` "No model
provider is configured") and the execute attempt SHALL make no provider call
and SHALL return `error: true` with the notice as its summary and no files,
so `runTask` ends `failed` on every surface (CLI, Discord chat, slash
commands, `/work`, schedules, WATCH, delegate and council workers). The
notice SHALL name what is missing — `CORVIDINHO_LLM_MODEL is not set` with
how to set it (`openai:<model>`, `ollama:<model>` or `anthropic:<model>`,
per-tier keys, no built-in default), or `<entry> needs <KEY>, which is not
set` — grouping tiers with the same problem and naming the tiers when not
every tier asked about has it; it SHALL name env keys and models only, never
a key value. `providerStatus`, `providerForTier`, `defaultProviderLabel`
(`<label> @ <host>` of the default tier, `openai` entries shown bare) and
`providerId` (the endpoint host, which the SAFE-8 ledger records as
`provider`) serve doctor, `/status` and the startup lines.
`ANTHROPIC_API_KEY` SHALL be a SAFE-6 secret env name (`redactSecretEnvValues`
/ `formatErrorLine`), as it already is dropped from the verify lane and the
shell (`VERIFY_ENV_DROP`). No schema change, slash command, CLI flag or
/admin knob is added; `OLLAMA_HOST` and `ANTHROPIC_API_KEY` are read only for
their kind.

Acceptance Criteria
- `parseModelEntry`: `openai:gpt-4.1`, `ollama:qwen3:30b` (model `qwen3:30b`), `Anthropic:<m>`; bare `gpt-4o` and `qwen3:30b` are `openai`; blank and `ollama:` are null. `parseModelChain("ollama:a, anthropic:b ,, c")` keeps order and skips blanks.
- A tier's own key wins, a blank or `,`-only key falls back to `CORVIDINHO_LLM_MODEL`, and nothing set is `[]`; `modelForTier` is the model without its kind, `""` when none.
- `resolveEntry`: openai default `https://api.openai.com/v1`, `CORVIDINHO_LLM_BASE_URL` wins (trailing `/` dropped), `CORVIDINHO_LLM_API_KEY` over `OPENAI_API_KEY`, unusable without a key; ollama `http://127.0.0.1:11434/v1`, no key even when `OPENAI_API_KEY` is set, usable; anthropic `https://api.anthropic.com/v1` with `ANTHROPIC_API_KEY` only, unusable without it; `providerId` is the host.
- `OLLAMA_HOST` `gpu-box` → `http://gpu-box:11434`, `gpu-box:9000`, `0.0.0.0` → `127.0.0.1:11434`, `https://…/` and `http://10.0.0.5:11434` as given.
- Mock fetch: an `ollama:qwen3:30b` run posts to `http://gpu-box:9000/v1/chat/completions` with no authorization header and `model` `qwen3:30b`; an `anthropic:` run posts to `https://api.anthropic.com/v1/chat/completions` with `Bearer <ANTHROPIC_API_KEY>`, never the OpenAI key; `openai:gpt-4.1, ollama:later` calls only `gpt-4.1` at the base URL with its key.
- `providerNotice({})` and with only `OPENAI_API_KEY` is the "CORVIDINHO_LLM_MODEL is not set" notice with how to set it; `anthropic:c` without its key names `ANTHROPIC_API_KEY`; only `_READ` set names the tool and code tiers; one run's own tier with a provider is null; the key value never appears.
- `runTask` over `createTaskExecute` with only a key: `failed`, summary the notice, `filesChanged` `[]`, one attempt, no verify, no provider call.
- The real `task run` with a keyless `ollama:` model pointed at a localhost fake server ends `done` with the server's reply; the server saw no authorization header and `model` `fake-model`.
- `redactSecretEnvValues` / `formatErrorLine` redact an `ANTHROPIC_API_KEY` value.
- On the base sources `tests/agent.providers.test.ts` fails 15 of 18 (the three that pass are pure units of the new module); on the branch all pass.

## Modified

### REQUIREMENT REQ-agent-007

The execute hook for `task run` SHALL call the OpenAI-compatible chat completions endpoint of the model provider the operator configured for the run's capability tier (AGENT-13, REQ-agent-179: the tier's first `kind:model` entry from `CORVIDINHO_LLM_MODEL_*` / `CORVIDINHO_LLM_MODEL`, with that kind's endpoint and key; the model per REQ-agent-079). There SHALL be no demo execute stub and no built-in default model: when the run's tier has no usable provider (no entry, or the kind's key is unset) the attempt SHALL make no provider call and SHALL return `error: true` with the no-provider notice as its summary and no files (AGENT-10), so the run ends `failed`. Secrets SHALL stay in env and SHALL never be committed.

Acceptance Criteria
- No usable provider (nothing set, a key with no model, or a model whose kind has no key) → no fetch; `error: true`, the summary starts `No model provider is configured`, `filesChanged` `[]`; never a demo summary or `gpt-4o-mini`.
- Usable provider → chat completions path (tool loop or read-tier chat per REQ-agent-008/009).
- Fixture tests cover the no-provider path; provider paths mock fetch or use a localhost fake provider (no live API in CI).
- Provider set → every request's `model` is the run tier's model without its `kind:` prefix (REQ-agent-079); with no per-tier model key it is `CORVIDINHO_LLM_MODEL`'s first entry.

### REQUIREMENT REQ-agent-015

Carried baseline in a talk worktree (AGENT-15.a, captured 2026-09-29 from
Leif's 2026-09-28 interview record, round 12). A linked talk worktree is one
whose own git dir is `<common git dir>/worktrees/talk-*` (as
`ensureTalkWorkspace` makes them, REQ-discord-085), read from its `.git`
file (`talkWorktreeGitDir`, `src/worktree/base.ts`). Its own git dir holds a
verified marker (`corvidinho-verified`, never in the working tree, so never
part of a diff) that SHALL be written when the worktree is made and when a
run in it ends `done` (verified, or nothing to verify), never through a
symlink. `startWorkspaceDiff` SHALL take the marker away as a run starts;
when it was there, the run's baseline is its own start snapshot
(REQ-agent-085). When it was not there (the last run in that worktree ended
`blocked`, `failed` or cancelled, or its process died mid-run) or could not
be removed, the tracker SHALL be `carried`: its baseline is the talk
branch's merge-base with the base branch (`resolveBase`: the remote's default
branch, else `main`; `refs/remotes/origin/<base>`, else `refs/heads/<base>`;
the one helper /work uses too, REQ-discord-088) with no dirt, so every path
changed since the talk started counts, including commits and edits an earlier
attempt left, and `runTask` SHALL emit one `Text` event `Verify gate: the last
run in this talk did not end verified, so every edit since the talk started
is checked (from the talk branch's merge-base).` A merge-base git cannot give
SHALL make the diff unreadable, so verify runs anyway (fail closed,
REQ-agent-085). `runTask` SHALL settle the marker once per run: written when
the run ends `done`, removed (so one written meanwhile does not count) when it
ends any other way. A run in any other checkout (the caller's own checkout, a
main checkout, another linked worktree) SHALL keep the run-start baseline. A
nested run (a delegate or council worker, `CORVIDINHO_DELEGATE_DEPTH` above
0, REQ-agent-117) runs in its lead's cwd while the lead holds the marker:
`task run` SHALL start its tracker with `{ nested: true }`, which never takes
or writes the marker and is never `carried` (its baseline is its own start,
so a read-only council voice does not run the lane on the lead's edits), and
removes a marker when the worker does not end `done`. The lead's own gate
covers the combined change, and a lead that dies after a worker ended `done`
still leaves the next run carried. No env var, config key, flag, table or
NDJSON field is added; `WorkspaceDiffTracker` gains the optional `carried`
and `settle` members.

Acceptance Criteria
- A new talk worktree has the marker; its first run that changes nothing ends `done` with the "no changes" note and no carried note.
- A run in a talk worktree that edits `app.ts` and ends `blocked` on an ask leaves no marker; the next run there, which changes nothing, runs verify once, lists `app.ts` in `filesChanged`, emits the carried note and ends `done` verified; the run after that changes nothing and has nothing to verify.
- After a run that failed verify, a run that changes nothing verifies again and ends `failed`.
- A commit an earlier run made through a shell (clean tree) is carried; so is an edit left by a cancelled run and by a process that took the marker and never settled.
- A talk whose base branch cannot be found verifies anyway with the "could not read the git working-tree diff" note.
- The caller's own checkout: an edit left by a blocked run is not carried into the next run.
- `talkWorktreeGitDir` is null for a main checkout and for a linked worktree not named `talk-*`; `takeTalkVerified` is true once, then false, and false for a symlink in the marker's place; a `done` settle never writes through that symlink; a marker planted during a run that does not end `done` is removed.
- The real CLI in a carried talk worktree runs the verify lane although its run (a fake provider whose reply calls no tool) changes nothing.
- A worker (`{ nested: true }`) in a talk worktree whose lead took the marker and edited `app.ts`: one that changes nothing ends `done` without the lane; one that edits `lib.ts` lists only `lib.ts` and ends `done` verified; neither writes the marker, so the next top-level run (the lead died) carries `app.ts` and `lib.ts`. A worker that ends `failed` removes a marker; one that ends `done` leaves it as it was. The real CLI with `CORVIDINHO_DELEGATE_DEPTH=1` in a carried talk worktree runs no lane and writes no marker.

### REQUIREMENT REQ-agent-079

`loadLlmEnv(env, tier?)` SHALL resolve the model for the run's effective capability tier (the explicit tier — `--tier` / `createTaskExecute` `tier` — else `CORVIDINHO_LLM_TIER`, default `tool`): the optional key for that tier (`CORVIDINHO_LLM_MODEL_READ`, `CORVIDINHO_LLM_MODEL_TOOL` or `CORVIDINHO_LLM_MODEL_CODE`; blank counts as unset) SHALL win, else `CORVIDINHO_LLM_MODEL`, else no model at all (AGENT-5; AGENT-13: there is no built-in default, and the run fails with the no-provider notice, REQ-agent-179). Each key holds `kind:model` entries (REQ-agent-179); the tier's model is its first entry. Every chat request of the run SHALL carry that model, without its `kind:` prefix, in `body.model`, so SAFE-8 spend pricing prices the tier's model. The endpoint and the API key SHALL come from the entry's kind (REQ-agent-179), so tiers of one kind share them (`openai` entries share `CORVIDINHO_LLM_BASE_URL` and its key). Delegate workers and council voices SHALL inherit the per-tier keys (they are not worker-env-dropped) and SHALL resolve the model at their own tier. With no per-tier key set, every tier SHALL call `CORVIDINHO_LLM_MODEL` exactly as before. Model resolution SHALL NOT print or log the API key. Under a SAFE-8 cap the unpriced-model ask SHALL name the env key that set the run's model (the tier's key when set, else `CORVIDINHO_LLM_MODEL`), and when any per-tier key is set the doctor `spend` line (REQ-cli-098) and the Discord `/status` spend line SHALL warn when any tier's model has no known price and SHALL name that tier; with no per-tier key they SHALL read as before. A tier with no model calls nothing, so it SHALL NOT be flagged as unpriced.

Acceptance Criteria
- `CORVIDINHO_LLM_MODEL=big`, `CORVIDINHO_LLM_MODEL_READ=cheap`: a read run sends `cheap`, tool and code runs send `big`; adding `CORVIDINHO_LLM_MODEL_CODE=big2` / `CORVIDINHO_LLM_MODEL_TOOL=mid` makes code send `big2` and tool `mid`.
- `CORVIDINHO_LLM_TIER=code` with `tier: "read"` sends `cheap`; `CORVIDINHO_LLM_TIER=read` with `tier: "code"` sends the code model.
- A read-tier `buildDelegateSpawn` env keeps the per-tier keys and resolves `cheap` (env tier or `--tier read`).
- Under a SAFE-8 cap, an unpriced read model stops a read run before any provider call and the spend-cap ask names that model and `CORVIDINHO_LLM_MODEL_READ` as the key to switch; a tool run on an unpriced shared model names `CORVIDINHO_LLM_MODEL`.
- Under a cap with a priced configured model and `CORVIDINHO_LLM_MODEL_READ` unpriced, doctor prints `[warn] spend: … model "<m>" has no known price, so read-tier runs stop and ask before calling the provider` and `/status` flags the read-tier model; with every tier priced or no per-tier key the lines read as before.
- No per-tier keys → every tier sends `CORVIDINHO_LLM_MODEL`; a blank per-tier key falls back; no model at all → no model (`model` `""` and the no-provider notice), never `gpt-4o-mini`.
- Fixture tests mock fetch; no live API.

### REQUIREMENT REQ-agent-085

Real-diff verify gate (AGENT-4, AGENT-15, issue #85). `runTask` SHALL always
snapshot the run's git project before the first attempt (there is no switch
that skips it, REQ-agent-003): `HEAD`, `git status --porcelain=v1 -z
--untracked-files=all --no-renames` and a fingerprint of every dirty or
untracked path (SHA-256 of the file up to 4 MiB while a 64 MiB content budget
lasts, stat identity past either, link target for a symlink, never followed).
In a talk worktree whose last run did not end verified the baseline is the
talk branch's merge-base instead (REQ-agent-015). Later diffs SHALL
fingerprint again only the paths dirty at the start (with the same kind); a
path that became dirty or untracked is a change by itself. The project root
is the nearest directory at or above the run cwd that holds `.git` (as in
REQ-agent-084); a cwd below the root SHALL read only its own subtree and
report paths relative to the cwd. After each attempt that ends without an
ask, a provider error or an abort, and before deciding whether to verify, the
real diff SHALL decide what changed (AGENT-15): `filesChanged` SHALL hold
only paths that differ from the baseline (paths changed between the baseline
`HEAD` and the current `HEAD`, including a first commit on an unborn `HEAD`;
paths that became dirty or untracked; paths already dirty whose status or
fingerprint changed; dirty paths that became clean), as a union across
attempts (REQ-agent-242). A path a tool reports changing that git does not
show (gitignored, inside a nested repo, a write that changed nothing, a path
outside the cwd) SHALL NOT be listed in `filesChanged`, but SHALL still run
the verify lane (fail closed), with one `Text` event per attempt that names
up to five such new paths (`Verify gate: N path(s) a tool reported changing
are not in the git diff (…), so they are not listed as changed, but verifying
anyway.`). An edit no tool reported (code-tier `shell-exec`, a delegate
worker, a commit made through a shell) SHALL run the verify lane and the run
ends `done` only when it passes, or fails plainly. Paths dirty before the run
and left untouched, and gitignored paths no tool claims, SHALL NOT count.
When the cwd is not inside a git work tree, or the start snapshot cannot be
read, the gate SHALL use tool-reported files (the behaviour before this
requirement), except that a run that called a tool whose file edits no result
reports SHALL verify anyway (REQ-agent-502). When the start snapshot was read
but a later diff cannot be, the gate SHALL fail closed: verify runs, one
`Text` event says the diff could not be read, and `filesChanged` keeps the
real-diff paths read so far (claims are not added). When the real diff has
paths no tool reported, one `Text` event SHALL say how many and name up to
five. At most `WORKSPACE_DIFF_MAX_FILES` (1000) real-diff paths per run SHALL
join `filesChanged` (the note then also says how many of all the changed
paths were listed), so the NDJSON `result` line stays under the parser's line
cap and a bridge still gets the summary; the gate is unaffected because
`filesChanged` is non-empty either way. An empty real diff with no ghost
claim SHALL end `done` with `verifySkipped=true` and the "no changes" note
(REQ-agent-003). A run whose model called no tool, and a run with no usable
provider (REQ-agent-179), changes nothing and SHALL report no files. Git SHALL run read-only through `runGit` (argv, no shell,
hooks off, repo-locating env stripped, discovery clamped to the root,
optional locks off) with fsmonitor off, and fingerprints are hashed in
process: nothing is written to the index or object store (the talk marker of
REQ-agent-015 lives in the worktree's own git dir, outside both). No flag,
environment variable, config key or slash command is added. `RunTaskOptions`
has a `workspaceDiff` test seam (like `verifyRunner`), not a product surface.

Acceptance Criteria
- In a temp git repo, an attempt that rewrites a tracked file outside the file tools and reports `filesChanged: []` runs verify; a failing lane ends `failed` (`verified=false`, `verifySkipped=false`, `filesChanged` names the file, no `done` state) and a passing lane ends `done` with `verified=true`.
- A new untracked file, a deleted tracked file, a same-size edit to a file already ` M` before the run, a commit made through a shell (clean tree, `HEAD` moved) and a first commit on an unborn `HEAD` each run verify and appear in `filesChanged`.
- A retry after a failed verify that edits only through a shell is verified again and gets the failure output as feedback (AGENT-4.a).
- A run whose cwd is a subdirectory of the repo counts an edit inside the cwd (reported relative to the cwd) and not one outside it.
- Dirt present before the run and left untouched, a change only under a gitignored path no tool claims, and a non-git cwd each skip verify (`verifySkipped=true`) when no tool reported files.
- A non-git cwd whose run called no Fledge command, shell or runner (e.g. only an allowlisted `github-pr-review`) still skips verify; one that called an allowlisted Fledge command runs verify (REQ-agent-502).
- A tracker whose diff cannot be read makes verify run and emits the "could not read the git working-tree diff" `Text` event.
- A tracker whose diff lists a claimed `package.json` and 30000 more paths adds 1000 paths to `filesChanged` (`package.json` first), the note counts the 30000 unreported paths and says 1000 of the 30001 were listed, and the NDJSON `result` line read in 64 KiB chunks still parses with the "Verification failed" summary.
- With the content budget spent, an already-dirty file left alone is not reported and an edit to it is (stat compare).
- The snapshot is always taken (the `workspaceDiff` seam is called once per run) and a real change is verified.
- A tool that claims `dist/out.js` (gitignored, written), `app.ts` (edited) and `ghost.ts` (never written) in a git repo: `filesChanged` is `["app.ts"]`, the lane runs, and one note names `dist/out.js, ghost.ts`; a run whose only change is such a claim still runs the lane, and its retry after the failed verify runs it again.
- A reply-only (fake provider) run and a no-provider run report `filesChanged: []`.
- End to end: the tool loop runs the real code-tier `shell-exec` with `printf broken > app.ts` in a temp git repo; its payload has no `filesChanged`, yet `runTask` runs verify once and ends `failed` with `filesChanged: ["app.ts"]`.

### REQUIREMENT REQ-agent-260

The repository SHALL ship a root `agent.3md` that validates with
`@corvidlabs/agent3md` `validateAgent`, exposes guidance-only skill planes
(no `tool=` bindings that duplicate the SAFE plugin registry), and is covered
by a bun smoke that `route`s and `get`s at least one playbook. The agent loop
SHALL NOT load this file for progressive disclosure until that is HI'd
separately (the captured AGENT-13 is model providers, REQ-agent-179, not
this).
Acceptance Criteria
- `validateAgent(readFileSync("agent.3md")).ok` is true in CI/tests.
- Every skill in `Agent.manifest().skills` has `tool: null`.
- `Agent.route` + `Agent.get` resolve a named guidance playbook (e.g. `discord-ask`).
- `package.json` lists `@corvidlabs/agent3md` as a dependency.
