# Lesson bundle — document-corvidinho-lineage-honoring-corvid-agent-and-merlin-ancestors

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Document Corvidinho lineage honoring corvid-agent and Merlin ancestors
- **Kind**: Documentation
- **Paths**: docs/ORIGIN.md, README.md
- **Acceptance**: docs/ORIGIN.md records the three-generation lineage (corvid-agent → merlin → Corvidinho) honoring ancestors without trashing them; README has a short Lineage section linking to it; local specsync check, change audit, and fledge lanes run verify --non-interactive stay green.

## Evidence

- Verification commit: `e51c8b23cae5d31922c1d0de39a05d04007a7098`
- Base commit: `c4a650aefb20e8bb1ee7e232cd23cf95a4355c75`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

After PR #1 merged (SDD ON, Bun + SpecSync Action CI), CoS/Leif asked for a
lineage doc that **honors** ancestors rather than trashing them:

1. **corvid-agent** — first; highly successful; paused when Anthropic framed
   Claude Max/subscription use as not OK for this API-shaped path → full API billing.
2. **merlin** — second; full API runner on SpecSync+Fledge; less traction.
   Steal plugins, prove-before-done, bridges — not iced desktop as primary.
3. **Corvidinho** — third/current; best of both; light; bots/VMs; any agent.

Also refresh README: short Lineage section + accurate SDD ON / CI notes
(no Fledge in Actions yet). Docs/ is a meaningful_paths entry, so this change
workspace is required even though no living module specs change.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
