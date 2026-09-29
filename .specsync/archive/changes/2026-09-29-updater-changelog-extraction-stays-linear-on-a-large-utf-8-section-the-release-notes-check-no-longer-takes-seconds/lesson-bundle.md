# Lesson bundle — updater-changelog-extraction-stays-linear-on-a-large-utf-8-section-the-release-notes-check-no-longer-takes-seconds

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Updater changelog extraction stays linear on a large UTF-8 section (the release notes check no longer takes seconds)
- **Kind**: BugFix
- **Paths**: scripts/lib/update-helpers.sh, tests/update-helpers.test.ts
- **Acceptance**: extract_changelog_section returns the same section as before; on a 400 KB UTF-8 section under LC_ALL=C.UTF-8 it finishes in under 2 s (tests/update-helpers.test.ts), and the 0.0.34 section extracts well inside the 5 s test timeout on CI

## Evidence

- Verification commit: `76e4b2291255b0114be45757428bf31e67dc3cda`
- Base commit: `ba1f819eab26eb829d1f0018240eac860cdf09d2`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

The v0.0.34 release PR (#298) failed CI's smoke job: `update-helpers.sh > extract_changelog_section finds 0.0.34` timed out after 5000 ms. The 0.0.34 CHANGELOG section is 68 KB, the first over 64 KB. On the runner the smaller 0.0.29–0.0.33 sections already took 130–620 ms. That is not a flake: the time grows with the square of the section size.

Root cause: `extract_changelog_section` in `scripts/lib/update-helpers.sh` checked emptiness with `[[ -n "${out// }" ]]`. Bash's pattern substitution is quadratic, and far slower in a UTF-8 locale. Measured locally with bash 5.2.21 on the 68 KB section: 15 ms under `LC_ALL=C` and 7040 ms under `LC_ALL=C.UTF-8`. CI runners and systemd boxes use a UTF-8 locale, so the updater's release-notes step on a box was slow too.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| (no spec change: updater helper performance) | `tests/update-helpers.test.ts` "extract_changelog_section stays fast on a large UTF-8 section" | With the old helper the test times out (5005 ms). With the fix it passes, and all update-helpers tests pass, including every "extract_changelog_section finds <version>" test with 0.0.34. |

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
