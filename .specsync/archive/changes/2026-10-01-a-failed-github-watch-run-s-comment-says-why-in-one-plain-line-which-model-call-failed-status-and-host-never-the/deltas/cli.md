---
module: cli
change: a-failed-github-watch-run-s-comment-says-why-in-one-plain-line-which-model-call-failed-status-and-host-never-the
---

# Delta: cli (REQ-cli-079 says what a daemon schedule run with no model provider records since DISCORD-3.b)

## Modified

### REQUIREMENT REQ-cli-079

With no provider set, it says so at startup (AGENT-10, captured from Leif's
2026-09-28 interview), and there is no built-in default model (AGENT-13).
`corvidinho task run` SHALL print the no-provider notice for its tier
(REQ-agent-179) as its first stderr line in text output when the tier has no
usable provider, and in every output mode the run SHALL end `failed` with that
notice as its summary, call no provider and exit 1 (`--json` / the NDJSON
`result` frame carry it; machine modes keep stderr quiet). `corvidinho
daemon` SHALL add an `llm` field to `daemon.started` — the default tier's
provider as `<model> @ <host>` (non-openai kinds as `kind:model`), or `none` —
and, when any tier has no usable provider, SHALL log one `warn`
`llm.no_provider` line with the `notice`; its scheduled runs fail and call
no model, and like any failed schedule run (DISCORD-3.b, REQ-discord-032) the
run row's `summary` is the notice on a schedule the owner created and
`That didn't work.` on anyone else's (the daemon has no owner DM path, so it
never says the owner was told), the row's `error` and the `run.finished`
`error` read `failed (exit 1): <notice>`, and one `[scheduler] run failed
(schedule <id>, exit 1): <notice>` line is logged; the daemon posts to no
channel itself (a bridge's scheduler tick posts only a run's ask, such as the
auto-pause ask, REQ-discord-353), and this start-up line says why. `--help` SHALL list `CORVIDINHO_LLM_MODEL` as required with the
`openai:` / `ollama:` / `anthropic:` forms and no built-in default, plus
`CORVIDINHO_LLM_API_KEY` / `OPENAI_API_KEY`, `CORVIDINHO_LLM_BASE_URL`,
`OLLAMA_HOST` and `ANTHROPIC_API_KEY`; `.env.example`, `docs/DAEMON.md`
(including the Logs table) and `docs/DISCORD-GO-LIVE.md` (E.9, with the
upgrade note: a key-only setup must now set `CORVIDINHO_LLM_MODEL`) SHALL say
the same. No key value is printed.

Acceptance Criteria
- `task run --task hi` with only `OPENAI_API_KEY` set exits 1; its first stderr line is the "CORVIDINHO_LLM_MODEL is not set" notice; stdout has `state=failed` and the notice; no demo text and never the key value.
- `task run --json` in the same setup prints a `failed` result whose summary is the notice and `filesChanged` `[]`.
- The daemon with no model logs `daemon.started` with `llm: "none"` and a `warn` `llm.no_provider` line whose `notice` is the notice; with `CORVIDINHO_LLM_MODEL=ollama:qwen3` it logs `llm: "ollama:qwen3 @ 127.0.0.1:11434"` and no `llm.no_provider`.
- `docs/DAEMON.md`'s Logs table has a row for `llm.no_provider` (the docs test checks every logged event).
- A daemon with no model whose due schedules spawn the real `task run`: the owner's schedule's run row has `summary` = the notice and `error` = `failed (exit 1): <notice>`; another creator's has `summary` `That didn't work.` and the same `error`; each `run.finished` is a `warn` with `ok: false` and that `error`; `[scheduler] run failed (schedule <id>, exit 1): <notice>` is logged for each, never the bare `failed (exit 1)` line (`tests/daemon.no-provider-run.test.ts`).
