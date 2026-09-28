---
change: docs-refresh-after-audit-operator-docs-env-allowlist-templates-and-the-status-roadmap-match-shipped-code-actor-gate
artifact: context
---

# Context

A docs audit against `origin/main` at a422b6a (#191, package 0.0.22) and the
bridge end-to-end report ("Doc drift in docs/discord.md") found stale, wrong
and missing facts in the operator docs and templates: the slash gate order left
out the actor gate (REQ-discord-201), the ask-ping text said every ask mentions
the owner (AUTONOMY-4 says clarify addresses the requester), templates said
empty user/role lists are deny-all (both empty = anyone in an allowlisted
channel), dry-run was documented as working without a token, schema v7 instead
of v9, the WATCH spawn log default ignored `CORVIDINHO_DATA_DIR`, `.env.example`
missed every GitHub allowlist and WATCH env var, and STATUS.md still carried
"(this PR)" placeholders, a blank line that broke the ROADMAP table and no rows
for most of 0.0.11..0.0.27.

Main moved from 0.0.22 to 0.0.27 after the audit, so every finding was
re-checked against the code on `dbe37ce` before changing a line. Already fixed
on main and dropped: the CHANGELOG "Unreleased"/0.0.22 hardening gap (now the
0.0.23 section), the allowlist.example.toml multi-line warning (#203 made
multi-line arrays load), and the bridge report's "replying to a /work or
/session start ask does not continue the session" drift (#216). New facts from
the shipped slices are documented instead: a malformed allowlist file refuses
start and fails doctor (#203), daemon shutdown kills abandoned runs' process
trees (#185), interrupted replies (#194), `/status` spend line (SAFE-8).

No new HI and no behavior change: every command and env name cited exists in
`src/`, `plugins/` or `scripts/` (the new test checks `.env.example` both ways).
CHANGELOG version sections and package.json are untouched; only factual errors
inside existing CHANGELOG text were corrected.
