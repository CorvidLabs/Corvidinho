# Lesson bundle — add-living-roadmap-section-to-status-md-honest-done-vs-next-tied-to-prs-issues-leif-config-moments-discord-gh-mention

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Add living ROADMAP section to STATUS.md: honest done-vs-next tied to PRs/issues, Leif config moments, Discord/GH mention expectations, phased milestones; refresh short Next bullets to point at ROADMAP
- **Kind**: Documentation
- **Paths**: STATUS.md
- **Acceptance**: STATUS.md has a living ROADMAP with Done (cite PRs/issues), In flight/next, Leif config moments (PREPARE NOW vs WAIT for HEAR #5 vs GH secrets timing), Discord @bot expectations after #5, GH mention→session tracked by #19 (typed reads only until then), phased milestones 1–7; short Next bullets point at ROADMAP; Allowlists and Verify sections kept; local bun smoke + Spec Sync / fledge verify green

## Evidence

- Verification commit: `39675055b46e50f9ed6d5c212b2492163e5b7e19`
- Base commit: `b55ff627783de1b7d5ce5c0ed9c75c618d9b546b`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

Leif/CoS need an honest living **ROADMAP** in `STATUS.md` so bots and humans
know what landed vs what is next — especially:

- When Discord @bot replies work (only after HEAR #5 + token + allowlists)
- When GitHub @mentions get a session (not yet — typed reads only; tracked by #19)
- What Leif can prepare now vs wait for (config moments; secrets stay out of repo)
- First DOGFOOD flip: CoS/Corvidinho-bot (Grok) shells into headless `corvidinho`
  CLI for real work (bridges = other callers; not a product-UI wait)
- Attribution footer (“Made with Corvidinho”, #20) can land ASAP even pre-runner

Foundation already merged: BOOT #1, ORIGIN #2, plugins+GH reads #15 (#6+#4),
allowlists #18 (#16), prove-before-done #17 (#7). Do not invent HI/AC. Keep
existing Allowlists + Verify sections; refresh short Next bullets to point here.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
