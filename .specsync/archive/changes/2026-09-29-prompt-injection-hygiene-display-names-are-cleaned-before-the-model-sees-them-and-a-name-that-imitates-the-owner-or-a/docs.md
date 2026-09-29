---
change: prompt-injection-hygiene-display-names-are-cleaned-before-the-model-sees-them-and-a-name-that-imitates-the-owner-or-a
artifact: docs
---

# Docs

- `docs/discord.md`: criteria line names SAFE-11..13; new "Untrusted text and
  injection attempts (SAFE-11/12/13, #71)" section (names cleaned and
  `name_clash`, what is fenced, the detector's categories in plain words, what
  a hit does on chat / slash / tool results, the audit row, always on); source
  map line; the identity-inject source-map line says names are cleaned.
- `docs/WATCH.md`: untrusted title / body fence and the refusal comment,
  owner @mention, audit row, summary owner line.
- `docs/DISCORD-GO-LIVE.md`: E.6.a (what operators see; nothing to
  configure; `[owner] github_login` for WATCH mentions); E.7 lists
  `injection-suspected` rows in the audit chain.
- The docs describe the heuristics without quoting payload phrases, so a
  `github-docs-read` of them never trips the detector.
- Specs: `specs/agent/agent.spec.md`, `specs/discord/discord.spec.md`,
  `specs/watch/watch.spec.md`, `specs/plugins/plugins.spec.md`,
  `specs/cli/cli.spec.md` (public API, invariants, scenarios, error cases,
  `files:` + `src/agent/untrusted.ts`, `src/discord/injection-guard.ts`,
  `tests/safe.injection.test.ts`), `specs/*/testing.md`.
- No new user config key, env var, CLI flag or slash command.
