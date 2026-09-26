---
change: call-registered-fledge-plugins-as-tools-issue-112-fledge-4-5-plugin-2-3-6-discover-the-project-s-fledge-plugins-via-the
artifact: context
---

# Context

Issue #112 (M6, build step 5): let Corvidinho call any Fledge plugin registered
for the project as a tool. Captured HI: `hi/fledge.md` FLEDGE-4 (discover and
call registered Fledge plugins, including ones I author), FLEDGE-5 (schemas
small; see when the tool surface blows the context budget), `hi/plugin.md`
PLUGIN-2 (danger + tier declared and enforced), PLUGIN-3 (add a project or
third-party Fledge plugin without a Corvidinho release), PLUGIN-6 (list what is
loaded with enough schema detail to see why context got expensive), plus
`hi/safe.md` SAFE-1/5/6.

Fledge 1.8.0 facts (read from the installed CLI and its crate source, not
assumed): plugins live in a per-user registry (`~/.config/fledge/plugins.toml`);
`fledge plugins list --json` returns `{schema_version: 1, plugins: [{name,
version, source, installed, commands[], pinned_ref, trust_tier, runtime}]}`;
`fledge plugins audit --json` adds `capabilities {exec, store, metadata,
filesystem, network}`; `fledge plugins run <command> [args...]` takes trailing
args verbatim (`allow_hyphen_values`) and hosts the fledge-v1 JSON-lines
protocol itself; `--non-interactive` is a global flag. The manifest has no
danger or tier field, and only wasm plugins are sandboxed.

Out of this slice (not captured HI): a `/status` context-budget line in
Discord, a separate per-project Fledge allowlist beyond `CORVIDINHO_ALLOWLIST`,
and offering allowlisted dangerous tools in the default catalog (agent
REQ-agent-009 keeps dangerous tools out by default).
