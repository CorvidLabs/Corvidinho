---
module: discord
change: i-configure-the-models-openai-compatible-ollama-anthropic-with-no-built-in-default-and-it-says-so-when-none-is-set
---

# Delta: discord (the bridge says at start and in /status when no provider is set — AGENT-10, AGENT-13)

## Added

### REQUIREMENT REQ-discord-079

With no provider set, it says so at startup and in /status (AGENT-10,
captured from Leif's 2026-09-28 interview). The Discord bridge SHALL log one
`[discord] <notice>` line with `console.warn` at start (after the audit
line) when any tier has no usable model provider
(`providerNotice(env)`, REQ-agent-179) and nothing when every tier has one.
Runs it starts on such a tier fail with the notice as their answer
(REQ-agent-179). No new slash command, setting or schema change.

Acceptance Criteria
- A dry-run bridge started with no model logs `[discord] No model provider is configured: CORVIDINHO_LLM_MODEL is not set. …` once; with `CORVIDINHO_LLM_MODEL=ollama:qwen3` it logs no no-provider line.

## Modified

### REQUIREMENT REQ-discord-015

Ephemeral `/status` SHALL use the shared package version (no hardcoded bridge
constant) and SHALL include useful dogfood lines: Corvidinho vX.Y.Z; uptime;
protocol; channels count; sessions / work counts; the LLM line (AGENT-13 /
AGENT-10, REQ-agent-179): the default tier's model (`kind:model` for
non-openai kinds) + endpoint host when it has a usable provider (never a
key), else `LLM: none — <notice>`, followed by the no-provider notice when any
tier has none — the notice's tiers and setting names only in the owner's
`/status` (`StatusReportInput.ownerView`, re-checked by the handler like the
SAFE-14.a spend line), anyone else seeing only `No model provider is
configured.` (or `… for some runs.`), and never "demo stub"; the six
registered slash command names; optional git tip short SHA when available
without failing offline. Fixture tests SHALL cover formatting without a live
Discord token.

Acceptance Criteria
- Bridge starts with version from `src/version.ts` / package.json (no `BRIDGE_VERSION` literal).
- `/status` ephemeral body includes the fields above.
- With a model and its key in fixtures → model @ host (`LLM: gpt-test @ api.example.com`, `LLM: anthropic:<m> @ api.anthropic.com`, `LLM: ollama:<m> @ 127.0.0.1:11434`); never the key.
- With no model (or a key alone): the owner's `/status` has `LLM: none — No model provider is configured: CORVIDINHO_LLM_MODEL is not set. Set …`; anyone else's has `LLM: none — No model provider is configured.` and no `CORVIDINHO_` setting name; a model whose kind has no key reads `LLM: none — … <model> needs <KEY>, which is not set.` for the owner.
- Partly configured (only `_TOOL`): `LLM: ollama:<m> @ 127.0.0.1:11434 — No model provider is configured for some runs — read, code tiers: …` for the owner, `… — No model provider is configured for some runs.` for anyone else.
- Offline / missing git → omit tip or show without throwing.
- Mute/unmute unchanged; no new slash commands.
