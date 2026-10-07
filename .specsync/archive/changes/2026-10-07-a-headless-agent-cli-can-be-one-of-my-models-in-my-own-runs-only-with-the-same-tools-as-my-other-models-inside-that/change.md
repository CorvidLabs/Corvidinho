---
id: a-headless-agent-cli-can-be-one-of-my-models-in-my-own-runs-only-with-the-same-tools-as-my-other-models-inside-that
state: accepted
type: feature
base_commit: b53cc4679baee4355db339e22f7929095b81d0a1---

# A headless agent CLI can be one of my models, in my own runs only, with the same tools as my other models, inside that talk's own worktree; other runs skip it and use my next model (AGENT-13, AGENT-13.a)

## Intent

A headless agent CLI can be one of my models, in my own runs only, with the same tools as my other models, inside that talk's own worktree; other runs skip it and use my next model (AGENT-13, AGENT-13.a)

## Affected Canonical Specs

- `agent`
- `plugins`
- `cli`

## Acceptance Criteria

- AGENT-13 (on main): 'I configure its models (OpenAI-compatible, Ollama, Anthropic or a headless agent CLI), and there's no built-in default.' AGENT-13.a (captured in this change's PR with hi from Leif's 2026-09-28 interview, round 17 on 2026-10-07): 'A headless agent CLI model runs only in my own runs, with the same tools as my other models, inside that talk's own worktree; other runs skip it and use my next model.' Observable outcomes: (1) the model lists (CORVIDINHO_LLM_MODEL, _READ/_TOOL/_CODE, the AGENT-11 chain, the AGENT-17.a order) take cli:<program> [args...] entries (argv split on whitespace, no shell); provider id cli:<program name>; never priced (its model id is its whole label), never the GITHUB-9 reviewer. (2) Where it may run it is the model for the whole attempt: only when the SAFE-3.a gate grants the shell (the owner's own chat / ask answer / /session start / /work in that talk's own worktree, or a local task run in the worktree it made), shell-exec is allowlisted, the tier is code with tool rounds, and no SAFE-13 injection tripped in the run; it runs with cwd = the talk worktree, the shell's env (verify-lane scrub, no GitHub/git creds SAFE-21.a, no cloud creds SAFE-21.b, CORVIDINHO_PROJECT_ROOT) plus only the keys the owner names in the optional CORVIDINHO_LLM_CLI_ENV (never git/GitHub/cloud/Discord/audit/search/acting keys); the prompt (persona, rules, project instructions, SpecSync briefing, task, verify feedback) on stdin; bounded by the model request timeout and the run's stop, its leftover process tree killed at exit; stdout (scrubbed) is the reply, a JSON object with a string result gives reply and usage. (3) Any other run (team/community, WATCH incl. owner-triggered, schedules, delegate/council workers, --here, non-git, outside the talk worktree, no shell allowlisted, non-code tier, after an injection) skips it without starting it: a skipped AGENT-11 hop (Text line, closing note '(model fallback: cli:x skipped (<why>), fell back to <next>)', modelFallback skipped: true, llm.fallback log) and one operator line per run; the next configured model runs; with none after it the run fails saying why. In the owner's run a CLI that fails (non-zero exit, timeout, cannot start, empty reply) fails over to the next model; a chat model failing mid-attempt hands the attempt to a CLI next in the chain. (4) Protected files (SAFE-2/2.a infra and SpecSync lifecycle records) the CLI changed are put back to their pre-turn state after each turn, with a note; one it cannot put back fails the attempt; its other edits go through the run's verify gate (real git diff, hi/SpecSync gates, lane, test evidence) with the lane's failure output in the next turn's prompt. (5) Spend: each turn is one call through the SAFE-8/14 guard; no known price, so under a covering cap it asks on the SAFE-16.a unknown-price card (a no runs nothing; approved, recorded status unknown with its tokens); usage counts like other models. Tests: tests/agent.headless-cli.test.ts (stand-in CLI script on a temp PATH, never a real agent CLI; temp git talk worktrees; fake chat provider; real task run spawns), failing on the base and passing on the branch.

## No-spec Rationale

Not applicable
