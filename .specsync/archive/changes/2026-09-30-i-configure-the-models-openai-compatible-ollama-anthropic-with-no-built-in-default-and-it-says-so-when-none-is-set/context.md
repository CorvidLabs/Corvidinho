---
change: i-configure-the-models-openai-compatible-ollama-anthropic-with-no-built-in-default-and-it-says-so-when-none-is-set
artifact: context
---

# Context

Issue #79 (M3 "Real dev teammate"), slice providers-1 of the M3/M4 plan.
AGENT-13 ("I configure its models (OpenAI-compatible, Ollama, Anthropic or a
headless agent CLI), and there's no built-in default.") and AGENT-10 ("With no
provider set, it says so at startup and in /status.") were confirmed by Leif
in the 2026-09-28 interview (round 2: "capture all four" provider criteria)
and are already captured in `hi/agent.md` on main, so this change captures
nothing new. It builds AGENT-10 and AGENT-13 without the headless agent CLI
kind (providers-2, waiting on a Leif decision), so AGENT-13 stays partial.

What was wrong on main (156cfa9):

- `src/agent/tier.ts` had `DEFAULT_LLM_MODEL = "gpt-4o-mini"`, and
  `modelForTier` fell back to it (REQ-agent-007 / REQ-agent-079 required it).
- With no `CORVIDINHO_LLM_API_KEY` / `OPENAI_API_KEY`, `createTaskExecute`
  answered from `demoExecute` ("demo task attempt N"), so a Discord or WATCH
  run with no provider replied with stub text, and `/status` said "LLM: demo
  stub". Nothing at startup (bridge, `github watch`, daemon, `task run`)
  said no provider was set.
- An entry could not name its provider: Ollama and Anthropic were reachable
  only by pointing `CORVIDINHO_LLM_BASE_URL` at them, and still needed a key
  (a keyless Ollama config read as "demo stub").
- `ANTHROPIC_API_KEY` was dropped from the verify lane and the shell but not
  in the SAFE-6 secret env names.

Constraints: specs only through SpecSync; the chain / fallback (AGENT-11,
providers-3), the idle timeout and turn cap (AGENT-12, providers-4) and the
`cli:` kind (providers-2) are later slices; #316 (approvals, schema v14)
and #317 (owner-only /status spend) stay as they are; `src/plugins/run.ts`
and `src/plugins/must-ask.ts` are not touched (must-ask-gate builds in
parallel); #232/#233 scope untouched; v1 is off-chain; no schema version,
slash command, CLI flag or /admin knob; CHANGELOG is written at release time,
so the operator migration note is in docs/DISCORD-GO-LIVE.md E.9 and README.
