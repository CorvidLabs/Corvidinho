---
change: a-headless-agent-cli-can-be-one-of-my-models-in-my-own-runs-only-with-the-same-tools-as-my-other-models-inside-that
artifact: docs
---

# Docs

- `docs/DISCORD-GO-LIVE.md` E.9: the kinds table gains `cli`; "A headless
  agent CLI as a model is not built yet." is replaced by what it is, where it
  runs (and is skipped), what it gets (cwd, env, `CORVIDINHO_LLM_CLI_ENV`,
  bounds), protected files put back, the verify gate, spend, and exactly what
  it can still do that the shell's own checks would have stopped.
- `README.md`: the model line names `cli:<command>` and where it runs.
- `docs/DAEMON.md`: a `cli:` entry never runs in a schedule (skipped, next
  entry).
- Specs: `specs/agent/agent.spec.md` (Purpose, Public API, an invariant, a
  scenario, four error-case rows; files list gains `src/agent/headless-cli.ts`
  and `tests/agent.headless-cli.test.ts`), `specs/plugins/plugins.spec.md`
  (`spawnCapped` options, the reviewer), both modules' `testing.md`.
- `hi/agent.md` / `INTENT.md`: AGENT-13.a captured with `hi` (separate commit).
- No CHANGELOG, STATUS or package.json edit: the release PR writes them.
