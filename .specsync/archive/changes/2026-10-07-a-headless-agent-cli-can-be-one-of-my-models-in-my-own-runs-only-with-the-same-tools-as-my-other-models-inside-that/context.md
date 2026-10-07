---
change: a-headless-agent-cli-can-be-one-of-my-models-in-my-own-runs-only-with-the-same-tools-as-my-other-models-inside-that
artifact: context
---

# Context

Part of AGENT-13 (#79/#80 providers). AGENT-13 ("I configure its models
(OpenAI-compatible, Ollama, Anthropic or a headless agent CLI), and there's no
built-in default.") was captured on main and built in part by #320, which left
the headless agent CLI kind out ("Not built: AGENT-13's headless agent CLI
kind"). Leif decided it in the 2026-09-28 interview record, round 17
(2026-10-07): "AGENT-13 headless agent CLI: owner runs, full tools — a
headless agent CLI model may run in the owner's own runs with the same tools
as other models, inside that talk's own worktree; other runs skip it and use
the next model." It is captured in this PR with `hi` as AGENT-13.a (own
commit).

What was wrong on main (85871fa4): `cli` was not a kind, so a `cli:claude -p`
entry parsed as an OpenAI-compatible model named `cli:claude -p`; every run —
the owner's and everyone else's — sent it to the chat endpoint as a model id
(a scratch probe recorded in testing.md shows a team run sending it and the
owner's run never starting the CLI).

Constraints: smallest change on the existing modules (the model chain and its
AGENT-11 fallback note, the SAFE-3.a shell gate, the shell's child env and
cloud / git scrubs, `spawnCapped`, the SAFE-8 spend guard, the run-start diff
tracker, SAFE-2's `isProtectedPath`); one optional env key only
(`CORVIDINHO_LLM_CLI_ENV`, the keys the CLI itself needs; unset = today's
behaviour of passing no LLM key); no schema change, slash command or CLI flag;
specs only through SpecSync; #232/#233 untouched; v1 off-chain; tests use a
stand-in CLI on PATH, never a real agent CLI. Out of scope: narrowing a CLI's
own built-in tools to Corvidinho's allowlist (not possible in general; see
design.md, pending Leif).
